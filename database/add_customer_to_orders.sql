-- 在 orders 表加入顧客 LINE 身分欄位
-- 於 完成收款 時，若 QR Code 已被顧客 LINE 帳號掃描，自動記錄顧客資訊

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS customer_line_id VARCHAR(100);

COMMENT ON COLUMN orders.customer_name IS '顧客 LINE 顯示名稱（掃 QR 時自動帶入）';
COMMENT ON COLUMN orders.customer_line_id IS '顧客 LINE User ID（掃 QR 時自動帶入）';
