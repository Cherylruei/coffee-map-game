-- ============================================================
-- 防止同一張已掃描的儲值金 QR Code 被重複用於建立多筆訂單
-- 在 Supabase SQL Editor 執行此檔案（一次性）
-- ============================================================

-- 記錄這張 QR Code 何時被「用來建立訂單」（不同於顧客掃描扣款的 used/used_at）
-- 後端在建立儲值金付款訂單前，會以 UPDATE ... WHERE wallet_order_claimed_at IS NULL
-- 做一次性 compare-and-swap，確保同一張 QR 只能成功建立一次訂單。
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS wallet_order_claimed_at TIMESTAMPTZ;
