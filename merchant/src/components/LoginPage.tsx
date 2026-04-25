import { useState, useEffect, useRef } from 'react';
import { StaffInfo } from '../types';
import { API_BASE } from '../utils/api';

const LINE_CHANNEL_ID = '2009107113';

interface Props {
  onLogin: (token: string, staff: StaffInfo | null) => void;
}

type Step = 'line' | 'password';

export function LoginPage({ onLogin }: Props) {
  const [step, setStep] = useState<Step>('line');
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [lineError, setLineError] = useState('');
  const [loginError, setLoginError] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const lineHandled = useRef(false);

  // Detect LINE callback on mount
  useEffect(() => {
    if (lineHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (code && state === 'merchant') {
      lineHandled.current = true;
      history.replaceState({}, '', window.location.pathname);
      setStep('password');
      exchangeLineCode(code);
    }
  }, []);

  async function exchangeLineCode(code: string) {
    const redirectUri = window.location.origin + window.location.pathname;
    try {
      const res = await fetch(`${API_BASE}/api/admin/line-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, redirectUri }),
      });
      const data = await res.json();
      if (data.success) {
        setStaffInfo(data.staff);
        setStep('password');
        setTimeout(() => passwordRef.current?.focus(), 100);
      } else {
        setLineError(data.message || 'LINE 登入失敗');
        setStep('line');
      }
    } catch {
      setLineError('連線失敗，請重試');
      setStep('line');
    }
  }

  function lineLogin() {
    const redirectUri = encodeURIComponent(
      window.location.origin + window.location.pathname,
    );
    window.location.href =
      `https://access.line.me/oauth2/v2.1/authorize?` +
      `response_type=code&client_id=${LINE_CHANNEL_ID}` +
      `&redirect_uri=${redirectUri}&state=merchant&scope=profile`;
  }

  function skipLine() {
    setStaffInfo(null);
    setStep('password');
    setTimeout(() => passwordRef.current?.focus(), 100);
  }

  async function login() {
    if (!password) return;
    setLoading(true);
    setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success) {
        onLogin(data.sessionToken, staffInfo);
      } else {
        setLoginError(data.message || '密碼錯誤');
        setPassword('');
        setTimeout(() => passwordRef.current?.focus(), 50);
      }
    } catch {
      setLoginError('連線失敗，請確認 API 是否正常');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className='login-overlay'>
      <div className='login-box'>
        <h2>☕ 商家後台</h2>

        {/* Step 1: LINE */}
        {step === 'line' && (
          <>
            <p>請先用 LINE 登入，以記錄當班員工</p>
            <button className='line-btn' onClick={lineLogin}>
              <svg viewBox='0 0 24 24' fill='white'>
                <path d='M12 2C6.477 2 2 6.124 2 11.204c0 4.561 3.618 8.373 8.5 9.083v-6.425H8.266v-2.658H10.5V9.47c0-2.2 1.31-3.416 3.316-3.416.95 0 1.944.17 1.944.17v2.14h-1.095c-1.08 0-1.415.67-1.415 1.357v1.63h2.406l-.385 2.657H13.25V20.3C18.159 19.614 22 15.8 22 11.204 22 6.124 17.523 2 12 2' />
              </svg>
              用 LINE 登入
            </button>
            {/* <div className="skip-line">
              <a onClick={skipLine}>略過，直接輸入密碼</a>
            </div> */}
            {lineError && (
              <div
                style={{
                  color: 'var(--danger)',
                  fontSize: '0.82rem',
                  marginTop: 10,
                }}
              >
                {lineError}
              </div>
            )}
          </>
        )}

        {/* Step 2: Password */}
        {step === 'password' && (
          <>
            {staffInfo && (
              <div className='staff-greeting'>
                {staffInfo.picture && <img src={staffInfo.picture} alt='' />}
                <div>
                  <div className='name'>{staffInfo.name}</div>
                  <div className='sub'>已驗證 LINE 身份，請輸入密碼</div>
                </div>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                login();
              }}
            >
              <input
                ref={passwordRef}
                className='login-input'
                type='password'
                placeholder='工作人員密碼'
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete='current-password'
              />
              <button className='btn full' type='submit' disabled={loading}>
                {loading ? '驗證中…' : '進入後台'}
              </button>
            </form>
            <div className='login-error'>{loginError}</div>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <a
                style={{
                  color: 'var(--muted)',
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
                onClick={() => setStep('line')}
              >
                ← 重新 LINE 登入
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
