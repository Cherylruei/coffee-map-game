// api/gacha/pull.js
const { getSupabase, setCors, requireAuth } = require('../_lib');

const CARD_WEIGHTS = {
  1: 2.5,  2: 2.5,
  3: 5,    4: 5,    5: 5,
  6: 10,   7: 10,   8: 10,   9: 10,
  10: 16.7, 11: 16.7, 12: 16.6,
};

function pullCard() {
  const total = Object.values(CARD_WEIGHTS).reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of Object.entries(CARD_WEIGHTS)) {
    r -= w;
    if (r <= 0) return parseInt(id);
  }
  return 12;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const user = requireAuth(req, res);
  if (!user) return;

  const { qrCode } = req.body;
  const supabase = getSupabase();

  try {
    // 驗證 QR Code
    const { data: qrData } = await supabase
      .from('qr_codes')
      .select('*')
      .eq('code', qrCode)
      .single();

    if (!qrData)
      return res.status(400).json({ success: false, message: 'QR Code 無效' });
    if (qrData.used)
      return res.status(400).json({ success: false, message: 'QR Code 已被使用' });
    if (new Date(qrData.expires_at) < new Date())
      return res.status(400).json({ success: false, message: 'QR Code 已過期' });

    const cardId = pullCard();

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
      .from('qr_codes')
      .update({ used: true, used_by: user.userId, used_at: new Date().toISOString() })
      .eq('code', qrCode);

    await supabase.from('gacha_history').insert({
      user_id: user.userId,
      card_id: cardId,
      qr_code: qrCode,
      is_new: isNew,
    });

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
    console.error('Gacha pull error:', error);
    res.status(500).json({ success: false, message: '抽卡失敗' });
  }
}
