-- 在 orders 表加入「會員自行登記員編」的快照
-- 抽卡掃 QR 時，從 users.customer_employee_id 帶入並快照保存於訂單
-- 與既有 orders.employee_id（店員代未登入顧客手動填寫）區隔

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_employee_id VARCHAR(50);

COMMENT ON COLUMN orders.employee_id IS '店員於收款時手動代填的員編（未登入顧客）';
COMMENT ON COLUMN orders.customer_employee_id IS '會員 LINE 登入後自行登記的員編快照（掃 QR 時自動帶入）';
