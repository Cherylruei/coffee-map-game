interface LoadingOverlayProps {
  message?: string;
}

// 全螢幕半透明 loading 遮罩：任何網路請求進行中都可即時顯示，
// 讓使用者知道「有在處理」，避免以為畫面沒反應。
export function LoadingOverlay({ message = '處理中…' }: LoadingOverlayProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 20000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: 'rgba(0, 0, 0, 0.45)',
        backdropFilter: 'blur(2px)',
      }}
      role='status'
      aria-live='polite'
    >
      <div
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          border: '4px solid rgba(255, 255, 255, 0.3)',
          borderTopColor: '#fff',
          animation: 'loading-overlay-spin 0.8s linear infinite',
        }}
      />
      <p
        style={{
          margin: 0,
          color: '#fff',
          fontSize: '16px',
          fontWeight: 'bold',
          textShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}
      >
        {message}
      </p>
      <style>{`
        @keyframes loading-overlay-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
