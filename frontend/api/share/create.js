// api/share/create.js
const crypto = require('crypto');
const { getSupabase, setCors, requireAuth } = require('../_lib');

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const { cardId } = req.body;
  const supabase = getSupabase();

  try {
    const { data: userData } = await supabase
      .from('users')
      .select('share_tokens')
      .eq('id', user.userId)
      .single();

    if (!userData || userData.share_tokens <= 0)
      return res.status(400).json({ success: false, message: '分享次數已用完' });

    const { data: card } = await supabase
      .from('collection')
      .select('count')
      .eq('user_id', user.userId)
      .eq('card_id', cardId)
      .single();

    if (!card || card.count <= 1)
      return res.status(400).json({ success: false, message: '該卡片數量不足，無法分享' });

    const shareCode = `SHARE-${crypto.randomBytes(8).toString('hex')}`;

    await supabase.from('shares').insert({
      share_code: shareCode,
      from_user_id: user.userId,
      card_id: cardId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });

    await supabase
      .from('collection')
      .update({ count: card.count - 1 })
      .eq('user_id', user.userId)
      .eq('card_id', cardId);

    await supabase
      .from('users')
      .update({ share_tokens: userData.share_tokens - 1 })
      .eq('id', user.userId);

    // shareUrl 讓前台用 ?share=xxx 帶入，merchant 不需要知道
    const host = req.headers.host;
    const proto = process.env.VERCEL ? 'https' : req.headers['x-forwarded-proto'] || 'http';

    res.json({
      success: true,
      shareCode,
      shareUrl: `${proto}://${host}/?share=${shareCode.replace('SHARE-', '')}`,
      remainingTokens: userData.share_tokens - 1,
    });
  } catch (error) {
    console.error('Share create error:', error);
    res.status(500).json({ success: false, message: '分享失敗' });
  }
}
