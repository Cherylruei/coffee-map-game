// api/auth/line-callback.js
const jwt = require('jsonwebtoken');
const axios = require('axios');
const { getSupabase, setCors } = require('../_lib');

// 防止同一個 code 被重複使用（module 層級，cold start 後重置，已足夠防護）
const processedCodes = new Set();

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { code, redirectUri } = req.body;

  if (processedCodes.has(code)) {
    return res.status(400).json({ success: false, message: '授權碼已使用' });
  }
  processedCodes.add(code);
  if (processedCodes.size > 100) {
    const oldest = Array.from(processedCodes).slice(0, processedCodes.size - 100);
    oldest.forEach(c => processedCodes.delete(c));
  }

  try {
    // 交換 access token
    const tokenResponse = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: process.env.LINE_CHANNEL_ID,
        client_secret: process.env.LINE_CHANNEL_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;

    // 取得 LINE 用戶資料
    const profileResponse = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const lineProfile = profileResponse.data;

    const supabase = getSupabase();

    // 查詢或建立用戶
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
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
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
}
