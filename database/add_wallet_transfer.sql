-- ============================================================
-- 儲值金轉帳功能遷移
-- 在 Supabase SQL Editor 執行此檔案（一次性）
-- ============================================================

-- 1. 建立 wallet_transfers 轉帳記錄表
CREATE TABLE IF NOT EXISTS wallet_transfers (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token        TEXT UNIQUE NOT NULL,
  from_user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  amount       INTEGER NOT NULL CHECK (amount >= 10 AND amount <= 5000),
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'claimed', 'cancelled', 'expired')),
  claimed_by   UUID REFERENCES users(id),
  claimed_at   TIMESTAMPTZ,
  expires_at   TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transfers_token       ON wallet_transfers(token);
CREATE INDEX IF NOT EXISTS idx_wallet_transfers_from_user   ON wallet_transfers(from_user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transfers_status      ON wallet_transfers(status);
CREATE INDEX IF NOT EXISTS idx_wallet_transfers_expires_at  ON wallet_transfers(expires_at);

-- 2. 擴充 wallet_transactions.type 的 CHECK 約束，新增轉帳相關類型
--    （先刪除再重建，以免欄位限制阻擋 INSERT）
ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_type_check;

ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
    CHECK (type IN ('topup', 'deduct', 'transfer_out', 'transfer_in', 'transfer_refund'));

-- ============================================================
-- 3. RPC: create_wallet_transfer
--    原子性地從發送方扣款並建立轉帳記錄
-- ============================================================
CREATE OR REPLACE FUNCTION create_wallet_transfer(
  p_from_user_id UUID,
  p_amount       INTEGER,
  p_token        TEXT,
  p_expires_at   TIMESTAMPTZ
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- 鎖定發送方錢包（FOR UPDATE 防 race condition）
  SELECT balance INTO v_balance
    FROM wallets
    WHERE user_id = p_from_user_id
    FOR UPDATE;

  IF v_balance IS NULL THEN
    RETURN '{"success":false,"error":"wallet_not_found"}'::JSONB;
  END IF;

  IF v_balance < p_amount THEN
    RETURN jsonb_build_object(
      'success',  false,
      'error',    'insufficient_balance',
      'balance',  v_balance,
      'required', p_amount
    );
  END IF;

  -- 扣除發送方餘額
  UPDATE wallets
    SET balance    = balance - p_amount,
        updated_at = NOW()
    WHERE user_id = p_from_user_id;

  -- 記錄轉出交易
  INSERT INTO wallet_transactions (user_id, amount, type, note)
    VALUES (p_from_user_id, -p_amount, 'transfer_out', '轉帳給他人（待領取）');

  -- 建立轉帳記錄
  INSERT INTO wallet_transfers (token, from_user_id, amount, status, expires_at)
    VALUES (p_token, p_from_user_id, p_amount, 'pending', p_expires_at);

  RETURN jsonb_build_object(
    'success',     true,
    'new_balance', v_balance - p_amount
  );
END;
$$;

-- ============================================================
-- 4. RPC: claim_wallet_transfer
--    原子性地領取轉帳：若已過期自動退款給原發送方
-- ============================================================
CREATE OR REPLACE FUNCTION claim_wallet_transfer(
  p_token      TEXT,
  p_claimer_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_transfer wallet_transfers%ROWTYPE;
BEGIN
  SELECT * INTO v_transfer
    FROM wallet_transfers
    WHERE token = p_token
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN '{"success":false,"error":"not_found"}'::JSONB;
  END IF;

  IF v_transfer.status = 'claimed' THEN
    RETURN '{"success":false,"error":"already_claimed"}'::JSONB;
  END IF;

  IF v_transfer.status = 'cancelled' THEN
    RETURN '{"success":false,"error":"cancelled"}'::JSONB;
  END IF;

  IF v_transfer.status = 'expired' THEN
    RETURN '{"success":false,"error":"expired"}'::JSONB;
  END IF;

  -- 若 pending 但已超過有效期 → 退款給原發送方並標記為 expired
  IF v_transfer.expires_at < NOW() THEN
    UPDATE wallets
      SET balance    = balance + v_transfer.amount,
          updated_at = NOW()
      WHERE user_id = v_transfer.from_user_id;

    INSERT INTO wallet_transactions (user_id, amount, type, note)
      VALUES (v_transfer.from_user_id, v_transfer.amount, 'transfer_refund', '轉帳連結已過期，自動退款');

    UPDATE wallet_transfers
      SET status = 'expired'
      WHERE token = p_token;

    RETURN '{"success":false,"error":"expired"}'::JSONB;
  END IF;

  -- 不允許自轉
  IF v_transfer.from_user_id = p_claimer_id THEN
    RETURN '{"success":false,"error":"self_claim"}'::JSONB;
  END IF;

  -- 將金額存入收款方（若尚無錢包則自動建立）
  INSERT INTO wallets (user_id, balance)
    VALUES (p_claimer_id, v_transfer.amount)
    ON CONFLICT (user_id)
    DO UPDATE SET balance    = wallets.balance + v_transfer.amount,
                  updated_at = NOW();

  -- 記錄收款交易
  INSERT INTO wallet_transactions (user_id, amount, type, note)
    VALUES (p_claimer_id, v_transfer.amount, 'transfer_in', '收到儲值金轉帳');

  -- 標記為已領取
  UPDATE wallet_transfers
    SET status     = 'claimed',
        claimed_by = p_claimer_id,
        claimed_at = NOW()
    WHERE token = p_token;

  RETURN jsonb_build_object(
    'success', true,
    'amount',  v_transfer.amount
  );
END;
$$;

-- ============================================================
-- 5. RPC: cancel_wallet_transfer
--    發送方取消尚未領取的轉帳，退款回帳
-- ============================================================
CREATE OR REPLACE FUNCTION cancel_wallet_transfer(
  p_token   TEXT,
  p_user_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_transfer wallet_transfers%ROWTYPE;
BEGIN
  SELECT * INTO v_transfer
    FROM wallet_transfers
    WHERE token = p_token
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN '{"success":false,"error":"not_found"}'::JSONB;
  END IF;

  IF v_transfer.from_user_id <> p_user_id THEN
    RETURN '{"success":false,"error":"unauthorized"}'::JSONB;
  END IF;

  IF v_transfer.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', v_transfer.status);
  END IF;

  -- 退款給發送方
  UPDATE wallets
    SET balance    = balance + v_transfer.amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

  -- 記錄退款交易
  INSERT INTO wallet_transactions (user_id, amount, type, note)
    VALUES (p_user_id, v_transfer.amount, 'transfer_refund', '取消轉帳，退回儲值金');

  -- 標記為已取消
  UPDATE wallet_transfers
    SET status = 'cancelled'
    WHERE token = p_token;

  RETURN jsonb_build_object(
    'success',  true,
    'refunded', v_transfer.amount
  );
END;
$$;
