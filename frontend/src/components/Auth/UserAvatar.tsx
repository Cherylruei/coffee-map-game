import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '../../hooks/useAuth';

export function UserAvatar() {
  const { user, logout } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 點擊外部 / 按 Esc 關閉選單
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!user) return null;

  return (
    <div
      ref={containerRef}
      className='user-avatar-container'
      style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 1000,
      }}
    >
      {/* 觸發按鈕：頭像 + 名字 + 箭頭，整顆可點 */}
      <button
        type='button'
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup='menu'
        aria-expanded={isOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: 'rgba(255, 255, 255, 0.95)',
          padding: '6px 14px 6px 6px',
          borderRadius: '50px',
          border: 'none',
          outline: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        <motion.img
          src={user.pictureUrl}
          alt={user.displayName}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            objectFit: 'cover',
            flexShrink: 0,
          }}
          whileHover={{ scale: 1.05 }}
        />
        <span
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#333',
            whiteSpace: 'nowrap',
          }}
        >
          {user.displayName}
        </span>
        <motion.svg
          width='16'
          height='16'
          viewBox='0 0 24 24'
          fill='none'
          stroke='#9b8fb5'
          strokeWidth='2.5'
          strokeLinecap='round'
          strokeLinejoin='round'
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ flexShrink: 0 }}
        >
          <polyline points='6 9 12 15 18 9' />
        </motion.svg>
      </button>

      {/* 下拉選單 */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            role='menu'
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              minWidth: '169px',
              background: '#ffffff',
              borderRadius: '16px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
              overflow: 'hidden',
              transformOrigin: 'top right',
            }}
          >
            {user.customerEmployeeId && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '12px 16px',
                  borderBottom: '1px solid #f0eef4',
                }}
              >
                <span style={{ fontSize: '13px', color: '#888' }}>員編</span>
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#6b5b95',
                  }}
                >
                  {user.customerEmployeeId}
                </span>
              </div>
            )}

            <button
              type='button'
              role='menuitem'
              onClick={() => {
                setIsOpen(false);
                logout();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                width: '100%',
                padding: '12px 16px',
                background: 'none',
                border: 'none',
                outline: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 600,
                color: '#e23b4e',
                textAlign: 'left',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = '#fdeef0')
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <svg
                width='18'
                height='18'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                strokeLinecap='round'
                strokeLinejoin='round'
              >
                <path d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' />
                <polyline points='16 17 21 12 16 7' />
                <line x1='21' y1='12' x2='9' y2='12' />
              </svg>
              登出
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
