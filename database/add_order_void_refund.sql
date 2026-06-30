-- ============================================================
-- 儲值金訂單退款作廢（Void & Refund）功能遷移
-- 在 Supabase SQL Editor 執行此檔案（一次性）
-- 設計稿：.claude/PRPs/wallet-order-void-refund.md
-- ============================================================

-- 1. wallet_transactions.type 放行 'refund'
--    注意：須保留轉帳功能既有類型（transfer_out/transfer_in/transfer_refund，見 add_wallet_transfer.sql），
--    否則現存資料會違反新約束（23514）。
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;
ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN ('topup', 'deduct', 'refund', 'transfer_out', 'transfer_in', 'transfer_refund'));

-- 2. orders 軟刪除欄位（作廢單保留於資料庫以利對帳/稽核）
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'active';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided_at     TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS voided_reason TEXT;

-- status 值域：'active'（預設） / 'voided'
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- 3. Atomic 退款作廢 RPC（仿 deduct_wallet，FOR UPDATE 鎖列防 race，雙重防重複退款）
CREATE OR REPLACE FUNCTION refund_order_wallet(
  p_order_id UUID,
  p_reason   TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_qr_raw   JSONB;     -- orders.qr_codes 為 JSONB
  v_qr_codes TEXT[];    -- 轉為 text[] 以利 order_ref = ANY(...) 比對
  v_status   TEXT;
  v_user_id  UUID;
  v_amount   INTEGER;   -- 取絕對值後的退款額
  v_new_bal  INTEGER;
BEGIN
  -- 1. 鎖訂單列（qr_codes 為 JSONB，先原樣接住）
  SELECT qr_codes, status INTO v_qr_raw, v_status
    FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN '{"success":false,"error":"order_not_found"}'::JSONB;
  END IF;
  IF v_status = 'voided' THEN
    RETURN '{"success":false,"error":"already_voided"}'::JSONB;
  END IF;

  -- JSONB 陣列 → text[]（FOR UPDATE 與 set-returning function 分兩步，避免衝突）
  v_qr_codes := ARRAY(SELECT jsonb_array_elements_text(v_qr_raw));

  -- 2. 找該訂單的扣款紀錄（order_ref ∈ qr_codes 且 type='deduct'）
  SELECT user_id, SUM(-amount) INTO v_user_id, v_amount
    FROM wallet_transactions
    WHERE type = 'deduct' AND order_ref = ANY(v_qr_codes)
    GROUP BY user_id
    LIMIT 1;

  -- 3. 查無扣款（異常資料）：標 voided 但不退款
  IF v_user_id IS NULL THEN
    UPDATE orders
      SET status = 'voided', voided_at = NOW(),
          voided_reason = COALESCE(p_reason, 'no_deduction')
      WHERE id = p_order_id;
    RETURN '{"success":false,"error":"no_deduction"}'::JSONB;
  END IF;

  -- 4. 防重複退款
  IF EXISTS (
    SELECT 1 FROM wallet_transactions
    WHERE type = 'refund' AND order_ref = ANY(v_qr_codes)
  ) THEN
    RETURN '{"success":false,"error":"already_refunded"}'::JSONB;
  END IF;

  -- 5. 退回原扣款 user 的錢包（非 order.customer 欄位，避免退錯人）
  UPDATE wallets
    SET balance = balance + v_amount, updated_at = NOW()
    WHERE user_id = v_user_id
    RETURNING balance INTO v_new_bal;

  -- 6. 寫退款交易（order_ref 用第一個 qr code 連回原訂單）
  INSERT INTO wallet_transactions (user_id, amount, type, note, order_ref)
    VALUES (v_user_id, v_amount, 'refund',
            COALESCE(p_reason, '訂單退款作廢'), v_qr_codes[1]);

  -- 7. 標記訂單作廢
  UPDATE orders
    SET status = 'voided', voided_at = NOW(),
        voided_reason = COALESCE(p_reason, '退款作廢')
    WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success',         true,
    'refunded_amount', v_amount,
    'new_balance',     v_new_bal,
    'user_id',         v_user_id
  );
END;
$$;
