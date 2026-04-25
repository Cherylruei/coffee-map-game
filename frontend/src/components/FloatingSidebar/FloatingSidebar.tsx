import { motion, AnimatePresence } from 'framer-motion';
import { IconContext } from 'react-icons';
import { GiOpenTreasureChest } from 'react-icons/gi';
import { FaRegShareSquare } from 'react-icons/fa';
import { MdReceiptLong } from 'react-icons/md';

interface FloatingSidebarProps {
  onTreasureClick: () => void;
  onShareClick: () => void;
  onHistoryClick: () => void;
  collectedCount: number;
  shareTokens: number;
  showChestHint?: boolean;
}

export function FloatingSidebar({
  onTreasureClick,
  onShareClick,
  onHistoryClick,
  collectedCount,
  shareTokens,
  showChestHint = false,
}: FloatingSidebarProps) {
  return (
    <IconContext.Provider value={{ style: { verticalAlign: 'middle' } }}>
      <motion.div
        className='floating-sidebar'
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, type: 'spring' }}
        style={{
          position: 'fixed',
          right: '16px',
          bottom: '24px',
          width: '56px',
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '28px',
          padding: '12px 0',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          zIndex: 10001, // 高於抽卡動畫(9999)，collecting 時可見
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* Treasure Box */}
        <div style={{ position: 'relative' }}>
          <motion.button
            onClick={onTreasureClick}
            whileHover={{ scale: 1.15 }}
            whileTap={{ scale: 0.9 }}
            aria-label='寶箱圖鑑'
            animate={showChestHint ? { scale: [1, 1.18, 1] } : {}}
            transition={showChestHint ? { duration: 0.7, repeat: Infinity } : {}}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              width: '42px',
              height: '42px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              position: 'relative',
              padding: 0,
            }}
          >
            <GiOpenTreasureChest size={28} color={showChestHint ? '#e09a10' : '#8B4513'} />
            {collectedCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  background: '#ff4444',
                  color: 'white',
                  borderRadius: '50%',
                  width: '18px',
                  height: '18px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '10px',
                  fontWeight: 'bold',
                  border: '1.5px solid white',
                  lineHeight: 1,
                }}
              >
                {collectedCount}
              </span>
            )}
          </motion.button>

          {/* 首次收集提示氣泡 */}
          <AnimatePresence>
            {showChestHint && (
              <motion.div
                initial={{ opacity: 0, x: 10, scale: 0.8 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 10, scale: 0.8 }}
                style={{
                  position: 'absolute',
                  right: '52px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: '#c8860a',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 3px 12px rgba(200,134,10,0.5)',
                  pointerEvents: 'none',
                }}
              >
                點擊查看收集！
                {/* 箭頭 */}
                <span style={{
                  position: 'absolute',
                  right: '-6px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 0, height: 0,
                  borderTop: '5px solid transparent',
                  borderBottom: '5px solid transparent',
                  borderLeft: '6px solid #c8860a',
                }} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Divider */}
        <div style={{ width: '28px', height: '1px', background: 'rgba(0,0,0,0.1)' }} />

        {/* Transaction History */}
        <motion.button
          onClick={onHistoryClick}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          aria-label='消費紀錄'
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            width: '42px',
            height: '42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            padding: 0,
          }}
        >
          <MdReceiptLong size={24} color='#2ecc71' />
        </motion.button>

        {/* Divider */}
        <div style={{ width: '28px', height: '1px', background: 'rgba(0,0,0,0.1)' }} />

        {/* Share */}
        <motion.button
          onClick={onShareClick}
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
          aria-label='分享卡片'
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            width: '42px',
            height: '42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            position: 'relative',
            padding: 0,
          }}
        >
          <FaRegShareSquare size={24} color='#667eea' />
          {shareTokens > 0 && (
            <span
              style={{
                position: 'absolute',
                top: '-4px',
                right: '-4px',
                background: '#667eea',
                color: 'white',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                fontWeight: 'bold',
                border: '1.5px solid white',
                lineHeight: 1,
              }}
            >
              {shareTokens}
            </span>
          )}
        </motion.button>
      </motion.div>
    </IconContext.Provider>
  );
}
