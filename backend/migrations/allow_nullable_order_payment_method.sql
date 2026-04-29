-- 允許點單付款方式留空，不再強制預設為現金

ALTER TABLE orders
  ALTER COLUMN payment_method DROP NOT NULL;

ALTER TABLE orders
  ALTER COLUMN payment_method DROP DEFAULT;