-- 會員自行修改「員工編號」的稽核紀錄
-- 每次登記/修改都留一筆（誰、何時、從 A 改成 B），並作為 30 天冷卻期的計算依據
-- 寫法比照現有 collection_audit（security_hardening.sql）

CREATE TABLE IF NOT EXISTS customer_employee_id_audit (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  old_employee_id VARCHAR(50),          -- 首次登記時為 NULL
  new_employee_id VARCHAR(50) NOT NULL,
  changed_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_employee_id_audit_user_time
  ON customer_employee_id_audit(user_id, changed_at DESC);

-- 只能讀自己的稽核紀錄，寫入只透過後端 service role key（不開放 public 寫入 policy）
ALTER TABLE customer_employee_id_audit ENABLE ROW LEVEL SECURITY;
