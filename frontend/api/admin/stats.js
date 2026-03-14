// api/admin/stats.js
const { getSupabase, setCors, requireAdmin } = require('../_lib');

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();
  if (!requireAdmin(req, res)) return;

  const supabase = getSupabase();

  try {
    const [
      { count: totalUsers },
      { count: totalGachas },
      { count: totalQRCodes },
      { count: usedQRCodes },
      { data: cardDist },
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('gacha_history').select('*', { count: 'exact', head: true }),
      supabase.from('qr_codes').select('*', { count: 'exact', head: true }),
      supabase.from('qr_codes').select('*', { count: 'exact', head: true }).eq('used', true),
      supabase.from('gacha_history').select('card_id'),
    ]);

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
        cardDistribution,
      },
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ success: false, message: '統計失敗' });
  }
}
