-- 在 users 表加入「會員自行登記的員工編號」
-- 會員 LINE 登入後自行填寫，與 orders.employee_id（店員代填）區隔
-- 命名與 orders.customer_employee_id 一致：皆為「顧客本人自填員編」

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS customer_employee_id VARCHAR(50);

-- 部分唯一索引：允許多筆 NULL，但有值時全系統唯一（一個員編只綁一個 LINE 帳號）
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_customer_employee_id
  ON users(customer_employee_id) WHERE customer_employee_id IS NOT NULL;

COMMENT ON COLUMN users.customer_employee_id IS '會員 LINE 登入後自行登記的員工編號（強制必填、不可修改、全系統唯一）';
