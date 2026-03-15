import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CARDS, RARITY_COLORS } from '../../utils/cards';

interface GachaAnimationProps {
  cardId: number | null;
  isNew: boolean;
  onComplete: () => void;
}

type Phase = 'entering' | 'revealed' | 'collecting';

const RARITY_STARS: Record<string, string> = {
  SSR: '✦ ✦ ✦',
  SR:  '✦ ✦',
  R:   '✦',
  N:   '○',
};

export function GachaAnimation({ cardId, isNew, onComplete }: GachaAnimationProps) {
  const [phase, setPhase] = useState<Phase>('entering');

  useEffect(() => {
    const t = setTimeout(() => setPhase('revealed'), 1100);
    return () => clearTimeout(t);
  }, []);

  if (!cardId) return null;
  const card   = CARDS[cardId];
  const rStyle = RARITY_COLORS[card.rarity];

  const handleCollect = () => {
    setPhase('collecting');
    setTimeout(onComplete, 800);
  };

  return (
    <motion.div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center',
        // 上方對齊，讓圖片區域優先顯示
        justifyContent: 'flex-start',
        paddingTop: 'max(env(safe-area-inset-top, 0px), 36px)',
        overflow: 'hidden',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* 深色背景 — collecting 時淡出，讓使用者看到寶箱 */}
      <motion.div
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.96)', zIndex: 0 }}
        animate={{ opacity: phase === 'collecting' ? 0 : 1 }}
        transition={{ duration: 0.35 }}
      />

      {/* Rotating ray bg */}
      <AnimatePresence>
        {phase === 'revealed' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, rotate: 360 }}
            exit={{ opacity: 0 }}
            transition={{ rotate: { duration: 12, repeat: Infinity, ease: 'linear' }, opacity: { duration: 0.5 } }}
            style={{
              position: 'absolute', width: '220vmax', height: '220vmax',
              background: `conic-gradient(from 0deg,
                transparent 0deg, ${rStyle.border}28 15deg, transparent 30deg,
                transparent 60deg, ${rStyle.border}28 75deg, transparent 90deg,
                transparent 120deg, ${rStyle.border}28 135deg, transparent 150deg,
                transparent 180deg, ${rStyle.border}28 195deg, transparent 210deg,
                transparent 240deg, ${rStyle.border}28 255deg, transparent 270deg,
                transparent 300deg, ${rStyle.border}28 315deg, transparent 330deg,
                transparent 360deg)`,
              pointerEvents: 'none', zIndex: 1,
            }}
          />
        )}
      </AnimatePresence>

      {/* Glow pulse */}
      <AnimatePresence>
        {phase === 'revealed' && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: [1, 1.4, 1] }}
            exit={{ opacity: 0 }}
            transition={{ scale: { duration: 2.5, repeat: Infinity }, opacity: { duration: 0.4 } }}
            style={{
              position: 'absolute', width: '60vw', height: '60vw',
              maxWidth: '360px', maxHeight: '360px', borderRadius: '50%',
              background: `radial-gradient(circle, ${rStyle.border}50 0%, transparent 70%)`,
              filter: 'blur(20px)', pointerEvents: 'none', zIndex: 1,
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Card ── */}
      <motion.div
        style={{ position: 'relative', zIndex: 2, transformOrigin: 'center center' }}
        initial={{ scale: 0, rotateY: -180, opacity: 0 }}
        animate={
          phase === 'collecting'
            ? { scale: 0.04, x: '42vw', y: '44vh', opacity: 0 }
            : { scale: 1, rotateY: 0, opacity: 1 }
        }
        transition={
          phase === 'collecting'
            ? { duration: 0.65, ease: [0.6, 0, 0.8, 1] }
            : { type: 'spring', stiffness: 55, damping: 13 }
        }
      >
        <div
          style={{
            width: 'min(300px, 88vw)',
            background: rStyle.bg,
            borderRadius: '24px',
            border: `3px solid ${rStyle.border}`,
            boxShadow: `${rStyle.glow}, 0 24px 80px rgba(0,0,0,0.7)`,
            overflow: 'hidden',
            userSelect: 'none',
          }}
        >
          {/* Top row */}
          <div style={{ padding: '14px 14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{
              background: rStyle.border, color: 'white',
              padding: '4px 14px', borderRadius: '30px',
              fontSize: '13px', fontWeight: 'bold', letterSpacing: '1px',
            }}>
              {card.rarity}
            </span>
            {isNew && (
              <motion.span
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ duration: 0.7, repeat: Infinity }}
                style={{ background: '#ff4444', color: 'white', padding: '4px 14px', borderRadius: '30px', fontSize: '13px', fontWeight: 'bold' }}
              >
                NEW!
              </motion.span>
            )}
          </div>

          {/* Card image — 圖片為主視覺，佔大部分空間 */}
          <div style={{
            margin: '12px 14px',
            height: 'min(220px, 52vw)',
            borderRadius: '16px',
            overflow: 'hidden',
            position: 'relative',
            background: 'rgba(255,255,255,0.1)',
          }}>
            <img
              src={card.image}
              alt={card.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {/* Shimmer for SSR/SR */}
            {(card.rarity === 'SSR' || card.rarity === 'SR') && (
              <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1 }}
                style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)',
                }}
              />
            )}
            <div style={{
              position: 'absolute', bottom: '8px', left: 0, right: 0,
              textAlign: 'center', fontSize: '14px',
              color: 'rgba(255,255,255,0.9)', letterSpacing: '4px',
              textShadow: '0 1px 4px rgba(0,0,0,0.7)',
            }}>
              {RARITY_STARS[card.rarity]}
            </div>
          </div>

          {/* Info */}
          <div style={{ background: 'rgba(255,255,255,0.97)', padding: '14px 18px 18px' }}>
            <h2 style={{ margin: '0 0 3px', fontSize: 'clamp(16px, 5vw, 22px)', color: rStyle.text, fontWeight: 'bold' }}>
              {card.name}
            </h2>
            <p style={{ margin: '0 0 8px', color: '#888', fontSize: '13px' }}>📍 {card.origin}</p>
            <p style={{ margin: 0, color: '#555', fontSize: '12px', lineHeight: 1.6 }}>{card.description}</p>
          </div>
        </div>
      </motion.div>

      {/* Collect button */}
      <AnimatePresence>
        {phase === 'revealed' && (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.2 }}
            onClick={handleCollect}
            style={{
              marginTop: '20px', padding: '14px 44px',
              background: `linear-gradient(135deg, ${rStyle.border} 0%, ${rStyle.border}bb 100%)`,
              color: 'white', border: 'none', borderRadius: '50px',
              fontSize: 'clamp(15px, 4vw, 17px)', fontWeight: 'bold',
              cursor: 'pointer', boxShadow: `0 8px 28px ${rStyle.border}66`,
              position: 'relative', zIndex: 3, letterSpacing: '0.5px',
            }}
          >
            確認收集 ✓
          </motion.button>
        )}
      </AnimatePresence>

      {phase === 'entering' && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1, repeat: Infinity }}
          style={{ color: '#888', fontSize: '14px', marginTop: '20px', position: 'relative', zIndex: 2 }}
        >
          ✨ 開封中…
        </motion.p>
      )}
    </motion.div>
  );
}
