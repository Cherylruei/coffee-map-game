-- 新增抽卡次數欄位（累積制）
-- 在 Supabase SQL Editor 執行此檔案

ALTER TABLE users ADD COLUMN IF NOT EXISTS draw_chances INTEGER DEFAULT 0;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS cup_count INTEGER DEFAULT 1;
