-- 集滿 12 張卡片後可產生的一次性免費飲品兌換碼

CREATE TABLE IF NOT EXISTS collection_reward_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_type TEXT NOT NULL DEFAULT 'collection_free_drink',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'redeemed', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  redeemed_at TIMESTAMPTZ,
  redeemed_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  redeemed_by_staff_name TEXT,
  redeem_discount INTEGER NOT NULL DEFAULT 0,
  selected_item_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS collection_reward_codes_pending_user_idx
  ON collection_reward_codes(user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS collection_reward_codes_status_idx
  ON collection_reward_codes(status, created_at DESC);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS reward_code TEXT,
  ADD COLUMN IF NOT EXISTS reward_type TEXT,
  ADD COLUMN IF NOT EXISTS reward_discount INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_item_name TEXT;

ALTER TABLE collection_reward_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only collection reward codes" ON collection_reward_codes;

CREATE POLICY "Service role only collection reward codes" ON collection_reward_codes
  USING (auth.role() = 'service_role');