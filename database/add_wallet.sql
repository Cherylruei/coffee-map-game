-- ============================================================
-- 現金儲值功能遷移
-- 在 Supabase SQL Editor 執行此檔案（一次性）
-- ============================================================

-- 1. 用戶錢包（每人一筆，餘額不可為負）
CREATE TABLE IF NOT EXISTS wallets (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  balance    INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 交易明細（正數=儲值，負數=扣款）
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  amount     INTEGER NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('topup', 'deduct')),
  note       TEXT,
  order_ref  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 儲值 QR Code（一次性，掃描後自動入帳）
CREATE TABLE IF NOT EXISTS topup_qr_codes (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code       TEXT UNIQUE NOT NULL,
  amount     INTEGER NOT NULL CHECK (amount > 0),
  used       BOOLEAN DEFAULT FALSE,
  used_by    UUID REFERENCES users(id),
  used_at    TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 現有 qr_codes 表新增 wallet_amount（點單時選擇錢包支付）
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS wallet_amount INTEGER;

-- 5. Atomic 扣款 RPC（FOR UPDATE 鎖定，防止 race condition）
CREATE OR REPLACE FUNCTION deduct_wallet(
  p_user_id  UUID,
  p_amount   INTEGER,
  p_note     TEXT,
  p_order_ref TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- 鎖定該用戶的錢包列
  SELECT balance INTO v_balance
    FROM wallets
    WHERE user_id = p_user_id
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

  UPDATE wallets
    SET balance    = balance - p_amount,
        updated_at = NOW()
    WHERE user_id = p_user_id;

  INSERT INTO wallet_transactions (user_id, amount, type, note, order_ref)
    VALUES (p_user_id, -p_amount, 'deduct', p_note, p_order_ref);

  RETURN jsonb_build_object(
    'success',     true,
    'new_balance', v_balance - p_amount
  );
END;
$$;

-- 6. RLS（Row Level Security）
ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE topup_qr_codes ENABLE ROW LEVEL SECURITY;

-- 前端 JS client 只能讀自己的錢包（後端用 service key bypass）
DROP POLICY IF EXISTS "users_read_own_wallet" ON wallets;
CREATE POLICY "users_read_own_wallet" ON wallets
  FOR SELECT USING (auth.uid()::TEXT = user_id::TEXT);

DROP POLICY IF EXISTS "users_read_own_transactions" ON wallet_transactions;
CREATE POLICY "users_read_own_transactions" ON wallet_transactions
  FOR SELECT USING (auth.uid()::TEXT = user_id::TEXT);

-- 索引（查詢效能）
CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id ON wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_topup_qr_codes_code ON topup_qr_codes(code);
