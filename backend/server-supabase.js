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

const app = express();
const PORT = process.env.PORT || 3000;

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

// ADMIN_TOKEN 移到最上面，所有路由都能用到
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret-token';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

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

// JWT 驗證中間件（一般用戶）
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token)
    return res.status(401).json({ success: false, message: '未授權' });

  jwt.verify(token, CONFIG.JWT_SECRET, (err, user) => {
    if (err)
      return res.status(403).json({ success: false, message: 'Token 無效' });
    req.user = user;
    next();
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
      user: {
        userId: user.line_user_id,
        displayName: user.display_name,
        pictureUrl: user.picture_url,
      },
      token,
    });
  } catch (error) {
    console.error('LINE login error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: '登入失敗' });
  }
});

// 2. 取得用戶收藏
app.get('/api/user/collection', authenticateToken, async (req, res) => {
  try {
    const { data: user } = await supabase
      .from('users')
      .select('share_tokens')
      .eq('id', req.user.userId)
      .single();

    const { data: collections } = await supabase
      .from('collection')
      .select('card_id, count')
      .eq('user_id', req.user.userId);

    const collection = {};
    collections?.forEach((item) => {
      collection[item.card_id] = item.count;
    });

    res.json({
      success: true,
      collection,
      shareTokens: user?.share_tokens || 3,
    });
  } catch (error) {
    console.error('Get collection error:', error);
    res.status(500).json({ success: false, message: '取得收藏失敗' });
  }
});

// 3. 抽卡 API
app.post('/api/gacha/pull', authenticateToken, async (req, res) => {
  try {
    const { qrCode } = req.body;

    const { data: qrData } = await supabase
      .from('qr_codes')
      .select('*')
      .eq('code', qrCode)
      .single();

    if (!qrData)
      return res.status(400).json({ success: false, message: 'QR Code 無效' });
    if (qrData.used)
      return res
        .status(400)
        .json({ success: false, message: 'QR Code 已被使用' });
    if (new Date(qrData.expires_at) < new Date())
      return res
        .status(400)
        .json({ success: false, message: 'QR Code 已過期' });

    const cardId = pullCard();

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

    await supabase
      .from('qr_codes')
      .update({
        used: true,
        used_by: req.user.userId,
        used_at: new Date().toISOString(),
      })
      .eq('code', qrCode);

    await supabase.from('gacha_history').insert({
      user_id: req.user.userId,
      card_id: cardId,
      qr_code: qrCode,
      is_new: isNew,
    });

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
    console.error('Gacha pull error:', error);
    res.status(500).json({ success: false, message: '抽卡失敗' });
  }
});

// 4. 分享卡片
app.post('/api/share/create', authenticateToken, async (req, res) => {
  try {
    const { cardId } = req.body;

    const { data: user } = await supabase
      .from('users')
      .select('share_tokens')
      .eq('id', req.user.userId)
      .single();

    if (!user || user.share_tokens <= 0)
      return res
        .status(400)
        .json({ success: false, message: '分享次數已用完' });

    const { data: card } = await supabase
      .from('collection')
      .select('count')
      .eq('user_id', req.user.userId)
      .eq('card_id', cardId)
      .single();

    if (!card || card.count <= 1)
      return res
        .status(400)
        .json({ success: false, message: '該卡片數量不足，無法分享' });

    const shareCode = `SHARE-${crypto.randomBytes(8).toString('hex')}`;

    await supabase.from('shares').insert({
      share_code: shareCode,
      from_user_id: req.user.userId,
      card_id: cardId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await supabase
      .from('collection')
      .update({ count: card.count - 1 })
      .eq('user_id', req.user.userId)
      .eq('card_id', cardId);

    await supabase
      .from('users')
      .update({ share_tokens: user.share_tokens - 1 })
      .eq('id', req.user.userId);

    res.json({
      success: true,
      shareCode,
      shareUrl: `${req.protocol}://${req.get('host')}/?share=${shareCode.replace('SHARE-', '')}`,
      remainingTokens: user.share_tokens - 1,
    });
  } catch (error) {
    console.error('Share create error:', error);
    res.status(500).json({ success: false, message: '分享失敗' });
  }
});

// 5. 領取分享的卡片
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
    if (shareData.from_user_id === req.user.userId)
      return res
        .status(400)
        .json({ success: false, message: '無法領取自己分享的卡片' });
    if (new Date(shareData.expires_at) < new Date())
      return res
        .status(400)
        .json({ success: false, message: '分享連結已過期' });

    const cardId = shareData.card_id;

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

// ===== 店家後台 API =====

// 6. 生成抽卡 QR Code
app.post('/api/admin/qrcode/generate', authenticateAdmin, async (req, res) => {
  try {
    const { quantity = 1, expiresInDays = 30 } = req.body;
    const expiresAt = new Date(
      Date.now() + expiresInDays * 24 * 60 * 60 * 1000,
    );
    const qrCodes = [];

    for (let i = 0; i < quantity; i++) {
      const code = `COFFEE-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      await supabase
        .from('qr_codes')
        .insert({ code, expires_at: expiresAt.toISOString() });
      qrCodes.push({
        code,
        url: `${FRONTEND_URL}/?qr=${code}`,
      });
    }

    res.json({ success: true, qrCodes });
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

    const { data, error } = await supabase
      .from('orders')
      .insert({
        staff_line_id: staffLineId || null,
        staff_name: staffName || '未知員工',
        items,
        total_amount: totalAmount,
        discount: discount || 0,
        payment_method: paymentMethod || 'cash',
        employee_id: employeeId || null,
        qr_codes: qrCodes || [],
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Supabase 插入錯誤:', error);
      throw error;
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
    const { error } = await supabase
      .from('orders')
      .update({
        items,
        total_amount: totalAmount,
        discount: discount ?? 0,
        payment_method: paymentMethod || 'cash',
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

// 13. 刪除訂單
app.delete('/api/admin/order/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
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
      } else {
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
      return res.json({ success: true, categories: setting.value.categories });
    }
  } catch (_) {
    /* settings 表不存在時直接 fallback */
  }

  try {
    const menu = require('./menu.json');
    res.json({ success: true, ...menu });
  } catch (error) {
    console.error('Get menu error:', error);
    res.status(500).json({ success: false, message: '取得菜單失敗' });
  }
});

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
