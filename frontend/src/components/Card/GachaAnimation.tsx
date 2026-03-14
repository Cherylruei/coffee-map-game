import { motion, AnimatePresence } from 'framer-motion';
import { CARDS } from '../../utils/cards';
import { CardItem } from './CardItem';

interface GachaAnimationProps {
  cardId: number | null;
  isNew: boolean;
  onComplete: () => void;
}

export function GachaAnimation({
  cardId,
  isNew,
  onComplete,
}: GachaAnimationProps) {
  if (!cardId) return null;

  const card = CARDS[cardId];

  return (
    <AnimatePresence onExitComplete={onComplete}>
      <motion.div
        className='gacha-overlay'
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          // width: '100vw',
          height: '100vh',
          background: 'rgba(0,0,0,0.9)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
        onClick={onComplete}
      >
        {/* 金光特效 (僅新卡顯示) */}
        {isNew && (
          <>
            <motion.div
              className='golden-rays'
              animate={{
                rotate: 360,
                scale: [1, 1.2, 1],
              }}
              transition={{
                rotate: { duration: 3, repeat: Infinity, ease: 'linear' },
                scale: { duration: 2, repeat: Infinity },
              }}
              style={{
                position: 'absolute',
                width: '600px',
                height: '600px',
                background:
                  'radial-gradient(circle, rgba(255,215,0,0.3) 0%, transparent 70%)',
              }}
            />
            <motion.div
              className='sparkles'
              animate={{
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
              }}
              style={{
                position: 'absolute',
                width: '100%',
                height: '100%',
                background:
                  'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 50%)',
              }}
            />
          </>
        )}

        {/* 卡片動畫 */}
        <motion.div
          initial={{ scale: 0, rotate: -180, y: 100 }}
          animate={{ scale: 1, rotate: 0, y: 0 }}
          transition={{
            type: 'spring',
            stiffness: 80,
            damping: 15,
            duration: 1.2,
          }}
        >
          <CardItem cardId={cardId} size='large' showCount={false} />
        </motion.div>

        {/* 文字提示 */}
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          style={{
            marginTop: '40px',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              color: isNew ? '#ffd700' : 'white',
              fontSize: '32px',
              margin: '0 0 10px 0',
              textShadow: '0 0 10px rgba(0,0,0,0.5)',
            }}
          >
            {isNew ? `🎉 恭喜獲得新卡！` : '抽中卡片'}
          </h2>
          <h3
            style={{
              color: 'white',
              fontSize: '24px',
              margin: 0,
              textShadow: '0 0 10px rgba(0,0,0,0.5)',
            }}
          >
            {card.name}
          </h3>
          <p
            style={{
              color: '#ccc',
              marginTop: '20px',
              fontSize: '14px',
            }}
          >
            點擊任意處繼續
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
