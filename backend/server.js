// server.js - 咖啡地圖收集遊戲後端 API
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3001;

// 配置（實際部署時應使用環境變數）
const CONFIG = {
  JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-this',
  LINE_CHANNEL_ID: process.env.LINE_CHANNEL_ID || 'YOUR_LINE_CHANNEL_ID',
  LINE_CHANNEL_SECRET:
    process.env.LINE_CHANNEL_SECRET || 'YOUR_LINE_CHANNEL_SECRET',
};
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret-token';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// 中間件
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 資料庫模擬（實際應使用 MongoDB, PostgreSQL 等）
const DB = {
  users: new Map(),
  qrCodes: new Map(),
  gachaHistory: [],
  orders: [], // 點單紀錄
  inventory: [], // 每日盤點
};

// 咖啡卡片權重配置
const CARD_WEIGHTS = {
  1: 2.5, // 巴拿馬藝伎 (SSR)
  2: 2.5, // 牙買加藍山 (SSR)
  3: 5, // 耶加雪菲 (SR)
  4: 5, // 科納 (SR)
  5: 5, // 肯亞AA (SR)
  6: 10, // 哥倫比亞 (R)
  7: 10, // 瓜地馬拉 (R)
  8: 10, // 曼特寧 (R)
  9: 10, // 哥斯大黎加 (R)
  10: 16.7, // 巴西 (N)
  11: 16.7, // 越南 (N)
  12: 16.6, // 坦尚尼亞 (N)
};

// 加權隨機抽卡
function pullCard() {
  const totalWeight = Object.values(CARD_WEIGHTS).reduce(
    (sum, w) => sum + w,
    0,
  );
  let random = Math.random() * totalWeight;

  for (let [cardId, weight] of Object.entries(CARD_WEIGHTS)) {
    random -= weight;
    if (random <= 0) {
      return parseInt(cardId);
    }
  }

  return 12; // fallback
}

// JWT 驗證中間件
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: '未授權' });
  }

  jwt.verify(token, CONFIG.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Token 無效' });
    }
    req.user = user;
    next();
  });
}

// ===== API 路由 =====

// Admin 登入（本地測試用，對應 frontend/api/admin/login.js）
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body;

  if (password !== ADMIN_TOKEN) {
    await new Promise((r) => setTimeout(r, 500));
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

    // 交換 access token
    const tokenResponse = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri,
        client_id: CONFIG.LINE_CHANNEL_ID,
        client_secret: CONFIG.LINE_CHANNEL_SECRET,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    );

    const accessToken = tokenResponse.data.access_token;

    // 取得用戶資料
    const profileResponse = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const lineProfile = profileResponse.data;

    // 檢查或創建用戶
    let user = DB.users.get(lineProfile.userId);

    if (!user) {
      user = {
        userId: lineProfile.userId,
        displayName: lineProfile.displayName,
        pictureUrl: lineProfile.pictureUrl,
        collection: {},
        shareTokens: 3,
        createdAt: new Date(),
      };
      DB.users.set(lineProfile.userId, user);
    }

    // 生成 JWT
    const token = jwt.sign({ userId: user.userId }, CONFIG.JWT_SECRET, {
      expiresIn: '30d',
    });

    res.json({
      success: true,
      user: {
        userId: user.userId,
        displayName: user.displayName,
        pictureUrl: user.pictureUrl,
      },
      token,
    });
  } catch (error) {
    console.error('LINE login error:', error);
    res.status(500).json({
      success: false,
      message: '登入失敗',
    });
  }
});

// 2. 取得用戶收藏
app.get('/api/user/collection', authenticateToken, (req, res) => {
  const user = DB.users.get(req.user.userId);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: '用戶不存在',
    });
  }

  res.json({
    success: true,
    collection: user.collection,
    shareTokens: user.shareTokens,
  });
});

// 3. 抽卡 API
app.post('/api/gacha/pull', authenticateToken, (req, res) => {
  const { qrCode } = req.body;
  const user = DB.users.get(req.user.userId);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: '用戶不存在',
    });
  }

  // 驗證 QR Code
  const qrData = DB.qrCodes.get(qrCode);

  if (!qrData) {
    return res.status(400).json({
      success: false,
      message: 'QR Code 無效',
    });
  }

  if (qrData.used) {
    return res.status(400).json({
      success: false,
      message: 'QR Code 已被使用',
    });
  }

  if (qrData.expiresAt && new Date(qrData.expiresAt) < new Date()) {
    return res.status(400).json({
      success: false,
      message: 'QR Code 已過期',
    });
  }

  // 執行抽卡
  const cardId = pullCard();
  const isNew = !user.collection[cardId];

  if (!user.collection[cardId]) {
    user.collection[cardId] = { id: cardId, count: 1 };
  } else {
    user.collection[cardId].count += 1;
  }

  // 標記 QR Code 為已使用
  qrData.used = true;
  qrData.usedBy = user.userId;
  qrData.usedAt = new Date();

  // 記錄抽卡歷史
  DB.gachaHistory.push({
    userId: user.userId,
    cardId,
    qrCode,
    timestamp: new Date(),
    isNew,
  });

  // 儲存用戶資料
  DB.users.set(user.userId, user);

  res.json({
    success: true,
    card: { id: cardId },
    isNew,
    collection: user.collection,
  });
});

// 4. 分享卡片（生成分享連結）
app.post('/api/share/create', authenticateToken, (req, res) => {
  const { cardId } = req.body;
  const user = DB.users.get(req.user.userId);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: '用戶不存在',
    });
  }

  if (user.shareTokens <= 0) {
    return res.status(400).json({
      success: false,
      message: '分享次數已用完',
    });
  }

  if (!user.collection[cardId] || user.collection[cardId].count <= 1) {
    return res.status(400).json({
      success: false,
      message: '該卡片數量不足，無法分享',
    });
  }

  // 生成分享代碼
  const shareCode = crypto.randomBytes(8).toString('hex');

  DB.qrCodes.set(`SHARE-${shareCode}`, {
    type: 'share',
    cardId,
    fromUserId: user.userId,
    used: false,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天有效期
  });

  // 扣除卡片和分享次數
  user.collection[cardId].count -= 1;
  user.shareTokens -= 1;
  DB.users.set(user.userId, user);

  res.json({
    success: true,
    shareCode: `SHARE-${shareCode}`,
    shareUrl: `${req.protocol}://${req.get('host')}/?share=${shareCode}`,
    remainingTokens: user.shareTokens,
  });
});

// 5. 領取分享的卡片
app.post('/api/share/claim', authenticateToken, (req, res) => {
  const { shareCode } = req.body;
  const user = DB.users.get(req.user.userId);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: '用戶不存在',
    });
  }

  const shareData = DB.qrCodes.get(shareCode);

  if (!shareData || shareData.type !== 'share') {
    return res.status(400).json({
      success: false,
      message: '分享連結無效',
    });
  }

  if (shareData.used) {
    return res.status(400).json({
      success: false,
      message: '分享連結已被領取',
    });
  }

  if (shareData.fromUserId === user.userId) {
    return res.status(400).json({
      success: false,
      message: '無法領取自己分享的卡片',
    });
  }

  if (new Date(shareData.expiresAt) < new Date()) {
    return res.status(400).json({
      success: false,
      message: '分享連結已過期',
    });
  }

  // 給予卡片
  const cardId = shareData.cardId;
  const isNew = !user.collection[cardId];

  if (!user.collection[cardId]) {
    user.collection[cardId] = { id: cardId, count: 1 };
  } else {
    user.collection[cardId].count += 1;
  }

  // 標記為已使用
  shareData.used = true;
  shareData.usedBy = user.userId;
  shareData.usedAt = new Date();

  DB.users.set(user.userId, user);

  res.json({
    success: true,
    card: { id: cardId },
    isNew,
    collection: user.collection,
  });
});

// ===== 店家後台 API =====

function authenticateAdmin(req, res, next) {
  const token = req.headers['x-admin-session'];
  if (!token) {
    return res.status(401).json({ success: false, message: '未登入' });
  }
  try {
    const payload = jwt.verify(token, CONFIG.JWT_SECRET);
    if (payload.role !== 'admin') throw new Error();
    next();
  } catch {
    return res
      .status(403)
      .json({ success: false, message: 'Session 無效或已過期' });
  }
}

// 6. 生成抽卡 QR Code
app.post('/api/admin/qrcode/generate', authenticateAdmin, (req, res) => {
  const { quantity = 1, expiresInDays = 30 } = req.body;

  const qrCodes = [];

  for (let i = 0; i < quantity; i++) {
    const code = `COFFEE-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    DB.qrCodes.set(code, {
      type: 'gacha',
      used: false,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
    });

    qrCodes.push({
      code,
      url: `${FRONTEND_URL}/?qr=${code}`,
    });
  }

  res.json({
    success: true,
    qrCodes,
  });
});

// 7. 查詢 QR Code 狀態
app.get('/api/admin/qrcode/list', authenticateAdmin, (req, res) => {
  const qrCodes = [];

  for (let [code, data] of DB.qrCodes.entries()) {
    if (data.type === 'gacha') {
      qrCodes.push({
        code,
        used: data.used,
        usedBy: data.usedBy,
        usedAt: data.usedAt,
        createdAt: data.createdAt,
        expiresAt: data.expiresAt,
      });
    }
  }

  res.json({
    success: true,
    qrCodes,
    total: qrCodes.length,
    used: qrCodes.filter((q) => q.used).length,
    unused: qrCodes.filter((q) => !q.used).length,
  });
});

// 8. 統計數據
app.get('/api/admin/stats', authenticateAdmin, (req, res) => {
  const stats = {
    totalUsers: DB.users.size,
    totalGachas: DB.gachaHistory.length,
    totalQRCodes: Array.from(DB.qrCodes.values()).filter(
      (q) => q.type === 'gacha',
    ).length,
    usedQRCodes: Array.from(DB.qrCodes.values()).filter(
      (q) => q.type === 'gacha' && q.used,
    ).length,
    totalOrders: DB.orders.length,
    cardDistribution: {},
  };

  // 計算卡片分布
  for (let i = 1; i <= 12; i++) {
    stats.cardDistribution[i] = DB.gachaHistory.filter(
      (h) => h.cardId === i,
    ).length;
  }

  res.json({
    success: true,
    stats,
  });
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
app.post('/api/admin/order', authenticateAdmin, (req, res) => {
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
  const order = {
    id: crypto.randomBytes(6).toString('hex').toUpperCase(),
    staffLineId: staffLineId || null,
    staffName: staffName || '未知員工',
    items, // [{ name, qty, price, doubleShot }]
    totalAmount,
    discount: discount || 0,
    paymentMethod: paymentMethod || 'cash',
    employeeId: employeeId || null,
    qrCodes, // [code, ...]
    // 使用 ISO 日期字符串確保時間一致性
    created_at: new Date().toISOString(),
  };
  DB.orders.push(order);
  res.json({ success: true, order });
});

// 11. 查詢點單紀錄
app.get('/api/admin/orders', authenticateAdmin, (req, res) => {
  const orders = [...DB.orders].reverse();
  res.json({ success: true, orders, total: orders.length });
});

// 12. 修改訂單
app.put('/api/admin/order/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const idx = DB.orders.findIndex((o) => o.id === id);
  if (idx === -1)
    return res.status(404).json({ success: false, message: '訂單不存在' });

  const { items, totalAmount, discount, paymentMethod, employeeId } = req.body;
  DB.orders[idx] = {
    ...DB.orders[idx],
    items,
    totalAmount,
    discount: discount ?? 0,
    paymentMethod: paymentMethod || 'cash',
    employeeId: employeeId || null,
    updatedAt: new Date(),
  };
  res.json({ success: true, order: DB.orders[idx] });
});

// 13. 刪除訂單
app.delete('/api/admin/order/:id', authenticateAdmin, (req, res) => {
  const { id } = req.params;
  const idx = DB.orders.findIndex((o) => o.id === id);
  if (idx === -1)
    return res.status(404).json({ success: false, message: '訂單不存在' });
  DB.orders.splice(idx, 1);
  res.json({ success: true });
});

// 14. 今日詳細統計（盤點頁用）
app.get('/api/admin/stats/today', authenticateAdmin, (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayOrders = DB.orders.filter(
    (o) => new Date(o.created_at || o.createdAt) >= todayStart,
  );

  let totalCups = 0,
    totalRevenue = 0;
  let cashCount = 0,
    cashAmount = 0,
    linePayCount = 0,
    linePayAmount = 0;
  const staffMap = {},
    itemMap = {};

  for (const order of todayOrders) {
    const cups = (order.items || []).reduce((s, i) => s + (i.qty || 0), 0);
    totalCups += cups;
    totalRevenue += order.totalAmount || order.total_amount || 0;
    if (order.paymentMethod === 'line_pay' || order.payment_method === 'line_pay') {
      linePayCount++;
      linePayAmount += order.totalAmount || order.total_amount || 0;
    } else {
      cashCount++;
      cashAmount += order.totalAmount || order.total_amount || 0;
    }
    const sn = order.staffName || '未知';
    if (!staffMap[sn]) staffMap[sn] = { count: 0, amount: 0 };
    staffMap[sn].count++;
    staffMap[sn].amount += order.totalAmount || order.total_amount || 0;
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
    totalOrders: todayOrders.length,
    totalCups,
    totalRevenue,
    cash: { count: cashCount, amount: cashAmount },
    linePay: { count: linePayCount, amount: linePayAmount },
    staffBreakdown,
    topItems,
  });
});

// 15. 取得最近一筆盤點
app.get('/api/inventory/last', authenticateAdmin, (req, res) => {
  const last = DB.inventory.length
    ? DB.inventory[DB.inventory.length - 1]
    : null;
  res.json({ success: true, inventory: last });
});

// 16. 提交每日盤點
app.post('/api/inventory/daily', authenticateAdmin, (req, res) => {
  const {
    coffeeBeansBags,
    coffeeBeansGrams,
    milkBottles,
    milkMl,
    completedBy,
  } = req.body;
  const today = new Date().toISOString().split('T')[0];
  const existing = DB.inventory.findIndex((i) => i.date === today);
  const record = {
    date: today,
    coffee_beans_bags: coffeeBeansBags,
    coffee_beans_grams: coffeeBeansGrams,
    milk_bottles: milkBottles,
    milk_ml: milkMl,
    completed_by: completedBy || null,
    created_at: new Date(),
  };
  if (existing >= 0) DB.inventory[existing] = record;
  else DB.inventory.push(record);
  res.json({ success: true, inventory: record });
});

// 菜單保存（管理員）
app.put('/api/menu', authenticateAdmin, (req, res) => {
  try {
    const { categories } = req.body;
    if (!Array.isArray(categories)) {
      return res.status(400).json({ success: false, message: '菜單格式無效' });
    }

    const fs = require('fs');
    const path = require('path');
    const menuPath = path.join(__dirname, 'menu.json');

    // 讀取現有菜單保留 updatedAt 和 note
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
    // 清除 require 快取，下次讀取時會取得新鮮資料
    delete require.cache[require.resolve('./menu.json')];

    res.json({ success: true, categories });
  } catch (error) {
    console.error('菜單保存失敗:', error);
    res.status(500).json({ success: false, message: '菜單保存失敗' });
  }
});

// 取得菜單（公開，無需驗證）
app.get('/api/menu', (req, res) => {
  try {
    const menu = require('./menu.json');
    res.json({ success: true, ...menu });
  } catch (error) {
    res.status(500).json({ success: false, message: '菜單讀取失敗' });
  }
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`🚀 咖啡地圖收集遊戲 API 伺服器運行於 http://localhost:${PORT}`);
  console.log(`📊 店家後台 Admin Token: ${ADMIN_TOKEN}`);
});

module.exports = app;
