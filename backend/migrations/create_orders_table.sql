-- 點單紀錄表
-- 在 Supabase SQL Editor 執行此檔案

CREATE TABLE IF NOT EXISTS orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_line_id TEXT,                          -- 員工 LINE userId（略過登入時為 null）
  staff_name    TEXT NOT NULL DEFAULT '未知員工',
  items         JSONB NOT NULL DEFAULT '[]',   -- [{ name, qty, price }]
  total_amount  INTEGER NOT NULL DEFAULT 0,
  qr_codes      JSONB NOT NULL DEFAULT '[]',   -- [code, ...]
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 建立索引加速查詢
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_staff_line_id_idx ON orders (staff_line_id);

-- RLS：只允許 service_role（後端）存取
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON orders
  USING (auth.role() = 'service_role');
