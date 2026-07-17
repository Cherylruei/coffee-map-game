import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useAuthStore } from '../../hooks/useAuth';

const LINE_CLIENT_ID = import.meta.env.VITE_LINE_CLIENT_ID || '';

export function LoginButton() {
  const { isAuthenticated } = useAuthStore();

  // 以真正的 <a> 連結導向 LINE 授權頁，而非用 JS（window.location）導頁。
  // iOS 的 Universal Links 在 JavaScript 導頁時常常不會喚起 LINE App，導致退回
  // email/密碼登入頁並跳出圖形驗證碼；只有使用者點擊 <a> 才能可靠喚起 LINE App
  // 完成自動登入。參考 LINE 官方「how-to-handle-auto-login-failure」文件。
  const loginUrl = useMemo(() => {
    const state = Math.random().toString(36).substring(7);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: LINE_CLIENT_ID,
      redirect_uri: window.location.origin,
      state,
      scope: 'profile openid',
    });
    return `https://access.line.me/oauth2/v2.1/authorize?${params.toString()}`;
  }, []);

  if (isAuthenticated) return null;

  return (
    <motion.a
      href={loginUrl}
      className='line-login-button'
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      style={{
        background: '#06C755',
        width: '265px',
        height: '50px',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        padding: '12px 32px',
        fontSize: '16px',
        fontWeight: 'bold',
        cursor: 'pointer',
        textDecoration: 'none',
        boxSizing: 'border-box',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '10px',
        margin: '0 0 15px',
      }}
    >
      <svg width='20' height='20' viewBox='0 0 24 24' fill='white'>
        <path d='M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314' />
      </svg>
      使用 LINE 登入
    </motion.a>
  );
}
