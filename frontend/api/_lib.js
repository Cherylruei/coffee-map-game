// api/_lib.js — 共用工具，所有 serverless function 都從這裡引入
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('cross-fetch');

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    { global: { fetch } },
  );
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-admin-token',
  );
}

// 驗證 JWT，成功回傳 user payload，失敗直接送回 401/403
function requireAuth(req, res) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    res.status(401).json({ success: false, message: '未授權' });
    return null;
  }
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    res.status(403).json({ success: false, message: 'Token 無效' });
    return null;
  }
}

// 驗證 Admin Token
function requireAdmin(req, res) {
  const token = req.headers['x-admin-session'];
  if (!token) {
    res.status(401).json({ success: false, message: '未登入' });
    return false;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.role !== 'admin') throw new Error();
    return true;
  } catch {
    res.status(403).json({ success: false, message: 'Session 無效或已過期' });
    return false;
  }
}

module.exports = { getSupabase, setCors, requireAuth, requireAdmin };
