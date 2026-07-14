// server-supabase.js - 咖啡地圖收集遊戲後端 API (Supabase版本)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
// 強制使用 http adapter，避免 Node.js 18 實驗性 fetch 導致 "TypeError: fetch failed"
axios.defaults.adapter = 'http';
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('cross-fetch');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const {
  validateCustomerEmployeeId,
  checkChangeCooldown,
  resolveRegistration,
  isUniqueViolation,
} = require('./lib/customerEmployeeId');

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase 初始化
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { global: { fetch } },
);

// 配置
const CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-this',
  LINE_CHANNEL_ID: process.env.LINE_CHANNEL_ID || 'YOUR_LINE_CHANNEL_ID',
  LINE_CHANNEL_SECRET:
    process.env.LINE_CHANNEL_SECRET || 'YOUR_LINE_CHANNEL_SECRET',
};

// JWT_SECRET 強度檢查（啟動時警告）
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'your-secret-key-change-this') {
  console.warn('[SECURITY] JWT_SECRET 使用預設值，正式環境請設定強隨機字串！');
}

// ADMIN_TOKEN 移到最上面，所有路由都能用到
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret-token';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ─── Rate Limiters（防暴力重試與濫用）───────────────────────
// 每個用戶每分鐘最多 5 次儲值（QR code 本來就是一次性，此為額外保護）
const walletTopupLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req, res) => req.user?.userId || ipKeyGenerator(req, res),
  message: { success: false, message: '請求過於頻繁，請稍後再試' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 每個用戶每小時最多建立 10 筆轉帳（防濫用）
const walletTransferCreateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: (req, res) => req.user?.userId || ipKeyGenerator(req, res),
  message: { success: false, message: '建立轉帳過於頻繁，請稍後再試' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 每個用戶每分鐘最多 10 次領取（防爆破）
const walletTransferClaimLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req, res) => req.user?.userId || ipKeyGenerator(req, res),
  message: { success: false, message: '請求過於頻繁，請稍後再試' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 每個用戶每分鐘最多 10 次 QR 兌換
const gachaPullLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req, res) => req.user?.userId || ipKeyGenerator(req, res),
  message: { success: false, message: '請求過於頻繁，請稍後再試' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 每個用戶每分鐘最多 15 次抽卡（一次最多就這樣）
const gachaDrawLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  keyGenerator: (req, res) => req.user?.userId || ipKeyGenerator(req, res),
  message: { success: false, message: '請求過於頻繁，請稍後再試' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 員編登記：嚴格限流，防止枚舉已被占用的員編與暴力寫入
const customerEmployeeIdLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req, res) => req.user?.userId || ipKeyGenerator(req, res),
  message: { success: false, message: '請求過於頻繁，請稍後再試' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 允許的來源：環境變數 ALLOWED_ORIGINS 以逗號分隔，預設包含本地開發與正式環境
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
  : [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5501',
      'http://localhost:5502',
      FRONTEND_URL, // 正式環境前端（由 FRONTEND_URL env var 控制）
    ];

// 中間件
app.use(
  cors({
    origin: (origin, callback) => {
      // 允許無 origin（如 curl、Postman、行動 app）或在白名單內的來源
      if (!origin || ALLOWED_ORIGINS.includes(origin))
        return callback(null, true);
      callback(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(express.static('public'));

// 咖啡卡片權重配置
const CARD_WEIGHTS = {
  1: 2.5,
  2: 2.5,
  3: 5,
  4: 5,
  5: 5,
  6: 10,
  7: 10,
  8: 10,
  9: 10,
  10: 16.7,
  11: 16.7,
  12: 16.6,
};

const TOTAL_COLLECTION_CARDS = 12;
const REWARD_CODE_PREFIX = 'COF';
const REWARD_CODE_EXPIRES_DAYS = 30;
const REWARD_TYPE_FREE_DRINK = 'collection_free_drink';

function pullCard() {
  const totalWeight = Object.values(CARD_WEIGHTS).reduce(
    (sum, w) => sum + w,
    0,
  );
  let random = Math.random() * totalWeight;
  for (let [cardId, weight] of Object.entries(CARD_WEIGHTS)) {
    random -= weight;
    if (random <= 0) return parseInt(cardId);
  }
  return 12;
}

function generateRewardCode() {
  return `${REWARD_CODE_PREFIX}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function buildRewardExpiryDate() {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REWARD_CODE_EXPIRES_DAYS);
  return expiresAt.toISOString();
}

async function getCollectedCardCount(userId) {
  const { data, error } = await supabase
    .from('collection')
    .select('card_id, count')
    .eq('user_id', userId)
    .gt('count', 0);

  if (error) throw error;

  return new Set((data || []).map((item) => item.card_id)).size;
}

async function getRewardCodeWithUser(code) {
  const { data: rewardCode, error } = await supabase
    .from('collection_reward_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (error) throw error;
  if (!rewardCode) return null;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('display_name, line_user_id, customer_employee_id')
    .eq('id', rewardCode.user_id)
    .maybeSingle();

  if (userError) throw userError;

  return {
    rewardCode,
    user,
  };
}

// JWT 驗證中間件（一般用戶）
// 除了驗證 JWT 簽章，還會確認該帳號在資料庫中仍存在：
// 避免「資料被重置/刪除但瀏覽器仍持有舊 JWT」的幽靈帳號通過驗證，
// 導致掃 QR、抽卡、錢包等操作靜默失敗（QR 被燒掉卻沒給到抽卡次數等）。
// 帳號不存在時回 401 accountMissing，前端 axios 攔截器會自動登出並導回登入頁，
// 重新以 LINE 登入即會重建帳號。
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token)
    return res.status(401).json({ success: false, message: '未授權' });

  jwt.verify(token, CONFIG.JWT_SECRET, async (err, user) => {
    if (err)
      return res.status(403).json({ success: false, message: 'Token 無效' });

    try {
      const { data: account, error } = await supabase
        .from('users')
        .select('id')
        .eq('id', user.userId)
        .maybeSingle();

      if (error) throw error;

      if (!account) {
        return res.status(401).json({
          success: false,
          accountMissing: true,
          message: '帳號不存在或已失效，請重新登入',
        });
      }

      req.user = user;
      next();
    } catch (e) {
      console.error('authenticateToken account check error:', e);
      return res.status(500).json({ success: false, message: '驗證失敗，請稍後再試' });
    }
  });
}

// Admin 驗證中間件（改用 session token，ADMIN_TOKEN 不傳到前端）
function authenticateAdmin(req, res, next) {
  const token = req.headers['x-admin-session'];
  if (!token)
    return res.status(401).json({ success: false, message: '未登入' });

  try {
    const payload = jwt.verify(token, CONFIG.JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('not admin');
    next();
  } catch {
    return res
      .status(403)
      .json({ success: false, message: 'Session 無效或已過期' });
  }
}

// ===== API 路由 =====

const processedCodes = new Set();

// 0. Admin 登入（工作人員輸入密碼 → 伺服器比對 → 回傳短期 session token）
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;

  if (password !== ADMIN_TOKEN) {
    await new Promise((r) => setTimeout(r, 500)); // 防暴力猜測
    return res.status(401).json({ success: false, message: '密碼錯誤' });
  }

  const sessionToken = jwt.sign({ role: 'admin' }, CONFIG.JWT_SECRET, {
    expiresIn: '4h',
  });

  res.json({ success: true, sessionToken });
});

// 1. LINE Login 回調處理
app.post('/api/auth/line/callback', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;

    if (processedCodes.has(code)) {
      return res.status(400).json({ success: false, message: '授權碼已使用' });
    }
    processedCodes.add(code);
    if (processedCodes.size > 100) {
      const codes = Array.from(processedCodes);
      codes
        .slice(0, codes.length - 100)
        .forEach((c) => processedCodes.delete(c));
    }

    const tokenResponse = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: CONFIG.LINE_CHANNEL_ID,
        client_secret: CONFIG.LINE_CHANNEL_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const accessToken = tokenResponse.data.access_token;

    const profileResponse = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const lineProfile = profileResponse.data;

    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('line_user_id', lineProfile.userId)
      .single();

    const isNewUser = !user;

    if (!user) {
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          line_user_id: lineProfile.userId,
          display_name: lineProfile.displayName,
          picture_url: lineProfile.pictureUrl,
          share_tokens: 3,
        })
        .select()
        .single();
      if (error) throw error;
      user = newUser;
    }

    const token = jwt.sign(
      { userId: user.id, lineUserId: user.line_user_id },
      CONFIG.JWT_SECRET,
      { expiresIn: '30d' },
    );

    res.json({
      success: true,
      isNewUser,
      user: {
        userId: user.line_user_id,
        displayName: user.display_name,
        pictureUrl: user.picture_url,
        customerEmployeeId: user.customer_employee_id ?? null,
      },
      token,
    });
  } catch (error) {
    console.error('LINE login error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: '登入失敗' });
  }
});

// 2. 取得用戶收藏（含待接收分享）
app.get('/api/user/collection', authenticateToken, async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('id, share_tokens, draw_chances, customer_employee_id')
      .eq('id', req.user.userId)
      .maybeSingle();

    // 帳號不存在（例如資料被重置/刪除，但瀏覽器仍持有舊 JWT）→ 要求重新登入
    // 前端 axios 攔截器收到 401 會自動清除登入狀態並導回登入頁
    if (!user) {
      return res.status(401).json({
        success: false,
        accountMissing: true,
        message: '帳號不存在或已失效，請重新登入',
      });
    }

    // 員編已登記過才需要算下次可修改時間（30 天冷卻期）
    // 冷卻期只從「上一次實際修改」起算；首次登記(old=NULL)不算，故登記後仍可立即修正一次
    let customerEmployeeIdEditableAt = null;
    if (user?.customer_employee_id) {
      const { data: lastChange } = await supabase
        .from('customer_employee_id_audit')
        .select('changed_at')
        .eq('user_id', req.user.userId)
        .not('old_employee_id', 'is', null)
        .order('changed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const cooldown = checkChangeCooldown(lastChange?.changed_at ?? null);
      customerEmployeeIdEditableAt = cooldown.ok ? null : cooldown.nextEligibleAt;
    }

    const { data: collections } = await supabase
      .from('collection')
      .select('card_id, count')
      .eq('user_id', req.user.userId);

    const collection = {};
    collections?.forEach((item) => {
      collection[item.card_id] = item.count;
    });

    // === 獲取已發出但未被接收的分享（排除已取消的） ===
    const { data: pendingShares } = await supabase
      .from('shares')
      .select('card_id')
      .eq('from_user_id', req.user.userId)
      .eq('claimed', false)
      .or('cancelled.is.null,cancelled.eq.false')
      .gte('expires_at', new Date().toISOString());

    const pendingSharesByCard = {};
    pendingShares?.forEach((share) => {
      pendingSharesByCard[share.card_id] =
        (pendingSharesByCard[share.card_id] || 0) + 1;
    });

    res.json({
      success: true,
      collection,
      pendingShares: pendingSharesByCard, // { cardId: count, ... }
      shareTokens: user?.share_tokens || 3,
      drawChances: user?.draw_chances || 0,
      customerEmployeeId: user?.customer_employee_id ?? null,
      customerEmployeeIdEditableAt,
    });
  } catch (error) {
    console.error('Get collection error:', error);
    res.status(500).json({ success: false, message: '取得收藏失敗' });
  }
});

// 2.05 登記/修改會員員工編號（強制必填、全系統唯一、修改需間隔 30 天）
app.post('/api/user/customer-employee-id', authenticateToken, customerEmployeeIdLimiter, async (req, res) => {
  try {
    // 1. 格式驗證
    const validation = validateCustomerEmployeeId(req.body?.customerEmployeeId);
    if (!validation.ok) {
      return res.status(validation.status).json({ success: false, message: validation.message });
    }
    const value = validation.value;

    // 2. 讀取目前已登記員編 + 是否被其他帳號占用 + 最近一次登記/修改時間（冷卻期依據）
    const [{ data: current }, { data: taken }, { data: lastChange }] = await Promise.all([
      supabase
        .from('users')
        .select('id, customer_employee_id')
        .eq('id', req.user.userId)
        .maybeSingle(),
      supabase
        .from('users')
        .select('id')
        .eq('customer_employee_id', value)
        .neq('id', req.user.userId)
        .maybeSingle(),
      supabase
        .from('customer_employee_id_audit')
        .select('changed_at')
        .eq('user_id', req.user.userId)
        // 只看「實際修改」（old_employee_id 有值）；首次登記(old=NULL)不算，
        // 讓客人登記後仍可立即修正一次，之後每次修改才鎖 30 天
        .not('old_employee_id', 'is', null)
        .order('changed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // 帳號不存在（例如資料被重置/刪除，但瀏覽器仍持有舊 JWT）→ 要求重新登入
    // 避免對不存在的 id 做 UPDATE（更新 0 筆卻回傳成功）而陷入彈窗無限迴圈
    if (!current) {
      return res.status(401).json({
        success: false,
        accountMissing: true,
        message: '帳號不存在或已失效，請重新登入',
      });
    }

    // 3. 決策：冷卻期未到 / 已被占用 / 重複送出同一個員編（冪等成功）/ 可登記或修改
    const decision = resolveRegistration({
      currentEmployeeId: current?.customer_employee_id ?? null,
      takenByOther: !!taken,
      value,
      lastChangedAt: lastChange?.changed_at ?? null,
    });
    if (!decision.ok) {
      const body = { success: false, message: decision.message };
      if (decision.customerEmployeeId) body.customerEmployeeId = decision.customerEmployeeId;
      if (decision.nextEligibleAt) body.nextEligibleAt = decision.nextEligibleAt;
      return res.status(decision.status).json(body);
    }

    // 送出值跟已登記的值相同：冪等成功，不需要寫入也不需要留稽核紀錄
    if (decision.alreadyRegistered) {
      return res.json({ success: true, customerEmployeeId: value });
    }

    const oldValue = current?.customer_employee_id ?? null;

    // 4. 寫入（競態下由 DB 部分唯一索引擋下）
    const { error } = await supabase
      .from('users')
      .update({ customer_employee_id: value })
      .eq('id', req.user.userId);

    if (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ success: false, message: '此員工編號已被其他帳號登記' });
      }
      throw error;
    }

    // 5. 留下稽核紀錄（誰、何時、從哪個值改成哪個值）
    await supabase.from('customer_employee_id_audit').insert({
      user_id: req.user.userId,
      old_employee_id: oldValue,
      new_employee_id: value,
    });

    res.json({ success: true, customerEmployeeId: value });
  } catch (error) {
    console.error('Register customer employee id error:', error);
    res.status(500).json({ success: false, message: '登記失敗，請稍後再試' });
  }
});

// 2.1 產生或取回集滿兌換碼
app.post('/api/user/redeem-code', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const nowIso = new Date().toISOString();

    const { error: expireError } = await supabase
      .from('collection_reward_codes')
      .update({ status: 'cancelled' })
      .eq('user_id', userId)
      .eq('status', 'pending')
      .lt('expires_at', nowIso);
    if (expireError) throw expireError;

    const { data: redeemedReward, error: redeemedError } = await supabase
      .from('collection_reward_codes')
      .select('code, redeemed_at')
      .eq('user_id', userId)
      .eq('reward_type', REWARD_TYPE_FREE_DRINK)
      .eq('status', 'redeemed')
      .order('redeemed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (redeemedError) throw redeemedError;

    if (redeemedReward) {
      return res.status(200).json({
        success: true,
        message: '恭喜破關! 飲品已兌換完成',
        isAlreadyRedeemed: true,
        redeemedAt: redeemedReward.redeemed_at,
      });
    }

    const { data: existingReward, error: existingError } = await supabase
      .from('collection_reward_codes')
      .select('code, expires_at, created_at, status')
      .eq('user_id', userId)
      .eq('reward_type', REWARD_TYPE_FREE_DRINK)
      .eq('status', 'pending')
      .gte('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existingReward) {
      return res.json({
        success: true,
        message: '此帳號已有尚未使用的兌換碼，核銷前不會重新發碼',
        rewardCode: {
          code: existingReward.code,
          expiresAt: existingReward.expires_at,
          status: existingReward.status,
          rewardType: REWARD_TYPE_FREE_DRINK,
        },
        alreadyIssued: true,
      });
    }

    const collectedCardCount = await getCollectedCardCount(userId);
    if (collectedCardCount < TOTAL_COLLECTION_CARDS) {
      return res.status(400).json({
        success: false,
        message: `尚未集滿 ${TOTAL_COLLECTION_CARDS} 張卡片`,
      });
    }

    let createdReward = null;
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const nextCode = generateRewardCode();
      const { data, error } = await supabase
        .from('collection_reward_codes')
        .insert({
          code: nextCode,
          user_id: userId,
          reward_type: REWARD_TYPE_FREE_DRINK,
          status: 'pending',
          expires_at: buildRewardExpiryDate(),
        })
        .select('code, expires_at, status')
        .single();

      if (!error) {
        createdReward = data;
        break;
      }

      lastError = error;
      if (error.code !== '23505') {
        throw error;
      }
    }

    if (!createdReward) {
      throw lastError || new Error('建立兌換碼失敗');
    }

    res.json({
      success: true,
      rewardCode: {
        code: createdReward.code,
        expiresAt: createdReward.expires_at,
        status: createdReward.status,
        rewardType: REWARD_TYPE_FREE_DRINK,
      },
      alreadyIssued: false,
    });
  } catch (error) {
    console.error('Create redeem code error:', error);
    res.status(500).json({ success: false, message: '建立兌換碼失敗' });
  }
});

// 3. 兌換 QR Code → 累加抽卡次數（atomic RPC，防 race condition）
app.post('/api/gacha/pull', authenticateToken, gachaPullLimiter, async (req, res) => {
  try {
    const { qrCode } = req.body;
    if (!qrCode || typeof qrCode !== 'string') {
      return res.status(400).json({ success: false, message: 'QR Code 格式錯誤' });
    }

    // 全部操作在一個 Postgres transaction 內完成（FOR UPDATE 防 race condition）
    const { data: result, error } = await supabase.rpc('claim_order_qr', {
      p_user_id: req.user.userId,
      p_code: qrCode,
    });
    if (error) throw error;

    if (!result.success) {
      const msgMap = {
        qr_not_found:       'QR Code 無效',
        qr_already_used:    'QR Code 已被使用',
        qr_expired:         'QR Code 已過期',
        wallet_not_found:   '尚未建立錢包，請先儲值',
        insufficient_balance: `餘額不足（目前 $${result.balance}，需 $${result.required}）`,
      };
      const status = result.error === 'insufficient_balance' ? 402 : 400;
      return res.status(status).json({
        success: false,
        message: msgMap[result.error] || '兌換失敗',
        balance: result.balance ?? 0,
        required: result.required ?? 0,
      });
    }

    const message = result.wallet_amount > 0
      ? (result.cup_count > 0
        ? `已扣款 $${result.wallet_amount}，獲得 ${result.cup_count} 次抽卡機會！`
        : `已扣款 $${result.wallet_amount}！`)
      : `已獲得 ${result.cup_count} 次抽卡機會！`;

    res.json({
      success: true,
      message,
      drawChances:    result.draw_chances,
      addedChances:   result.cup_count,
      walletDeducted: result.wallet_amount,
      newWalletBalance: result.new_balance ?? null,
    });
  } catch (error) {
    console.error('QR redeem error:', error);
    res.status(500).json({ success: false, message: '兌換失敗' });
  }
});

// 3.5. 使用抽卡次數抽卡（atomic RPC，防 draw_chances 超用）
app.post('/api/gacha/draw', authenticateToken, gachaDrawLimiter, async (req, res) => {
  try {
    // 抽卡結果在 JS 端決定（確保亂數邏輯在伺服器，用戶無法影響）
    const cardId = pullCard();

    // 扣次數 + 寫收藏 + 寫歷史：全在一個 Postgres transaction
    const { data: result, error } = await supabase.rpc('perform_draw', {
      p_user_id: req.user.userId,
      p_card_id: cardId,
    });
    if (error) throw error;

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: '抽卡次數不足，去咖啡社買杯咖啡增加抽獎次數哦！',
        drawChances: 0,
      });
    }

    // 讀取最新收藏（只需一次查詢）
    const { data: updatedCollections } = await supabase
      .from('collection')
      .select('card_id, count')
      .eq('user_id', req.user.userId);

    const collection = {};
    updatedCollections?.forEach((item) => {
      collection[item.card_id] = item.count;
    });

    res.json({
      success: true,
      card: { id: result.card_id },
      isNew: result.is_new,
      collection,
      drawChances: result.new_chances,
    });
  } catch (error) {
    console.error('Gacha draw error:', error);
    res.status(500).json({ success: false, message: '抽卡失敗' });
  }
});

// 4. 分享卡片（只生成分享鏈接，不扣除卡片或分享次數）
app.post('/api/share/create', authenticateToken, async (req, res) => {
  try {
    const { cardId } = req.body;

    // === 驗證所有條件（不修改任何資料） ===
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('share_tokens')
      .eq('id', req.user.userId)
      .single();

    if (userError || !user) {
      return res
        .status(400)
        .json({ success: false, message: '使用者不存在' });
    }

    if (user.share_tokens <= 0) {
      return res
        .status(400)
        .json({ success: false, message: '分享次數已用完' });
    }

    const { data: card, error: cardError } = await supabase
      .from('collection')
      .select('count')
      .eq('user_id', req.user.userId)
      .eq('card_id', cardId)
      .single();

    if (cardError || !card) {
      return res
        .status(400)
        .json({ success: false, message: '該卡片不存在' });
    }

    if (card.count <= 0) {
      return res
        .status(400)
        .json({ success: false, message: '該卡片數量不足，無法分享' });
    }

    // === 只建立分享記錄，不扣除任何資料 ===
    const shareCode = `SHARE-${crypto.randomBytes(8).toString('hex')}`;

    const { error: insertError } = await supabase.from('shares').insert({
      share_code: shareCode,
      from_user_id: req.user.userId,
      card_id: cardId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (insertError) {
      console.error('Insert share error:', insertError);
      return res
        .status(500)
        .json({ success: false, message: '建立分享記錄失敗' });
    }

    res.json({
      success: true,
      shareCode,
      shareUrl: `${FRONTEND_URL}/?share=${shareCode.replace('SHARE-', '')}`,
      remainingTokens: user.share_tokens, // 現在還沒扣除，所以返回原有值
    });
  } catch (error) {
    console.error('Share create error:', error);
    res.status(500).json({ success: false, message: '分享失敗' });
  }
});

// 5. 領取分享的卡片（接收時才扣除分享方的卡片和分享次數）
app.post('/api/share/claim', authenticateToken, async (req, res) => {
  try {
    const { shareCode } = req.body;
    const fullShareCode = shareCode.startsWith('SHARE-')
      ? shareCode
      : `SHARE-${shareCode}`;

    const { data: shareData } = await supabase
      .from('shares')
      .select('*')
      .eq('share_code', fullShareCode)
      .single();

    if (!shareData)
      return res.status(400).json({ success: false, message: '分享連結無效' });
    if (shareData.claimed)
      return res
        .status(400)
        .json({ success: false, message: '分享連結已被領取' });
    if (shareData.cancelled)
      return res
        .status(400)
        .json({ success: false, message: '對方已取消分享' });
    if (shareData.from_user_id === req.user.userId)
      return res
        .status(400)
        .json({ success: false, message: '無法領取自己分享的卡片' });
    if (new Date(shareData.expires_at) < new Date())
      return res
        .status(400)
        .json({ success: false, message: '分享連結已過期' });

    const cardId = shareData.card_id;
    const fromUserId = shareData.from_user_id;

    // === 驗證分享方仍有該卡片 ===
    const { data: fromUserCard } = await supabase
      .from('collection')
      .select('count')
      .eq('user_id', fromUserId)
      .eq('card_id', cardId)
      .single();

    if (!fromUserCard || fromUserCard.count <= 0) {
      return res
        .status(400)
        .json({ success: false, message: '分享方已沒有該卡片' });
    }

    // === 增加接收方的卡片數量 ===
    const { data: existingCard } = await supabase
      .from('collection')
      .select('count')
      .eq('user_id', req.user.userId)
      .eq('card_id', cardId)
      .single();

    const isNew = !existingCard;

    if (existingCard) {
      await supabase
        .from('collection')
        .update({ count: existingCard.count + 1 })
        .eq('user_id', req.user.userId)
        .eq('card_id', cardId);
    } else {
      await supabase
        .from('collection')
        .insert({ user_id: req.user.userId, card_id: cardId, count: 1 });
    }

    // === 扣除分享方的卡片數量 ===
    await supabase
      .from('collection')
      .update({ count: fromUserCard.count - 1 })
      .eq('user_id', fromUserId)
      .eq('card_id', cardId);

    // === 扣除分享方的分享次數 ===
    const { data: fromUser } = await supabase
      .from('users')
      .select('share_tokens')
      .eq('id', fromUserId)
      .single();

    if (fromUser) {
      await supabase
        .from('users')
        .update({ share_tokens: Math.max(0, (fromUser.share_tokens || 0) - 1) })
        .eq('id', fromUserId);
    }

    // === 標記分享為已領取 ===
    await supabase
      .from('shares')
      .update({
        claimed: true,
        claimed_by: req.user.userId,
        claimed_at: new Date().toISOString(),
      })
      .eq('share_code', fullShareCode);

    const { data: updatedCollections } = await supabase
      .from('collection')
      .select('card_id, count')
      .eq('user_id', req.user.userId);

    const collection = {};
    updatedCollections?.forEach((item) => {
      collection[item.card_id] = item.count;
    });

    res.json({ success: true, card: { id: cardId }, isNew, collection });
  } catch (error) {
    console.error('Share claim error:', error);
    res.status(500).json({ success: false, message: '領取失敗' });
  }
});

// 5.5. 取消分享卡片
app.post('/api/share/cancel', authenticateToken, async (req, res) => {
  try {
    const { cardId } = req.body;

    // 找到該用戶的未領取、未取消的分享記錄
    const { data: pendingShare, error: findError } = await supabase
      .from('shares')
      .select('id, share_code')
      .eq('from_user_id', req.user.userId)
      .eq('card_id', cardId)
      .eq('claimed', false)
      .or('cancelled.is.null,cancelled.eq.false')
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (findError || !pendingShare) {
      return res
        .status(400)
        .json({ success: false, message: '找不到可取消的分享記錄' });
    }

    // 標記為已取消
    const { error: updateError } = await supabase
      .from('shares')
      .update({ cancelled: true })
      .eq('id', pendingShare.id);

    if (updateError) {
      console.error('Cancel share update error:', updateError);
      return res
        .status(500)
        .json({ success: false, message: '取消分享失敗' });
    }

    res.json({ success: true, message: '分享已取消' });
  } catch (error) {
    console.error('Share cancel error:', error);
    res.status(500).json({ success: false, message: '取消分享失敗' });
  }
});

// ===== 店家後台 API =====

// 6. 生成抽卡 QR Code（1 張 QR Code，含杯數資訊）
// walletAmount: 選填，當付款方式為錢包時帶入應扣金額
app.post('/api/admin/qrcode/generate', authenticateAdmin, async (req, res) => {
  try {
    const { cupCount = 1, expiresInDays = 30, walletAmount } = req.body;
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    );

    const code = `COFFEE-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
    const insertData = { code, cup_count: cupCount, expires_at: expiresAt.toISOString() };
    if (walletAmount && walletAmount > 0) {
      insertData.wallet_amount = walletAmount;
    }
    await supabase.from('qr_codes').insert(insertData);

    const qrCode = {
      code,
      url: `${FRONTEND_URL}/?qr=${code}`,
      cupCount,
      walletAmount: walletAmount || null,
    };

    res.json({ success: true, qrCode });
  } catch (error) {
    console.error('QR generate error:', error);
    res.status(500).json({ success: false, message: '生成失敗' });
  }
});

// 7. 查詢 QR Code 狀態
app.get('/api/admin/qrcode/list', authenticateAdmin, async (req, res) => {
  try {
    const { data: qrCodes } = await supabase
      .from('qr_codes')
      .select('*')
      .order('created_at', { ascending: false });

    res.json({
      success: true,
      qrCodes,
      total: qrCodes?.length || 0,
      used: qrCodes?.filter((q) => q.used).length || 0,
      unused: qrCodes?.filter((q) => !q.used).length || 0,
    });
  } catch (error) {
    console.error('QR list error:', error);
    res.status(500).json({ success: false, message: '查詢失敗' });
  }
});

// 7b. 查詢單一 QR Code 使用狀態（供後台輪詢確認儲值金扣款）
app.get('/api/admin/qrcode/status/:code', authenticateAdmin, async (req, res) => {
  try {
    const { code } = req.params;
    const { data, error } = await supabase
      .from('qr_codes')
      .select('used, wallet_amount')
      .eq('code', code)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ success: false, message: '查無此 QR Code' });
    }

    res.json({
      success: true,
      used: !!data.used,
      walletAmount: data.wallet_amount ?? null,
    });
  } catch (error) {
    console.error('QR status error:', error);
    res.status(500).json({ success: false, message: '查詢失敗' });
  }
});

// 8. 統計數據
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const [
      { count: totalUsers },
      { count: totalGachas },
      { count: totalQRCodes },
      { count: usedQRCodes },
      { data: cardDist },
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase
        .from('gacha_history')
        .select('*', { count: 'exact', head: true }),
      supabase.from('qr_codes').select('*', { count: 'exact', head: true }),
      supabase
        .from('qr_codes')
        .select('*', { count: 'exact', head: true })
        .eq('used', true),
      supabase.from('gacha_history').select('card_id'),
    ]);

    const cardDistribution = {};
    for (let i = 1; i <= 12; i++) {
      cardDistribution[i] =
        cardDist?.filter((h) => h.card_id === i).length || 0;
    }

    const { count: totalOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true });

    res.json({
      success: true,
      stats: {
        totalUsers: totalUsers || 0,
        totalGachas: totalGachas || 0,
        totalQRCodes: totalQRCodes || 0,
        usedQRCodes: usedQRCodes || 0,
        totalOrders: totalOrders || 0,
        cardDistribution,
      },
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: '統計失敗' });
  }
});

// 9. 商家 LINE 登入（識別員工身份，不建立遊戲帳號）
app.post('/api/admin/line-login', async (req, res) => {
  try {
    const { code, redirectUri } = req.body;
    const tokenRes = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: CONFIG.LINE_CHANNEL_ID,
        client_secret: CONFIG.LINE_CHANNEL_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    const profileRes = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    });
    const { userId, displayName, pictureUrl } = profileRes.data;
    res.json({
      success: true,
      staff: { lineId: userId, name: displayName, picture: pictureUrl },
    });
  } catch (err) {
    console.error('Merchant LINE login error:', err.message);
    res.status(500).json({ success: false, message: 'LINE 登入失敗' });
  }
});

// 10. 記錄點單
// 10. 記錄點單
app.post('/api/admin/redeem-code/preview', authenticateAdmin, async (req, res) => {
  try {
    const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
    if (!rawCode.startsWith(`${REWARD_CODE_PREFIX}-`)) {
      return res.status(400).json({ success: false, message: '兌換碼格式錯誤' });
    }

    const rewardPayload = await getRewardCodeWithUser(rawCode);
    if (!rewardPayload) {
      return res.status(404).json({ success: false, message: '查無此兌換碼' });
    }

    const { rewardCode, user } = rewardPayload;
    if (rewardCode.status !== 'pending') {
      return res.status(409).json({ success: false, message: '此兌換碼已核銷或失效' });
    }
    if (new Date(rewardCode.expires_at).getTime() <= Date.now()) {
      return res.status(409).json({ success: false, message: '此兌換碼已過期' });
    }

    res.json({
      success: true,
      rewardCode: {
        code: rewardCode.code,
        rewardType: rewardCode.reward_type,
        expiresAt: rewardCode.expires_at,
        customerName: user?.display_name || null,
        customerLineId: user?.line_user_id || null,
      },
    });
  } catch (error) {
    console.error('Redeem code preview error:', error);
    res.status(500).json({ success: false, message: '兌換碼驗證失敗' });
  }
});

// 僅限開發環境：生成測試用兌換碼
app.post('/api/admin/test/create-reward-code', authenticateAdmin, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, message: '此端點僅限開發環境使用' });
  }
  try {
    const { data: anyUser, error: userError } = await supabase
      .from('users')
      .select('id')
      .limit(1)
      .single();
    if (userError || !anyUser) {
      return res.status(400).json({ success: false, message: '資料庫中無使用者，無法建立測試碼' });
    }
    const code = generateRewardCode();
    const expiresAt = buildRewardExpiryDate();
    const { error } = await supabase.from('collection_reward_codes').insert({
      code,
      reward_type: REWARD_TYPE_FREE_DRINK,
      status: 'pending',
      expires_at: expiresAt,
      user_id: anyUser.id,
    });
    if (error) throw error;
    res.json({ success: true, code, expiresAt });
  } catch (error) {
    console.error('Test reward code create error:', error);
    res.status(500).json({ success: false, message: '建立失敗' });
  }
});

app.post('/api/admin/order', authenticateAdmin, async (req, res) => {
  try {
    const {
      staffLineId,
      staffName,
      items,
      totalAmount,
      discount,
      paymentMethod,
      employeeId,
      qrCodes,
      rewardCode,
      rewardItemName,
    } = req.body;

    console.log('📝 接收訂單:', {
      staffName,
      itemsCount: items?.length,
      totalAmount,
      qrCodesCount: qrCodes?.length,
    });

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: '訂單項目不能為空' });
    }

    const manualDiscount = Math.max(0, Number(discount) || 0);
    const subtotalAmount = items.reduce(
      (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 0),
      0,
    );

    let rewardCodeRow = null;
    let rewardDiscount = 0;
    let normalizedRewardCode = null;
    let normalizedRewardItemName = null;

    // 查詢 QR code 是否已被顧客掃描，若有則取得 LINE 身分
    let customerName = null;
    let customerLineId = null;
    let customerEmployeeId = null;
    let walletQrData = null;
    if (qrCodes && qrCodes.length > 0) {
      const { data: qrData } = await supabase
        .from('qr_codes')
        .select('used, used_by, wallet_amount')
        .eq('code', qrCodes[0])
        .maybeSingle();

      walletQrData = qrData || null;

      if (qrData?.used_by) {
        const { data: userData } = await supabase
          .from('users')
          .select('display_name, line_user_id, customer_employee_id')
          .eq('id', qrData.used_by)
          .maybeSingle();

        customerName = userData?.display_name ?? null;
        customerLineId = userData?.line_user_id ?? null;
        customerEmployeeId = userData?.customer_employee_id ?? null;
      }
    }

    if (rewardCode) {
      normalizedRewardCode = String(rewardCode).trim().toUpperCase();
      normalizedRewardItemName = typeof rewardItemName === 'string'
        ? rewardItemName.trim()
        : '';

      if (!normalizedRewardItemName) {
        return res.status(400).json({ success: false, message: '請選擇兌換飲品' });
      }

      const rewardPayload = await getRewardCodeWithUser(normalizedRewardCode);
      if (!rewardPayload) {
        return res.status(404).json({ success: false, message: '查無此兌換碼' });
      }

      rewardCodeRow = rewardPayload.rewardCode;
      if (rewardCodeRow.status !== 'pending') {
        return res.status(409).json({ success: false, message: '此兌換碼已核銷或失效' });
      }
      if (new Date(rewardCodeRow.expires_at).getTime() <= Date.now()) {
        return res.status(409).json({ success: false, message: '此兌換碼已過期' });
      }

      const matchedItem = items.find(
        (item) => item.name === normalizedRewardItemName && Number(item.qty) > 0,
      );
      if (!matchedItem) {
        return res.status(400).json({ success: false, message: '兌換飲品不在本次訂單中' });
      }

      rewardDiscount = Math.max(0, Number(matchedItem.price) || 0);
      if (rewardDiscount === 0) {
        return res.status(400).json({ success: false, message: '兌換飲品金額無效' });
      }

      if (!customerName) customerName = rewardPayload.user?.display_name ?? null;
      if (!customerLineId) customerLineId = rewardPayload.user?.line_user_id ?? null;
      if (!customerEmployeeId) customerEmployeeId = rewardPayload.user?.customer_employee_id ?? null;
    }

    const totalDiscount = manualDiscount + rewardDiscount;
    const finalAmount = Math.max(0, subtotalAmount - totalDiscount);

    // 儲值金付款防呆：必須確認客人已掃描 QR 完成扣款，且扣款金額與訂單金額相符
    let walletOrderClaimed = false;
    if (paymentMethod === 'wallet' && finalAmount > 0) {
      if (!walletQrData) {
        return res.status(400).json({
          success: false,
          message: '儲值金付款需先產生 QR Code 供客人掃描',
        });
      }
      if (!walletQrData.used) {
        return res.status(409).json({
          success: false,
          message: '客人尚未掃描 QR Code 完成扣款，請提醒客人掃描後再完成訂單',
        });
      }
      if (Number(walletQrData.wallet_amount) !== Number(finalAmount)) {
        return res.status(409).json({
          success: false,
          message: '儲值金扣款金額與訂單金額不符，請重新確認訂單',
        });
      }

      // 原子性搶佔（compare-and-swap）：確保同一張已掃描的 QR 只能成功建立一次訂單，
      // 避免重複送出或多台裝置同時送出同一張 QR 建立多筆訂單
      const { data: claimedQr, error: claimError } = await supabase
        .from('qr_codes')
        .update({ wallet_order_claimed_at: new Date().toISOString() })
        .eq('code', qrCodes[0])
        .is('wallet_order_claimed_at', null)
        .select('code')
        .maybeSingle();

      if (claimError) throw claimError;
      if (!claimedQr) {
        return res.status(409).json({
          success: false,
          message: '此 QR Code 已用於建立其他訂單，請勿重複送出',
        });
      }
      walletOrderClaimed = true;
    }

    const { data, error } = await supabase
      .from('orders')
      .insert({
        staff_line_id: staffLineId || null,
        staff_name: staffName || '未知員工',
        items,
        total_amount: finalAmount,
        discount: totalDiscount,
        payment_method: paymentMethod || null,
        employee_id: employeeId || null,
        qr_codes: qrCodes || [],
        customer_name: customerName,
        customer_line_id: customerLineId,
        customer_employee_id: customerEmployeeId,
        reward_code: normalizedRewardCode,
        reward_type: rewardCodeRow?.reward_type || null,
        reward_discount: rewardDiscount,
        reward_item_name: normalizedRewardItemName,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase 插入錯誤:', error);
      if (walletOrderClaimed) {
        await supabase.from('qr_codes').update({ wallet_order_claimed_at: null }).eq('code', qrCodes[0]);
      }
      throw error;
    }

    if (normalizedRewardCode) {
      const { data: updatedReward, error: rewardUpdateError } = await supabase
        .from('collection_reward_codes')
        .update({
          status: 'redeemed',
          redeemed_at: new Date().toISOString(),
          redeemed_order_id: data.id,
          redeemed_by_staff_name: staffName || '未知員工',
          redeem_discount: rewardDiscount,
          selected_item_name: normalizedRewardItemName,
        })
        .eq('code', normalizedRewardCode)
        .eq('status', 'pending')
        .select('code')
        .maybeSingle();

      if (rewardUpdateError || !updatedReward) {
        await supabase.from('orders').delete().eq('id', data.id);
        if (walletOrderClaimed) {
          await supabase.from('qr_codes').update({ wallet_order_claimed_at: null }).eq('code', qrCodes[0]);
        }
        return res.status(409).json({ success: false, message: '此兌換碼已被其他訂單使用' });
      }
    }

    console.log('✅ 訂單已保存到 Supabase:', data?.id);
    res.json({ success: true, order: data });
  } catch (error) {
    console.error('訂單記錄錯誤:', error);
    const message = (error && error.message) ? error.message : '記錄點單失敗';
    res.status(500).json({ success: false, message });
  }
});

// 11. 查詢點單紀錄
app.get('/api/admin/orders', authenticateAdmin, async (req, res) => {
  try {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, orders, total: orders?.length || 0 });
  } catch (error) {
    console.error('Orders list error:', error);
    res.status(500).json({ success: false, message: '查詢失敗' });
  }
});

// 12. 修改訂單
app.put('/api/admin/order/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { items, totalAmount, discount, paymentMethod, employeeId } =
      req.body;

    // 撈現有付款方式以守門儲值金訂單（儲值金為真實金流，非標籤）
    const { data: existing, error: fetchError } = await supabase
      .from('orders')
      .select('payment_method')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    const oldPM = existing?.payment_method || null;
    const newPM = paymentMethod || null;

    // 儲值金訂單已於掃碼時固定扣款，禁止編輯；需更動請走退款作廢後重新開單
    if (oldPM === 'wallet') {
      return res.status(409).json({
        success: false,
        code: 'WALLET_ORDER_LOCKED',
        message: '儲值金訂單已扣款，不可修改，請使用退款作廢後重新開單',
      });
    }
    // 非儲值金訂單無法切換成儲值金（儲值金需顧客掃碼扣款，編輯無扣款管道）
    if (newPM === 'wallet') {
      return res.status(400).json({
        success: false,
        code: 'WALLET_NOT_EDITABLE',
        message: '無法將付款方式改為儲值金，儲值金需由顧客掃碼扣款',
      });
    }

    const { error } = await supabase
      .from('orders')
      .update({
        items,
        total_amount: totalAmount,
        discount: discount ?? 0,
        payment_method: paymentMethod || null,
        employee_id: employeeId || null,
      })
      .eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Order update error:', error);
    res.status(500).json({ success: false, message: '修改失敗' });
  }
});

// 12b. 退款作廢訂單（儲值金訂單專用：退回餘額 + 軟刪除，保留稽核軌跡）
app.post('/api/admin/order/:id/void', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const { data: result, error } = await supabase.rpc('refund_order_wallet', {
      p_order_id: id,
      p_reason: reason || '退款作廢',
    });
    if (error) throw error;

    if (!result.success) {
      const msgMap = {
        order_not_found:  '查無此訂單',
        already_voided:   '此訂單已作廢',
        already_refunded: '此訂單已退款，請勿重複操作',
        no_deduction:     '查無扣款紀錄，已標記作廢但未退款',
      };
      const status = result.error === 'order_not_found' ? 404 : 409;
      return res.status(status).json({
        success: false,
        code: result.error,
        message: msgMap[result.error] || '退款作廢失敗',
      });
    }

    res.json({
      success: true,
      refundedAmount: result.refunded_amount,
      newBalance: result.new_balance,
      message: `已退款 $${result.refunded_amount} 至顧客錢包`,
    });
  } catch (error) {
    console.error('Order void error:', error);
    res.status(500).json({ success: false, message: '退款作廢失敗' });
  }
});

// 13. 刪除訂單（儲值金訂單禁止硬刪，須改用退款作廢以保餘額對帳）
app.delete('/api/admin/order/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing, error: fetchError } = await supabase
      .from('orders')
      .select('payment_method')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

    if (existing?.payment_method === 'wallet') {
      return res.status(409).json({
        success: false,
        code: 'WALLET_USE_VOID',
        message: '儲值金訂單請改用「退款作廢」，不可直接刪除',
      });
    }

    const { error } = await supabase.from('orders').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    console.error('Order delete error:', error);
    res.status(500).json({ success: false, message: '刪除失敗' });
  }
});

// 14. 今日詳細統計（盤點頁用）
app.get('/api/admin/stats/today', authenticateAdmin, async (req, res) => {
  try {
    // 獲取本地時區的今日日期字符串 (YYYY-MM-DD)
    const today = new Date().toISOString().split('T')[0];
    const todayStart = `${today}T00:00:00`;
    const todayEnd = `${today}T23:59:59`;

    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .eq('status', 'active')
      .gte('created_at', todayStart)
      .lte('created_at', todayEnd);
    if (error) throw error;

    let totalCups = 0,
      totalRevenue = 0;
    let cashCount = 0,
      cashAmount = 0,
      linePayCount = 0,
      linePayAmount = 0;
    const staffMap = {};
    const itemMap = {};

    for (const order of orders || []) {
      const cups = (order.items || []).reduce((s, i) => s + (i.qty || 0), 0);
      totalCups += cups;
      totalRevenue += order.total_amount || 0;

      if (order.payment_method === 'line_pay') {
        linePayCount++;
        linePayAmount += order.total_amount || 0;
      } else if (order.payment_method === 'cash') {
        cashCount++;
        cashAmount += order.total_amount || 0;
      }

      const sn = order.staff_name || '未知';
      if (!staffMap[sn]) staffMap[sn] = { count: 0, amount: 0 };
      staffMap[sn].count++;
      staffMap[sn].amount += order.total_amount || 0;

      for (const item of order.items || []) {
        itemMap[item.name] = (itemMap[item.name] || 0) + (item.qty || 0);
      }
    }

    const topItems = Object.entries(itemMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const staffBreakdown = Object.entries(staffMap)
      .sort(([, a], [, b]) => b.amount - a.amount)
      .map(([name, d]) => ({ name, count: d.count, amount: d.amount }));

    res.json({
      success: true,
      date: todayStart.toISOString().split('T')[0],
      totalOrders: (orders || []).length,
      totalCups,
      totalRevenue,
      cash: { count: cashCount, amount: cashAmount },
      linePay: { count: linePayCount, amount: linePayAmount },
      staffBreakdown,
      topItems,
    });
  } catch (error) {
    console.error('Today stats error:', error);
    res.status(500).json({ success: false, message: '統計失敗' });
  }
});

// 15. 取得最近一筆盤點（用於計算今日用量）
app.get('/api/inventory/last', authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    res.json({ success: true, inventory: data });
  } catch (error) {
    console.error('Inventory last error:', error);
    res.status(500).json({ success: false, message: '查詢失敗' });
  }
});

// 16. 提交每日盤點
app.post('/api/inventory/daily', authenticateAdmin, async (req, res) => {
  try {
    const {
      coffeeBeansBags,
      coffeeBeansGrams,
      milkBottles,
      milkMl,
      completedBy,
    } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const { error } = await supabase.from('inventory').upsert(
      {
        date: today,
        coffee_beans_bags: coffeeBeansBags,
        coffee_beans_grams: coffeeBeansGrams,
        milk_bottles: milkBottles,
        milk_ml: milkMl,
        completed_by: completedBy || null,
      },
      { onConflict: 'date' },
    );
    if (error) throw error;
    res.json({
      success: true,
      inventory: {
        date: today,
        coffee_beans_bags: coffeeBeansBags,
        coffee_beans_grams: coffeeBeansGrams,
        milk_bottles: milkBottles,
        milk_ml: milkMl,
      },
    });
  } catch (error) {
    console.error('Inventory submit error:', error);
    res.status(500).json({ success: false, message: '盤點提交失敗' });
  }
});

// 17. 取得菜單（公開，無需驗證）
app.get('/api/menu', async (req, res) => {
  try {
    // 先嘗試從 Supabase settings 讀取（包含 available 狀態）
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'menu')
      .single();
    if (setting?.value?.categories) {
      const categories = ensureSpecialCategory(setting.value.categories);
      return res.json({ success: true, categories });
    }
  } catch (_) {
    /* settings 表不存在時直接 fallback */
  }

  try {
    const menu = require('./menu.json');
    const categories = ensureSpecialCategory(menu.categories || []);
    res.json({ success: true, ...menu, categories });
  } catch (error) {
    console.error('Get menu error:', error);
    res.status(500).json({ success: false, message: '取得菜單失敗' });
  }
});

/**
 * 確保 categories 陣列中包含「特調」系列。
 * 若不存在，插入在「客製（custom）」之前；若客製也不存在則附加至末尾。
 * 不修改原陣列，回傳新陣列。
 */
function ensureSpecialCategory(categories) {
  if (categories.some((c) => c.id === 'special')) return categories;
  const specialCategory = { id: 'special', name: '特調', items: [] };
  const customIndex = categories.findIndex((c) => c.id === 'custom');
  if (customIndex === -1) return [...categories, specialCategory];
  return [
    ...categories.slice(0, customIndex),
    specialCategory,
    ...categories.slice(customIndex),
  ];
}

// 18. 儲存菜單（需要管理員驗證）
app.put('/api/menu', authenticateAdmin, async (req, res) => {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories)) {
      return res.status(400).json({ success: false, message: '格式錯誤' });
    }

    // 優先嘗試存到 Supabase settings 表
    try {
      const { error } = await supabase.from('settings').upsert(
        {
          key: 'menu',
          value: { categories },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );
      if (error) throw error;
    } catch (supabaseErr) {
      console.warn(
        'Supabase settings save failed, fallback to file:',
        supabaseErr.message,
      );
      // Fallback: 儲存到 menu.json
      const fs = require('fs');
      const path = require('path');
      const menuPath = path.join(__dirname, 'menu.json');

      let existingMenu = {
        updatedAt: new Date().toISOString().slice(0, 7),
        note: '修改品項只需編輯此檔案，available: false 可暫時下架',
      };
      try {
        const existing = require('./menu.json');
        if (existing.note) existingMenu.note = existing.note;
      } catch {
        /* 無既有菜單 */
      }

      const newMenu = {
        ...existingMenu,
        updatedAt: new Date().toISOString().slice(0, 7),
        categories,
      };

      fs.writeFileSync(menuPath, JSON.stringify(newMenu, null, 2), 'utf8');
      // 清除 require 快取
      delete require.cache[require.resolve('./menu.json')];
    }

    res.json({ success: true, categories });
  } catch (error) {
    console.error('Save menu error:', error);
    res.status(500).json({ success: false, message: '儲存菜單失敗' });
  }
});

// ===== 分享功能管理 API =====

// 16. 增加使用者分享次數（店家後台用於開發測試）
app.post('/api/admin/users/add-share-tokens', authenticateAdmin, async (req, res) => {
  try {
    const { lineId, amount = 3 } = req.body;

    if (!lineId) {
      return res.status(400).json({ success: false, message: '缺少 lineId 參數' });
    }

    // 查找使用者
    const { data: user, error: selectError } = await supabase
      .from('users')
      .select('id, display_name, share_tokens')
      .eq('line_user_id', lineId)
      .single();

    if (selectError || !user) {
      return res.status(404).json({ success: false, message: '使用者不存在' });
    }

    const newTokenCount = (user.share_tokens || 0) + amount;

    // 更新 share_tokens
    const { error: updateError } = await supabase
      .from('users')
      .update({ share_tokens: newTokenCount })
      .eq('id', user.id);

    if (updateError) throw updateError;

    res.json({
      success: true,
      message: `已為 ${user.display_name} 增加 ${amount} 次分享次數`,
      user: {
        id: user.id,
        lineId,
        displayName: user.display_name,
        previousTokens: user.share_tokens,
        newTokens: newTokenCount,
      },
    });
  } catch (error) {
    console.error('Add share tokens error:', error);
    res.status(500).json({ success: false, message: '操作失敗' });
  }
});

// 17. 查詢使用者分享次數
app.get('/api/admin/users/share-tokens', authenticateAdmin, async (req, res) => {
  try {
    const { lineId } = req.query;

    if (!lineId) {
      return res.status(400).json({ success: false, message: '缺少 lineId 參數' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, display_name, share_tokens')
      .eq('line_user_id', lineId)
      .single();

    if (error || !user) {
      return res.status(404).json({ success: false, message: '使用者不存在' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        lineId,
        displayName: user.display_name,
        shareTokens: user.share_tokens || 3,
      },
    });
  } catch (error) {
    console.error('Get share tokens error:', error);
    res.status(500).json({ success: false, message: '查詢失敗' });
  }
});

// ===== 錢包 / 儲值 API =====

// W1. 管理員生成儲值 QR Code（TOPUP- 前綴，一次性，30 分鐘有效）
app.post('/api/admin/topup-qr/generate', authenticateAdmin, async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;
    if (!amount || !Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ success: false, message: '金額必須為正整數' });
    }

    const pm = paymentMethod === 'line' ? 'line' : 'cash';
    const code = `TOPUP-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 分鐘

    const { error } = await supabase.from('topup_qr_codes').insert({
      code,
      amount,
      payment_method: pm,
      expires_at: expiresAt.toISOString(),
    });
    if (error) throw error;

    res.json({
      success: true,
      qrCode: {
        code,
        url: `${FRONTEND_URL}/?qr=${code}`,
        amount,
        paymentMethod: pm,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Topup QR generate error:', error);
    res.status(500).json({ success: false, message: '生成儲值 QR 失敗' });
  }
});

// W-admin. 管理員查詢儲值匯總（依 used_at 篩選）
app.get('/api/admin/topup-summary', authenticateAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('topup_qr_codes')
      .select('amount, payment_method, used_at')
      .eq('used', true)
      .not('used_at', 'is', null);
    if (error) throw error;
    res.json({ success: true, topups: data || [] });
  } catch (error) {
    console.error('Topup summary error:', error);
    res.status(500).json({ success: false, message: '查詢儲值統計失敗' });
  }
});

// W2. 用戶掃描儲值 QR → 自動入帳（atomic RPC，防 race condition）
app.post('/api/wallet/topup', authenticateToken, walletTopupLimiter, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== 'string' || !code.startsWith('TOPUP-')) {
      return res.status(400).json({ success: false, message: '無效的儲值代碼' });
    }

    // 全部操作在一個 Postgres transaction（FOR UPDATE 防雙重使用）
    const { data: result, error } = await supabase.rpc('topup_wallet', {
      p_user_id: req.user.userId,
      p_code: code,
    });
    if (error) throw error;

    if (!result.success) {
      const msgMap = {
        qr_not_found:    '儲值代碼不存在',
        qr_already_used: '此儲值代碼已使用',
        qr_expired:      '儲值代碼已過期',
      };
      return res.status(400).json({
        success: false,
        message: msgMap[result.error] || '儲值失敗',
      });
    }

    res.json({
      success: true,
      message: `成功儲值 $${result.amount}！`,
      amount: result.amount,
      newBalance: result.new_balance,
    });
  } catch (error) {
    console.error('Wallet topup error:', error);
    res.status(500).json({ success: false, message: '儲值失敗' });
  }
});

// W3. 用戶查詢錢包餘額 + 近 30 日消費紀錄（訂單，不限付款方式）+ 儲值紀錄
app.get('/api/wallet/balance', authenticateToken, async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [walletResult, topupResult, ordersResult] = await Promise.all([
      supabase.from('wallets').select('balance').eq('user_id', req.user.userId).single(),
      // 'deduct' 類型改由 orders 表提供（見下方 orderTransactions），
      // 此處保留 topup／refund／transfer_* 等其他錢包異動類型
      supabase
        .from('wallet_transactions')
        .select('id, amount, type, note, order_ref, created_at')
        .eq('user_id', req.user.userId)
        .neq('type', 'deduct')
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false }),
      // 消費紀錄改查 orders 表，依客人 LINE ID 過濾，涵蓋現金／LINE Pay／儲值金付款
      req.user.lineUserId
        ? supabase
            .from('orders')
            .select('id, items, total_amount, payment_method, reward_code, created_at')
            .eq('customer_line_id', req.user.lineUserId)
            .eq('status', 'active')
            .gte('created_at', thirtyDaysAgo)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const otherTransactions = topupResult.data || [];

    // Enrich topup transactions with topup QR payment method (cash / line)
    const topupRefs = [...new Set(
      otherTransactions.filter(tx => tx.type === 'topup' && tx.order_ref).map(tx => tx.order_ref)
    )];

    const topupPaymentMap = {};
    if (topupRefs.length > 0) {
      const { data: topupRows } = await supabase
        .from('topup_qr_codes')
        .select('code, payment_method')
        .in('code', topupRefs);

      for (const row of topupRows || []) {
        if (row?.code) {
          topupPaymentMap[row.code] = row.payment_method || 'cash';
        }
      }
    }

    // refund / transfer_* 類型不套用儲值付款方式標籤，維持原本無 payment_method 的顯示
    const otherWithLabels = otherTransactions.map(tx => {
      if (tx.type !== 'topup') return tx;
      return {
        ...tx,
        payment_method: tx.order_ref ? (topupPaymentMap[tx.order_ref] || 'cash') : 'cash',
      };
    });

    const orderTransactions = (ordersResult.data || []).map(order => ({
      id: order.id,
      amount: -Math.abs(Number(order.total_amount) || 0),
      type: 'deduct',
      note: order.items?.length
        ? order.items.map(item => `${item.name}${item.qty > 1 ? ` ×${item.qty}` : ''}`).join('、')
        : null,
      order_ref: order.id,
      created_at: order.created_at,
      payment_method: order.reward_code ? 'reward_code' : (order.payment_method || 'cash'),
    }));

    const transactions = [...otherWithLabels, ...orderTransactions]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({
      success: true,
      balance: walletResult.data?.balance ?? 0,
      transactions,
    });
  } catch (error) {
    console.error('Wallet balance error:', error);
    res.status(500).json({ success: false, message: '查詢餘額失敗' });
  }
});

// W4. 預覽 QR Code 資訊（不標記為已使用，用於前台顯示確認彈窗）
app.get('/api/qrcode/info', authenticateToken, async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ success: false, message: '缺少 code 參數' });
    }

    // 儲值 QR
    if (code.startsWith('TOPUP-')) {
      const { data: qr } = await supabase
        .from('topup_qr_codes')
        .select('amount, used, expires_at')
        .eq('code', code)
        .single();

      if (!qr) return res.status(404).json({ success: false, message: '代碼不存在' });
      if (qr.used) return res.status(400).json({ success: false, message: '已使用' });
      if (new Date(qr.expires_at) < new Date()) {
        return res.status(400).json({ success: false, message: '已過期' });
      }
      return res.json({ success: true, type: 'topup', amount: qr.amount });
    }

    // 點單 QR（含 wallet_amount 時需確認付款）
    const { data: qr } = await supabase
      .from('qr_codes')
      .select('cup_count, wallet_amount, used, expires_at')
      .eq('code', code)
      .single();

    if (!qr) return res.status(404).json({ success: false, message: '代碼不存在' });
    if (qr.used) return res.status(400).json({ success: false, message: '已使用' });
    if (new Date(qr.expires_at) < new Date()) {
      return res.status(400).json({ success: false, message: '已過期' });
    }

    return res.json({
      success: true,
      type: 'gacha',
      cupCount: qr.cup_count || 1,
      walletAmount: qr.wallet_amount || 0,
    });
  } catch (error) {
    console.error('QR info error:', error);
    res.status(500).json({ success: false, message: '查詢失敗' });
  }
});

// ===== 錢包轉帳 API =====

// WT1. 建立轉帳連結（從發送方扣款，凍結至對方領取）
app.post('/api/wallet/transfer/create', authenticateToken, walletTransferCreateLimiter, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || !Number.isInteger(amount) || amount < 10 || amount > 5000) {
      return res.status(400).json({ success: false, message: '金額必須為 10~5000 之間的整數' });
    }

    const token = `WTRX-${crypto.randomBytes(16).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 小時有效

    const { data: result, error } = await supabase.rpc('create_wallet_transfer', {
      p_from_user_id: req.user.userId,
      p_amount:       amount,
      p_token:        token,
      p_expires_at:   expiresAt.toISOString(),
    });
    if (error) throw error;

    if (!result.success) {
      const msgMap = {
        wallet_not_found:     '尚未建立錢包，請先儲值',
        insufficient_balance: `餘額不足（目前 $${result.balance}，需 $${result.required}）`,
      };
      return res.status(400).json({
        success: false,
        message: msgMap[result.error] || '轉帳失敗',
        balance: result.balance ?? 0,
      });
    }

    res.json({
      success:     true,
      token,
      transferUrl: `${FRONTEND_URL}/?wtransfer=${token}`,
      amount,
      expiresAt:   expiresAt.toISOString(),
      newBalance:  result.new_balance,
    });
  } catch (error) {
    console.error('Wallet transfer create error:', error);
    res.status(500).json({ success: false, message: '建立轉帳失敗' });
  }
});

// WT2. 預覽轉帳資訊（顯示金額，不需登入即可查詢，但 claim 需登入）
app.get('/api/wallet/transfer/status', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== 'string' || !token.startsWith('WTRX-')) {
      return res.status(400).json({ success: false, message: '無效的轉帳代碼' });
    }

    const { data: transfer } = await supabase
      .from('wallet_transfers')
      .select('amount, status, expires_at, created_at')
      .eq('token', token)
      .single();

    if (!transfer) {
      return res.status(404).json({ success: false, message: '轉帳代碼不存在' });
    }

    const isExpired = transfer.status === 'pending' && new Date(transfer.expires_at) < new Date();

    res.json({
      success:   true,
      amount:    transfer.amount,
      status:    isExpired ? 'expired' : transfer.status,
      expiresAt: transfer.expires_at,
    });
  } catch (error) {
    console.error('Wallet transfer status error:', error);
    res.status(500).json({ success: false, message: '查詢失敗' });
  }
});

// WT3. 領取轉帳（需 LINE 登入）
app.post('/api/wallet/transfer/claim', authenticateToken, walletTransferClaimLimiter, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string' || !token.startsWith('WTRX-')) {
      return res.status(400).json({ success: false, message: '無效的轉帳代碼' });
    }

    const { data: result, error } = await supabase.rpc('claim_wallet_transfer', {
      p_token:      token,
      p_claimer_id: req.user.userId,
    });
    if (error) throw error;

    if (!result.success) {
      const msgMap = {
        not_found:       '轉帳代碼不存在',
        already_claimed: '此轉帳已被領取',
        cancelled:       '此轉帳已被取消',
        expired:         '轉帳連結已過期，金額已退回給轉帳方',
        self_claim:      '不能領取自己發送的轉帳',
      };
      return res.status(400).json({
        success: false,
        message: msgMap[result.error] || '領取失敗',
      });
    }

    res.json({
      success:    true,
      message:    `成功收到 $${result.amount} 儲值金！`,
      amount:     result.amount,
    });
  } catch (error) {
    console.error('Wallet transfer claim error:', error);
    res.status(500).json({ success: false, message: '領取失敗' });
  }
});

// WT4. 取消轉帳（僅發送方可取消，退款回帳）
app.post('/api/wallet/transfer/cancel', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== 'string' || !token.startsWith('WTRX-')) {
      return res.status(400).json({ success: false, message: '無效的轉帳代碼' });
    }

    const { data: result, error } = await supabase.rpc('cancel_wallet_transfer', {
      p_token:   token,
      p_user_id: req.user.userId,
    });
    if (error) throw error;

    if (!result.success) {
      const msgMap = {
        not_found:    '轉帳代碼不存在',
        unauthorized: '您無權取消此轉帳',
        claimed:      '此轉帳已被領取，無法取消',
        cancelled:    '此轉帳已取消',
        expired:      '此轉帳已過期',
      };
      return res.status(400).json({
        success: false,
        message: msgMap[result.error] || '取消失敗',
      });
    }

    res.json({
      success:  true,
      message:  `已取消轉帳，$${result.refunded} 已退回您的錢包`,
      refunded: result.refunded,
    });
  } catch (error) {
    console.error('Wallet transfer cancel error:', error);
    res.status(500).json({ success: false, message: '取消失敗' });
  }
});

// ===== 月報表 API =====

// R1. 產生月報表（銷售 / 會員 / 儲值 / 庫存）
app.get('/api/admin/reports/monthly', authenticateAdmin, async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year) || now.getFullYear();
    const month = parseInt(req.query.month) || (now.getMonth() + 1);

    // 計算當月起訖（UTC 字串）
    const monthStart = new Date(Date.UTC(year, month - 1, 1)).toISOString();
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).toISOString();

    // 並行查詢
    const [ordersResult, totalUsersResult, newUsersResult, topupsResult, spendResult, inventoryResult] = await Promise.all([
      // 當月訂單（排除已作廢）
      supabase
        .from('orders')
        .select('*')
        .eq('status', 'active')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd),

      // 總會員數
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true }),

      // 當月新增會員
      supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd),

      // 當月儲值統計
      supabase
        .from('wallet_transactions')
        .select('amount')
        .eq('type', 'topup')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd),

      // 當月消費統計（扣款為 deduct；退款作廢 refund 需扣回算淨消費）
      supabase
        .from('wallet_transactions')
        .select('amount')
        .in('type', ['deduct', 'refund'])
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd),

      // 最後一次庫存盤點
      supabase
        .from('inventory')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    // 計算銷售匯總
    const orders = ordersResult.data || [];
    let totalRevenue = 0, cashAmount = 0, linePayAmount = 0;
    let cashCount = 0, linePayCount = 0, totalCups = 0;
    const itemMap = {};

    for (const order of orders) {
      const amount = order.total_amount || 0;
      totalRevenue += amount;

      if (order.payment_method === 'line_pay') {
        linePayCount++;
        linePayAmount += amount;
      } else if (order.payment_method === 'cash') {
        cashCount++;
        cashAmount += amount;
      }

      for (const item of order.items || []) {
        totalCups += item.qty || 0;
        itemMap[item.name] = (itemMap[item.name] || 0) + (item.qty || 0);
      }
    }

    const topItems = Object.entries(itemMap)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => ({ name, count }));

    // 計算儲值統計
    const topups = topupsResult.data || [];
    const totalTopupAmount = topups.reduce((s, t) => s + (t.amount || 0), 0);
    // deduct 為負、refund 為正；淨消費 = -(總和)，退款作廢自動沖回
    const spends = spendResult.data || [];
    const totalSpent = Math.max(0, -spends.reduce((s, t) => s + (t.amount || 0), 0));

    res.json({
      success: true,
      report: {
        period: { year, month },
        sales: {
          totalOrders: orders.length,
          totalRevenue,
          cashAmount,
          linePayAmount,
          cashCount,
          linePayCount,
          totalCups,
          topItems,
        },
        members: {
          totalUsers: totalUsersResult.count ?? 0,
          newUsers: newUsersResult.count ?? 0,
        },
        wallet: {
          totalTopups: topups.length,
          totalTopupAmount,
          totalSpent,
        },
        inventory: {
          lastRecord: inventoryResult.data ?? null,
        },
      },
    });
  } catch (error) {
    console.error('Monthly report error:', error);
    res.status(500).json({ success: false, message: '報表產生失敗' });
  }
});

// R2. 管理員查詢儲值金明細（含用戶 LINE 資訊）
app.get('/api/admin/wallet-transactions', authenticateAdmin, async (req, res) => {
  try {
    const { start, end } = req.query;

    let query = supabase
      .from('wallet_transactions')
      .select('id, amount, type, note, order_ref, created_at, users(display_name, line_user_id)')
      .order('created_at', { ascending: false });

    if (start) query = query.gte('created_at', start);
    if (end) query = query.lte('created_at', end);

    const { data, error } = await query;
    if (error) throw error;

    const transactions = data || [];

    // 為 topup 類型附上儲值 QR 的付款方式（cash / line），讓統計與 CSV 能區分
    // LINE Pay 與現金儲值入帳。refund / transfer_* 類型維持無 payment_method。
    const topupRefs = [...new Set(
      transactions.filter((tx) => tx.type === 'topup' && tx.order_ref).map((tx) => tx.order_ref)
    )];

    const topupPaymentMap = {};
    if (topupRefs.length > 0) {
      const { data: topupRows } = await supabase
        .from('topup_qr_codes')
        .select('code, payment_method')
        .in('code', topupRefs);
      for (const row of topupRows || []) {
        if (row?.code) topupPaymentMap[row.code] = row.payment_method || 'cash';
      }
    }

    const enriched = transactions.map((tx) => {
      if (tx.type !== 'topup') return tx;
      return {
        ...tx,
        payment_method: tx.order_ref ? (topupPaymentMap[tx.order_ref] || 'cash') : 'cash',
      };
    });

    res.json({ success: true, transactions: enriched });
  } catch (error) {
    console.error('Wallet transactions error:', error);
    res.status(500).json({ success: false, message: '查詢失敗' });
  }
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 咖啡地圖收集遊戲 API 伺服器運行於 http://localhost:${PORT}`);
  console.log(`📊 ADMIN_TOKEN: ${ADMIN_TOKEN}`);
});

module.exports = app;
