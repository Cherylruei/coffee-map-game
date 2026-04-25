-- ============================================================
-- 儲值 QR Code 加入付款方式欄位
-- 在 Supabase SQL Editor 執行此檔案（一次性）
-- ============================================================

-- 新增 payment_method 欄位（cash = 現金, line = LINE Pay）
ALTER TABLE topup_qr_codes
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash'
    CHECK (payment_method IN ('cash', 'line'));
