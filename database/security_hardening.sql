-- ============================================================
-- 資安強化遷移 v1.0
-- 防竄改：atomic RPC、稽核日誌、收緊 RLS
-- 在 Supabase SQL Editor 執行（一次性）
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Atomic 儲值 RPC
--    問題：原本「讀 QR → 更新餘額 → 標記已用」是三步，
--          兩個同時請求可能都通過 used=false 檢查後雙重入帳。
--    修復：SELECT ... FOR UPDATE 鎖定 QR 列，整個交易 atomic。
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION topup_wallet(
  p_user_id UUID,
  p_code    TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_qr          topup_qr_codes%ROWTYPE;
  v_new_balance INTEGER;
BEGIN
  -- 鎖定 QR 列：其他同時請求會在此等待，避免 race condition
  SELECT * INTO v_qr
    FROM topup_qr_codes
    WHERE code = p_code
    FOR UPDATE;

  IF v_qr.id IS NULL THEN
    RETURN '{"success":false,"error":"qr_not_found"}'::JSONB;
  END IF;
  IF v_qr.used THEN
    RETURN '{"success":false,"error":"qr_already_used"}'::JSONB;
  END IF;
  IF v_qr.expires_at < NOW() THEN
    RETURN '{"success":false,"error":"qr_expired"}'::JSONB;
  END IF;

  -- 同一交易內標記已用（不會有 race window）
  UPDATE topup_qr_codes
    SET used = TRUE, used_by = p_user_id, used_at = NOW()
    WHERE id = v_qr.id;

  -- Upsert 錢包（不存在則建立，存在則累加）
  INSERT INTO wallets (user_id, balance)
    VALUES (p_user_id, v_qr.amount)
    ON CONFLICT (user_id)
    DO UPDATE SET
      balance    = wallets.balance + v_qr.amount,
      updated_at = NOW()
    RETURNING balance INTO v_new_balance;

  -- 插入交易明細
  INSERT INTO wallet_transactions (user_id, amount, type, note, order_ref)
    VALUES (p_user_id, v_qr.amount, 'topup', '儲值 $' || v_qr.amount, p_code);

  RETURN jsonb_build_object(
    'success',     true,
    'amount',      v_qr.amount,
    'new_balance', v_new_balance
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. Atomic 點單 QR 兌換 RPC（掃 QR → 錢包扣款 → 增加抽卡次數）
--    問題：原本三步可被並發請求雙重使用同一 QR。
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION claim_order_qr(
  p_user_id UUID,
  p_code    TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_qr            qr_codes%ROWTYPE;
  v_wallet_result JSONB;
  v_new_chances   INTEGER;
BEGIN
  -- 鎖定 QR 列
  SELECT * INTO v_qr
    FROM qr_codes
    WHERE code = p_code
    FOR UPDATE;

  IF v_qr.id IS NULL THEN
    RETURN '{"success":false,"error":"qr_not_found"}'::JSONB;
  END IF;
  IF v_qr.used THEN
    RETURN '{"success":false,"error":"qr_already_used"}'::JSONB;
  END IF;
  IF v_qr.expires_at < NOW() THEN
    RETURN '{"success":false,"error":"qr_expired"}'::JSONB;
  END IF;

  -- 若點單需錢包付款，呼叫已有的 atomic deduct_wallet（內含 FOR UPDATE）
  IF v_qr.wallet_amount IS NOT NULL AND v_qr.wallet_amount > 0 THEN
    SELECT deduct_wallet(
      p_user_id,
      v_qr.wallet_amount,
      '消費扣款（QR: ' || p_code || '）',
      p_code
    ) INTO v_wallet_result;

    IF NOT (v_wallet_result->>'success')::BOOLEAN THEN
      RETURN v_wallet_result;  -- 餘額不足或無錢包，直接回傳錯誤
    END IF;
  END IF;

  -- 標記 QR 已使用
  UPDATE qr_codes
    SET used = TRUE, used_by = p_user_id, used_at = NOW()
    WHERE id = v_qr.id;

  -- 累加抽卡次數
  UPDATE users
    SET draw_chances = draw_chances + v_qr.cup_count
    WHERE id = p_user_id
    RETURNING draw_chances INTO v_new_chances;

  RETURN jsonb_build_object(
    'success',       true,
    'cup_count',     v_qr.cup_count,
    'draw_chances',  v_new_chances,
    'wallet_amount', COALESCE(v_qr.wallet_amount, 0),
    'new_balance',   CASE
                       WHEN v_wallet_result IS NOT NULL
                       THEN (v_wallet_result->>'new_balance')::INTEGER
                       ELSE NULL
                     END
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. Atomic 抽卡 RPC（扣次數 + 寫入收藏 + 紀錄歷史）
--    問題：原本「讀 draw_chances → 扣減 → 寫收藏」可被並發請求
--          同時讀到舊值，導致用 1 次機會抽到多張卡。
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION perform_draw(
  p_user_id UUID,
  p_card_id INTEGER
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_chances      INTEGER;
  v_card_existed BOOLEAN;
BEGIN
  -- 鎖定用戶列：確保 draw_chances 不被並發多扣
  SELECT draw_chances INTO v_chances
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;

  IF v_chances IS NULL OR v_chances <= 0 THEN
    RETURN '{"success":false,"error":"no_chances"}'::JSONB;
  END IF;

  -- 扣減次數
  UPDATE users
    SET draw_chances = draw_chances - 1
    WHERE id = p_user_id;

  -- 記錄此卡是否為新卡（在 upsert 前判斷）
  SELECT EXISTS(
    SELECT 1 FROM collection
    WHERE user_id = p_user_id AND card_id = p_card_id
  ) INTO v_card_existed;

  -- Upsert 收藏（新卡 insert，已有則 count +1）
  INSERT INTO collection (user_id, card_id, count)
    VALUES (p_user_id, p_card_id, 1)
    ON CONFLICT (user_id, card_id)
    DO UPDATE SET count = collection.count + 1;

  -- 抽卡歷史
  INSERT INTO gacha_history (user_id, card_id, is_new)
    VALUES (p_user_id, p_card_id, NOT v_card_existed);

  RETURN jsonb_build_object(
    'success',     true,
    'new_chances', v_chances - 1,
    'card_id',     p_card_id,
    'is_new',      NOT v_card_existed
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. 卡片稽核日誌（不可竄改的變動紀錄）
--    錢包已有 wallet_transactions，卡片收藏補上相同機制。
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS collection_audit (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL,
  card_id    INTEGER NOT NULL,
  action     TEXT NOT NULL CHECK (action IN ('gain', 'share_out', 'share_in')),
  old_count  INTEGER NOT NULL DEFAULT 0,
  new_count  INTEGER NOT NULL,
  source     TEXT,     -- 'gacha' | 'share' | 'admin'
  source_ref TEXT,     -- QR code / share code
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_audit_user ON collection_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_collection_audit_time ON collection_audit(created_at);

-- RLS：只能讀自己的稽核紀錄，且無法從前端直接寫入（只有 service key 可寫）
ALTER TABLE collection_audit ENABLE ROW LEVEL SECURITY;

-- 5. 觸發器：collection 任何 INSERT / UPDATE 自動寫入稽核日誌
--    使用 current_setting('app.collection_source', true) 讓呼叫端傳入來源，
--    區分 'gacha'（自己抽）vs 'share'（好友分享入帳）vs 'admin'。
--    呼叫端在同一 transaction 設定：SET LOCAL "app.collection_source" = 'share';
--    未設定時預設 'system'。
CREATE OR REPLACE FUNCTION log_collection_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_source TEXT;
BEGIN
  v_source := COALESCE(
    NULLIF(current_setting('app.collection_source', true), ''),
    'system'
  );

  IF TG_OP = 'INSERT' THEN
    INSERT INTO collection_audit (user_id, card_id, action, old_count, new_count, source)
      VALUES (NEW.user_id, NEW.card_id, 'gain', 0, NEW.count, v_source);

  ELSIF TG_OP = 'UPDATE' AND NEW.count <> OLD.count THEN
    INSERT INTO collection_audit (user_id, card_id, action, old_count, new_count, source)
      VALUES (
        NEW.user_id,
        NEW.card_id,
        CASE
          WHEN NEW.count > OLD.count THEN
            CASE WHEN v_source = 'share' THEN 'share_in' ELSE 'gain' END
          ELSE 'share_out'
        END,
        OLD.count,
        NEW.count,
        v_source
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_collection_audit ON collection;
CREATE TRIGGER trg_collection_audit
  AFTER INSERT OR UPDATE ON collection
  FOR EACH ROW EXECUTE FUNCTION log_collection_change();

-- ────────────────────────────────────────────────────────────
-- 6. 收緊 RLS 政策
--    原本 USING (true) = 任何有 anon key 的人都能讀全部用戶資料。
--    由於前端不直接存取 Supabase（全走後端 service key），
--    移除寬鬆政策讓 anon key 直連完全無效。
-- ────────────────────────────────────────────────────────────

-- 移除 "USING (true)" 寬鬆政策
DROP POLICY IF EXISTS "Users can read own data"         ON users;
DROP POLICY IF EXISTS "Users can read own collection"   ON collection;
DROP POLICY IF EXISTS "Users can read own gacha history" ON gacha_history;
DROP POLICY IF EXISTS "QR codes readable by all"        ON qr_codes;
DROP POLICY IF EXISTS "Shares readable by all"          ON shares;

-- 結果：anon key 直接打 Supabase REST API 讀不到任何核心資料
-- 後端使用 service key（bypass RLS），不受影響
-- 若未來需要讓前端用 Supabase client 讀自己的資料，請新增
-- 明確指定 user 的政策（不要再用 USING (true)）
