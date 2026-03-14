// frontend/api/admin/login.js
// 工作人員輸入密碼 → 伺服器比對 ADMIN_TOKEN → 成功才回傳 session token
const jwt = require('jsonwebtoken');
const { setCors } = require('../_lib');

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { password } = req.body;

  // ADMIN_TOKEN 永遠留在伺服器，HTML 看不到
  if (password !== process.env.ADMIN_TOKEN) {
    await new Promise((r) => setTimeout(r, 500)); // 防暴力猜測
    return res.status(401).json({ success: false, message: '密碼錯誤' });
  }

  // 驗證成功，發一個 4 小時有效的 admin session token
  const sessionToken = jwt.sign({ role: 'admin' }, process.env.JWT_SECRET, {
    expiresIn: '4h',
  });

  res.json({ success: true, sessionToken });
}
