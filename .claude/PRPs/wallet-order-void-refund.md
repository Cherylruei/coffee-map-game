# Phase 2 設計稿 — 儲值金訂單退款作廢（Void & Refund）

> **實作狀態（2026-06-30）：程式碼已全數實作並通過型別/語法檢查。**
> ⚠️ **尚待人工執行**：`database/add_order_void_refund.sql` 需在 Supabase SQL Editor 執行，
> migration 套用前 void 端點會失敗（找不到 `refund_order_wallet` RPC / `status` 欄位）。
> 另記一個既有 bug：月報表「消費統計」查 `type='spend'`，但實際扣款為 `type='deduct'`，
> 該統計本就抓不到值（與本次無關，建議後續一併修）。

## 背景

儲值金（wallet）是**真實金流**：顧客掃 order QR 時，`claim_order_qr` RPC 原子性扣款並寫入
`wallet_transactions`（`type='deduct'`, `amount` 為負, `order_ref` = QR code 字串）。
`orders.payment_method` 對現金/LINE Pay 只是標籤，但對 wallet 代表已發生的扣款。

Phase 1 已封鎖編輯路徑（不可改進/改離 wallet、wallet 訂單整筆鎖定）。
Phase 2 提供唯一合法的「更動」管道：**退款作廢 + 重新開單**，取代硬刪除，保住餘額與稽核軌跡。

## 資料關聯（已確認）

| 物件 | 關鍵欄位 | 連結方式 |
|---|---|---|
| `orders` | `qr_codes[]`（TEXT 陣列）, `payment_method`, `status`(新增) | — |
| `wallet_transactions` | `user_id`, `amount`, `type`, `order_ref` | `order_ref ∈ orders.qr_codes` 且 `type='deduct'` |
| `wallets` | `user_id`, `balance`(CHECK ≥ 0) | 退款 user = deduct 紀錄的 `user_id`（非 order.customer 欄位，避免退錯人） |

## 變更總覽

```
DB     ├─ migration A: wallet_transactions.type 允許 'refund'
       └─ migration B: orders 加 status / voided_at / voided_reason
RPC    └─ refund_order_wallet(p_order_id, p_reason)  ── atomic, 仿 deduct_wallet
API    ├─ POST   /api/admin/order/:id/void   ── 新增，呼叫 RPC
       └─ DELETE /api/admin/order/:id        ── wallet 訂單改擋下，導去 void
前端    └─ OrderEditModal: wallet 訂單「刪除」→「退款作廢」按鈕
報表    └─ 所有 orders 查詢過濾 status='active'；wallet 統計納入 refund
```

---

## Step 1 — Migration

`database/add_order_void_refund.sql`（一次性於 Supabase SQL Editor 執行）

```sql
-- A. 放行 refund 交易類型
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('topup','deduct','refund'));

-- B. 訂單軟刪除欄位
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'active';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided_at     TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided_reason TEXT;

-- 查詢效能（報表常以 status 過濾）
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
```

`status` 值域：`'active'`（預設） / `'voided'`。

---

## Step 2 — Atomic 退款 RPC

`refund_order_wallet(p_order_id UUID, p_reason TEXT)` — 全程單一 transaction，`FOR UPDATE` 鎖列防 race。

### 回傳合約

| 情境 | 回傳 |
|---|---|
| 成功 | `{success:true, refunded_amount, new_balance, user_id}` |
| 已作廢 | `{success:false, error:'already_voided'}` |
| 已退款（重複） | `{success:false, error:'already_refunded'}` |
| 查無扣款（其實沒扣到錢） | `{success:false, error:'no_deduction'}`（呼叫端決定是否仍標 voided） |
| 訂單不存在 | `{success:false, error:'order_not_found'}` |

### 邏輯

```sql
CREATE OR REPLACE FUNCTION refund_order_wallet(p_order_id UUID, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_qr_codes  TEXT[];
  v_status    TEXT;
  v_user_id   UUID;
  v_amount    INTEGER;   -- 取絕對值後的退款額
  v_new_bal   INTEGER;
BEGIN
  -- 1. 鎖訂單
  SELECT qr_codes, status INTO v_qr_codes, v_status
    FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN '{"success":false,"error":"order_not_found"}'::JSONB;
  END IF;
  IF v_status = 'voided' THEN
    RETURN '{"success":false,"error":"already_voided"}'::JSONB;
  END IF;

  -- 2. 找該訂單的扣款紀錄（order_ref ∈ qr_codes, type='deduct'）
  SELECT user_id, SUM(-amount) INTO v_user_id, v_amount
    FROM wallet_transactions
    WHERE type = 'deduct' AND order_ref = ANY(v_qr_codes)
    GROUP BY user_id
    LIMIT 1;

  IF v_user_id IS NULL THEN
    -- 沒實際扣款（理論上不該發生於 wallet 訂單）：標 voided 但不退款
    UPDATE orders
      SET status='voided', voided_at=NOW(), voided_reason=COALESCE(p_reason,'no_deduction')
      WHERE id = p_order_id;
    RETURN '{"success":false,"error":"no_deduction"}'::JSONB;
  END IF;

  -- 3. 防重複退款
  IF EXISTS (
    SELECT 1 FROM wallet_transactions
    WHERE type='refund' AND order_ref = ANY(v_qr_codes)
  ) THEN
    RETURN '{"success":false,"error":"already_refunded"}'::JSONB;
  END IF;

  -- 4. 退回原扣款 user 的錢包
  UPDATE wallets SET balance = balance + v_amount, updated_at = NOW()
    WHERE user_id = v_user_id
    RETURNING balance INTO v_new_bal;

  -- 5. 寫退款交易（order_ref 用第一個 qr code 連回）
  INSERT INTO wallet_transactions (user_id, amount, type, note, order_ref)
    VALUES (v_user_id, v_amount, 'refund',
            COALESCE(p_reason,'訂單退款作廢'), v_qr_codes[1]);

  -- 6. 標記訂單作廢
  UPDATE orders
    SET status='voided', voided_at=NOW(), voided_reason=COALESCE(p_reason,'退款作廢')
    WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'refunded_amount', v_amount,
    'new_balance', v_new_bal,
    'user_id', v_user_id
  );
END;
$$;
```

> **冪等性**：步驟 1 的 `status='voided'` 檢查 + 步驟 3 的 refund 重複檢查雙重防護，
> 重複呼叫不會二次退款。

---

## Step 3 — 後端 API

### 新增 `POST /api/admin/order/:id/void`

```js
app.post('/api/admin/order/:id/void', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const { data: result, error } = await supabase.rpc('refund_order_wallet', {
      p_order_id: id,
      p_reason: reason || '退款作廢',
    });
    if (error) throw error;

    if (!result.success) {
      const msgMap = {
        order_not_found:  '查無此訂單',
        already_voided:   '此訂單已作廢',
        already_refunded: '此訂單已退款，請勿重複操作',
        no_deduction:     '查無扣款紀錄，已標記作廢但未退款',
      };
      const status = result.error === 'order_not_found' ? 404 : 409;
      return res.status(status).json({ success: false, message: msgMap[result.error] || '退款失敗' });
    }

    res.json({
      success: true,
      refundedAmount: result.refunded_amount,
      newBalance: result.new_balance,
      message: `已退款 $${result.refunded_amount} 至顧客錢包`,
    });
  } catch (error) {
    console.error('Order void error:', error);
    res.status(500).json({ success: false, message: '退款作廢失敗' });
  }
});
```

### 改 `DELETE /api/admin/order/:id`（server-supabase.js:1298）

wallet 訂單禁止硬刪（會遺失餘額對帳）：

```js
const { data: ord } = await supabase
  .from('orders').select('payment_method').eq('id', id).single();
if (ord?.payment_method === 'wallet') {
  return res.status(409).json({
    success: false, code: 'WALLET_USE_VOID',
    message: '儲值金訂單請改用「退款作廢」，不可直接刪除',
  });
}
// …現金 / LINE Pay 維持原 .delete() 行為
```

---

## Step 4 — 前端 OrderEditModal

- `isWalletOrder` 時，底部「🗑 刪除整筆訂單」改為「↩️ 退款作廢」。
- 點擊 → 二次確認（顯示將退款金額 `$orderTotal`）→ `POST /api/admin/order/:id/void`。
- 成功 toast：「已退款 $X 至顧客錢包」→ `onDeleted()`（沿用既有列表刷新）。
- **重開不需新程式**：作廢後店員走原本開單 + 產生 order QR 流程，顧客重新掃碼扣款。

```tsx
async function handleVoid() {
  if (!orderId) return;
  const data = await api<{ success: boolean; refundedAmount?: number }>(
    `/api/admin/order/${orderId}/void`, sessionToken,
    { method: 'POST', body: JSON.stringify({ reason: '退款作廢' }) }
  );
  if (data?.success) {
    showDialog({ type: 'success', title: `已退款 $${data.refundedAmount} 至顧客錢包` });
    onDeleted();
  } else {
    showDialog({ type: 'error', title: '退款作廢失敗，請稍後再試' });
  }
}
```

---

## Step 5 — 報表口徑（收尾，勿漏）

| 位置 | 調整 |
|---|---|
| `GET /api/admin/stats/today` (server-supabase.js:1318) | 查詢加 `.eq('status','active')`，作廢單不計營收 |
| 月報表 `R1` (server-supabase.js:2056) | 同上；wallet 統計把 `type='refund'` 從淨額扣回 |
| `GET /api/admin/orders` | 列表可顯示作廢單（灰階標記）或預設過濾，依 UX 決定 |
| stats/today 付款拆分 | 目前僅算 cash/line_pay；wallet 營收應改由 `wallet_transactions`（deduct − refund）統計 |

---

## 上線順序與風險

1. **Migration 先行**：A、B 皆為加欄位/放寬約束，向後相容，無資料破壞風險。
2. **RPC 單獨驗證**：先在 Supabase 用一筆測試訂單跑 `refund_order_wallet`，確認餘額與交易正確、重複呼叫冪等。
3. **API + 前端**：接上 void 端點與按鈕。
4. **報表口徑**：最後調整，避免作廢單污染營收數字。

### 邊界案例檢查清單

- [ ] 一張 wallet 訂單對多個 qr code → `SUM` 聚合正確
- [ ] 重複點「退款作廢」→ `already_refunded`，不二次退款
- [ ] 已作廢訂單再被 DELETE → 維持 voided，不誤刪
- [ ] wallet 訂單實際沒扣到錢（異常資料）→ `no_deduction`，標 voided 不退款
- [ ] 退款對象為 deduct 的 `user_id`，非 `order.customer_line_id`
