// api/share/claim.js
const { getSupabase, setCors, requireAuth } = require('../_lib');

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const { shareCode } = req.body;
  const fullShareCode = shareCode.startsWith('SHARE-') ? shareCode : `SHARE-${shareCode}`;
  const supabase = getSupabase();

  try {
    const { data: shareData } = await supabase
      .from('shares')
      .select('*')
      .eq('share_code', fullShareCode)
      .single();

    if (!shareData)
      return res.status(400).json({ success: false, message: '分享連結無效' });
    if (shareData.claimed)
      return res.status(400).json({ success: false, message: '分享連結已被領取' });
    if (shareData.from_user_id === user.userId)
      return res.status(400).json({ success: false, message: '無法領取自己分享的卡片' });
    if (new Date(shareData.expires_at) < new Date())
      return res.status(400).json({ success: false, message: '分享連結已過期' });

    const cardId = shareData.card_id;

    const { data: existingCard } = await supabase
      .from('collection')
      .select('count')
      .eq('user_id', user.userId)
      .eq('card_id', cardId)
      .single();

    const isNew = !existingCard;

    if (existingCard) {
      await supabase
        .from('collection')
        .update({ count: existingCard.count + 1 })
        .eq('user_id', user.userId)
        .eq('card_id', cardId);
    } else {
      await supabase.from('collection').insert({
        user_id: user.userId,
        card_id: cardId,
        count: 1,
      });
    }

    await supabase
      .from('shares')
      .update({
        claimed: true,
        claimed_by: user.userId,
        claimed_at: new Date().toISOString(),
      })
      .eq('share_code', fullShareCode);

    const { data: updatedCollections } = await supabase
      .from('collection')
      .select('card_id, count')
      .eq('user_id', user.userId);

    const collection = {};
    updatedCollections?.forEach(item => {
      collection[item.card_id] = item.count;
    });

    res.json({ success: true, card: { id: cardId }, isNew, collection });
  } catch (error) {
    console.error('Share claim error:', error);
    res.status(500).json({ success: false, message: '領取失敗' });
  }
}
