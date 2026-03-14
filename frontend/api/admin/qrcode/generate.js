// api/admin/qrcode/generate.js
const crypto = require('crypto');
const { getSupabase, setCors, requireAdmin } = require('../../_lib');

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  if (!requireAdmin(req, res)) return;

  const { quantity = 1, expiresInDays = 30 } = req.body;
  const supabase = getSupabase();
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

  try {
    const qrCodes = [];

    for (let i = 0; i < quantity; i++) {
      const code = `COFFEE-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
      await supabase.from('qr_codes').insert({ code, expires_at: expiresAt });

      const host = req.headers.host;
      const proto = process.env.VERCEL ? 'https' : 'http';
      qrCodes.push({ code, url: `${proto}://${host}/?qr=${code}` });
    }

    res.json({ success: true, qrCodes });
  } catch (error) {
    console.error('QR generate error:', error);
    res.status(500).json({ success: false, message: '生成失敗' });
  }
}
