// api/admin/qrcode/list.js
const { getSupabase, setCors, requireAdmin } = require('../../_lib');

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();
  if (!requireAdmin(req, res)) return;

  const supabase = getSupabase();

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
      unused: qrCodes?.filter(q => !q.used).length || 0,
    });
  } catch (error) {
    console.error('QR list error:', error);
    res.status(500).json({ success: false, message: '查詢失敗' });
  }
}
