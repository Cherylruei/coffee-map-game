// api/user/collection.js
const { getSupabase, setCors, requireAuth } = require('../_lib');

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).end();

  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const supabase = getSupabase();

    const { data: userData } = await supabase
      .from('users')
      .select('share_tokens')
      .eq('id', user.userId)
      .single();

    const { data: collections } = await supabase
      .from('collection')
      .select('card_id, count')
      .eq('user_id', user.userId);

    const collection = {};
    collections?.forEach(item => {
      collection[item.card_id] = item.count;
    });

    res.json({
      success: true,
      collection,
      shareTokens: userData?.share_tokens ?? 3,
    });
  } catch (error) {
    console.error('Get collection error:', error);
    res.status(500).json({ success: false, message: '取得收藏失敗' });
  }
}
