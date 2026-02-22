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

// Supabase 初始化（使用 cross-fetch 取代 Node.js 18 不穩定的內建 fetch）
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    {
        global: {
            fetch: fetch
        }
    }
);

// 配置
const CONFIG = {
    JWT_SECRET: process.env.JWT_SECRET || 'your-secret-key-change-this',
    LINE_CHANNEL_ID: process.env.LINE_CHANNEL_ID || 'YOUR_LINE_CHANNEL_ID',
    LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET || 'YOUR_LINE_CHANNEL_SECRET',
};

// 中間件
app.use(cors({
    origin: '*', // 允許所有來源（包括手機）
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// 咖啡卡片權重配置
const CARD_WEIGHTS = {
    1: 2.5, 2: 2.5, 3: 5, 4: 5, 5: 5, 6: 10,
    7: 10, 8: 10, 9: 10, 10: 16.7, 11: 16.7, 12: 16.6
};

// 加權隨機抽卡
function pullCard() {
    const totalWeight = Object.values(CARD_WEIGHTS).reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let [cardId, weight] of Object.entries(CARD_WEIGHTS)) {
        random -= weight;
        if (random <= 0) return parseInt(cardId);
    }
    return 12;
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

// 已處理過的授權碼（防止重複使用）
const processedCodes = new Set();

// 1. LINE Login 回調處理
app.post('/api/auth/line/callback', async (req, res) => {
    try {
        const { code, redirectUri } = req.body;

        // 防止同一個 code 被重複使用
        if (processedCodes.has(code)) {
            return res.status(400).json({ success: false, message: '授權碼已使用' });
        }
        processedCodes.add(code);

        // 清理過期的 code（保留最近 100 個）
        if (processedCodes.size > 100) {
            const codes = Array.from(processedCodes);
            codes.slice(0, codes.length - 100).forEach(c => processedCodes.delete(c));
        }

        // 交換 access token
        const tokenResponse = await axios.post('https://api.line.me/oauth2/v2.1/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: redirectUri,
                client_id: CONFIG.LINE_CHANNEL_ID,
                client_secret: CONFIG.LINE_CHANNEL_SECRET
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const accessToken = tokenResponse.data.access_token;

        // 取得用戶資料
        const profileResponse = await axios.get('https://api.line.me/v2/profile', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        const lineProfile = profileResponse.data;

        // 檢查或創建用戶
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
                    share_tokens: 3
                })
                .select()
                .single();

            if (error) throw error;
            user = newUser;
        }

        // 生成 JWT
        const token = jwt.sign(
            { userId: user.id, lineUserId: user.line_user_id },
            CONFIG.JWT_SECRET,
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            user: {
                userId: user.line_user_id,
                displayName: user.display_name,
                pictureUrl: user.picture_url
            },
            token
        });

    } catch (error) {
        console.error('LINE login error:', error.response?.data || error.message);
        res.status(500).json({ success: false, message: '登入失敗' });
    }
});

// 2. 取得用戶收藏
app.get('/api/user/collection', authenticateToken, async (req, res) => {
    try {
        // 取得用戶資料
        const { data: user } = await supabase
            .from('users')
            .select('share_tokens')
            .eq('id', req.user.userId)
            .single();

        // 取得收藏
        const { data: collections } = await supabase
            .from('collection')
            .select('card_id, count')
            .eq('user_id', req.user.userId);

        const collection = {};
        collections?.forEach(item => {
            collection[item.card_id] = item.count;
        });

        res.json({
            success: true,
            collection,
            shareTokens: user?.share_tokens || 3
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

        // 驗證 QR Code
        const { data: qrData } = await supabase
            .from('qr_codes')
            .select('*')
            .eq('code', qrCode)
            .single();

        if (!qrData) {
            return res.status(400).json({ success: false, message: 'QR Code 無效' });
        }

        if (qrData.used) {
            return res.status(400).json({ success: false, message: 'QR Code 已被使用' });
        }

        if (new Date(qrData.expires_at) < new Date()) {
            return res.status(400).json({ success: false, message: 'QR Code 已過期' });
        }

        // 執行抽卡
        const cardId = pullCard();

        // 檢查是否是新卡
        const { data: existingCard } = await supabase
            .from('collection')
            .select('count')
            .eq('user_id', req.user.userId)
            .eq('card_id', cardId)
            .single();

        const isNew = !existingCard;

        // 更新或插入收藏
        if (existingCard) {
            await supabase
                .from('collection')
                .update({ count: existingCard.count + 1 })
                .eq('user_id', req.user.userId)
                .eq('card_id', cardId);
        } else {
            await supabase
                .from('collection')
                .insert({
                    user_id: req.user.userId,
                    card_id: cardId,
                    count: 1
                });
        }

        // 標記 QR Code 為已使用
        await supabase
            .from('qr_codes')
            .update({
                used: true,
                used_by: req.user.userId,
                used_at: new Date().toISOString()
            })
            .eq('code', qrCode);

        // 記錄抽卡歷史
        await supabase
            .from('gacha_history')
            .insert({
                user_id: req.user.userId,
                card_id: cardId,
                qr_code: qrCode,
                is_new: isNew
            });

        // 取得更新後的收藏
        const { data: updatedCollections } = await supabase
            .from('collection')
            .select('card_id, count')
            .eq('user_id', req.user.userId);

        const collection = {};
        updatedCollections?.forEach(item => {
            collection[item.card_id] = item.count;
        });

        res.json({
            success: true,
            card: { id: cardId },
            isNew,
            collection
        });

    } catch (error) {
        console.error('Gacha pull error:', error);
        res.status(500).json({ success: false, message: '抽卡失敗' });
    }
});

// 4. 分享卡片（生成分享連結）
app.post('/api/share/create', authenticateToken, async (req, res) => {
    try {
        const { cardId } = req.body;

        // 取得用戶資料
        const { data: user } = await supabase
            .from('users')
            .select('share_tokens')
            .eq('id', req.user.userId)
            .single();

        if (!user || user.share_tokens <= 0) {
            return res.status(400).json({ success: false, message: '分享次數已用完' });
        }

        // 檢查卡片數量
        const { data: card } = await supabase
            .from('collection')
            .select('count')
            .eq('user_id', req.user.userId)
            .eq('card_id', cardId)
            .single();

        if (!card || card.count <= 1) {
            return res.status(400).json({ success: false, message: '該卡片數量不足，無法分享' });
        }

        // 生成分享代碼
        const shareCode = `SHARE-${crypto.randomBytes(8).toString('hex')}`;

        // 建立分享記錄
        await supabase
            .from('shares')
            .insert({
                share_code: shareCode,
                from_user_id: req.user.userId,
                card_id: cardId,
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            });

        // 扣除卡片和分享次數
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
            remainingTokens: user.share_tokens - 1
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
        const fullShareCode = shareCode.startsWith('SHARE-') ? shareCode : `SHARE-${shareCode}`;

        // 取得分享資料
        const { data: shareData } = await supabase
            .from('shares')
            .select('*')
            .eq('share_code', fullShareCode)
            .single();

        if (!shareData) {
            return res.status(400).json({ success: false, message: '分享連結無效' });
        }

        if (shareData.claimed) {
            return res.status(400).json({ success: false, message: '分享連結已被領取' });
        }

        if (shareData.from_user_id === req.user.userId) {
            return res.status(400).json({ success: false, message: '無法領取自己分享的卡片' });
        }

        if (new Date(shareData.expires_at) < new Date()) {
            return res.status(400).json({ success: false, message: '分享連結已過期' });
        }

        // 給予卡片
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
                .insert({
                    user_id: req.user.userId,
                    card_id: cardId,
                    count: 1
                });
        }

        // 標記為已使用
        await supabase
            .from('shares')
            .update({
                claimed: true,
                claimed_by: req.user.userId,
                claimed_at: new Date().toISOString()
            })
            .eq('share_code', fullShareCode);

        // 取得更新後的收藏
        const { data: updatedCollections } = await supabase
            .from('collection')
            .select('card_id, count')
            .eq('user_id', req.user.userId);

        const collection = {};
        updatedCollections?.forEach(item => {
            collection[item.card_id] = item.count;
        });

        res.json({
            success: true,
            card: { id: cardId },
            isNew,
            collection
        });

    } catch (error) {
        console.error('Share claim error:', error);
        res.status(500).json({ success: false, message: '領取失敗' });
    }
});

// ===== 店家後台 API =====

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret-token';

function authenticateAdmin(req, res, next) {
    const token = req.headers['x-admin-token'];

    if (token !== ADMIN_TOKEN) {
        return res.status(403).json({ success: false, message: '無權限' });
    }

    next();
}

// 6. 生成抽卡 QR Code
app.post('/api/admin/qrcode/generate', authenticateAdmin, async (req, res) => {
    try {
        const { quantity = 1, expiresInDays = 30 } = req.body;

        const qrCodes = [];
        const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

        for (let i = 0; i < quantity; i++) {
            const code = `COFFEE-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

            await supabase
                .from('qr_codes')
                .insert({
                    code,
                    expires_at: expiresAt.toISOString()
                });

            qrCodes.push({
                code,
                url: `${req.protocol}://${req.get('host')}/?qr=${code}`
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
            used: qrCodes?.filter(q => q.used).length || 0,
            unused: qrCodes?.filter(q => !q.used).length || 0
        });

    } catch (error) {
        console.error('QR list error:', error);
        res.status(500).json({ success: false, message: '查詢失敗' });
    }
});

// 8. 統計數據
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        const { count: totalUsers } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

        const { count: totalGachas } = await supabase
            .from('gacha_history')
            .select('*', { count: 'exact', head: true });

        const { count: totalQRCodes } = await supabase
            .from('qr_codes')
            .select('*', { count: 'exact', head: true });

        const { count: usedQRCodes } = await supabase
            .from('qr_codes')
            .select('*', { count: 'exact', head: true })
            .eq('used', true);

        // 卡片分布
        const { data: cardDist } = await supabase
            .from('gacha_history')
            .select('card_id');

        const cardDistribution = {};
        for (let i = 1; i <= 12; i++) {
            cardDistribution[i] = cardDist?.filter(h => h.card_id === i).length || 0;
        }

        res.json({
            success: true,
            stats: {
                totalUsers: totalUsers || 0,
                totalGachas: totalGachas || 0,
                totalQRCodes: totalQRCodes || 0,
                usedQRCodes: usedQRCodes || 0,
                cardDistribution
            }
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ success: false, message: '統計失敗' });
    }
});

// 健康檢查
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// 啟動伺服器
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 咖啡地圖收集遊戲 API 伺服器運行於 http://localhost:${PORT}`);
    console.log(`📡 網路訪問: http://0.0.0.0:${PORT}`);
    console.log(`📊 Supabase URL: ${process.env.SUPABASE_URL}`);
    console.log(`🔑 Admin Token: ${ADMIN_TOKEN}`);
});

module.exports = app;
