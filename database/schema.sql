-- 咖啡地圖收集遊戲 - Supabase 資料庫結構
-- 在 Supabase SQL Editor 中執行此腳本

-- 1. 建立 users 表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_user_id VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  picture_url TEXT,
  share_tokens INTEGER DEFAULT 3,
  draw_chances INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 建立 collection 表（收藏記錄）
CREATE TABLE IF NOT EXISTS collection (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL CHECK (card_id BETWEEN 1 AND 12),
  count INTEGER DEFAULT 1 CHECK (count >= 0),
  obtained_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

-- 3. 建立 gacha_history 表（抽卡歷史）
CREATE TABLE IF NOT EXISTS gacha_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL CHECK (card_id BETWEEN 1 AND 12),
  qr_code VARCHAR(50),
  is_new BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 建立 qr_codes 表
CREATE TABLE IF NOT EXISTS qr_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(50) UNIQUE NOT NULL,
  cup_count INTEGER DEFAULT 1,
  used BOOLEAN DEFAULT false,
  used_by UUID REFERENCES users(id),
  used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 建立 shares 表（分享記錄）
CREATE TABLE IF NOT EXISTS shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  share_code VARCHAR(50) UNIQUE NOT NULL,
  from_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  card_id INTEGER NOT NULL CHECK (card_id BETWEEN 1 AND 12),
  claimed BOOLEAN DEFAULT false,
  claimed_by UUID REFERENCES users(id),
  claimed_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 建立 orders 表（點單紀錄）
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_line_id VARCHAR(100),
  staff_name VARCHAR(100) NOT NULL,
  items JSONB NOT NULL,                          -- [{ name, qty, price, doubleShot }]
  total_amount INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  payment_method VARCHAR(20) NOT NULL DEFAULT 'cash',  -- 'cash' | 'line_pay'
  employee_id VARCHAR(50),                       -- 顧客員編（選填）
  qr_codes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. 建立 inventory 表（每日盤點）
CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  coffee_beans_bags INTEGER NOT NULL,
  coffee_beans_grams INTEGER NOT NULL,
  milk_bottles INTEGER NOT NULL,
  milk_ml INTEGER NOT NULL,
  completed_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 建立索引以提升查詢效能
CREATE INDEX IF NOT EXISTS idx_users_line_user_id ON users(line_user_id);
CREATE INDEX IF NOT EXISTS idx_collection_user_id ON collection(user_id);
CREATE INDEX IF NOT EXISTS idx_gacha_history_user_id ON gacha_history(user_id);
CREATE INDEX IF NOT EXISTS idx_qr_codes_code ON qr_codes(code);
CREATE INDEX IF NOT EXISTS idx_qr_codes_used ON qr_codes(used);
CREATE INDEX IF NOT EXISTS idx_shares_share_code ON shares(share_code);
CREATE INDEX IF NOT EXISTS idx_shares_claimed ON shares(claimed);

-- 建立 updated_at 自動更新的觸發器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) 設定
-- 啟用 RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection ENABLE ROW LEVEL SECURITY;
ALTER TABLE gacha_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 使用者只能讀取自己的資料
CREATE POLICY "Users can read own data" ON users
  FOR SELECT USING (true);

CREATE POLICY "Users can read own collection" ON collection
  FOR SELECT USING (true);

CREATE POLICY "Users can read own gacha history" ON gacha_history
  FOR SELECT USING (true);

-- QR Codes 可被所有人讀取（但不能修改）
CREATE POLICY "QR codes readable by all" ON qr_codes
  FOR SELECT USING (true);

-- Shares 可被所有人讀取
CREATE POLICY "Shares readable by all" ON shares
  FOR SELECT USING (true);

COMMENT ON TABLE users IS '使用者資料表';
COMMENT ON TABLE collection IS '卡片收藏記錄表';
COMMENT ON TABLE gacha_history IS '抽卡歷史記錄表';
COMMENT ON TABLE qr_codes IS 'QR Code 管理表';
COMMENT ON TABLE shares IS '分享記錄表';
