-- 分享取消功能遷移
-- 在 Supabase SQL Editor 中執行此腳本
-- 新增 cancelled 欄位到 shares 表，支援取消分享功能

ALTER TABLE shares ADD COLUMN IF NOT EXISTS cancelled BOOLEAN DEFAULT false;

-- 建立索引以提升查詢效能（查詢未取消的分享）
CREATE INDEX IF NOT EXISTS idx_shares_cancelled ON shares(cancelled);
