import { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { QRCodeItem } from '../types';
import { api } from '../utils/api';
import { fmtDate, copyText } from '../utils/format';

interface Props {
  sessionToken: string;
  onGenerated: () => void;
}

type GachaSubTab = 'qr' | 'share-tokens' | 'topup';

interface UserInfo {
  id: string;
  lineId: string;
  displayName: string;
  shareTokens: number;
}

export function GachaTab({ sessionToken, onGenerated }: Props) {
  const [subTab, setSubTab] = useState<GachaSubTab>('topup');

  // QR Code state
  const [currentQR, setCurrentQR] = useState<QRCodeItem | null>(null);
  const [msg, setMsg] = useState('載入中…');
  const [isUsed, setIsUsed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrSize = 200;

  // Share tokens state
  const [lineId, setLineId] = useState('');
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [addAmount, setAddAmount] = useState(3);

  // Topup QR state
  const [topupPaymentMethod, setTopupPaymentMethod] = useState<'cash' | 'line'>('cash');
  const [topupAmount, setTopupAmount] = useState<number | ''>('');
  const [topupQR, setTopupQR] = useState<{
    code: string;
    url: string;
    amount: number;
    expiresAt: string;
  } | null>(null);
  const [topupGenerating, setTopupGenerating] = useState(false);
  const [topupMsg, setTopupMsg] = useState('');
  const topupQrSize = 200;

  // Generate one QR on mount
  useEffect(() => {
    generateNewQR();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Start polling when we have a current QR
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!currentQR || isUsed) return;

    pollRef.current = setInterval(async () => {
      const data = await api<{ success: boolean; qrCodes: QRCodeItem[] }>(
        '/api/admin/qrcode/list',
        sessionToken,
      );
      if (!data?.success) return;
      const found = data.qrCodes.find((q) => q.code === currentQR.code);
      if (found && (found.used ?? false)) {
        setIsUsed(true);
        const usedAt = fmtDate(found.usedAt ?? found.used_at);
        setMsg(`已於 ${usedAt} 使用，點上方按鈕生成新的`);
        onGenerated();
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 8000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [currentQR, isUsed]);

  // QR Code functions
  async function generateNewQR() {
    setGenerating(true);
    setMsg('生成中…');
    const data = await api<{ success: boolean; qrCode: QRCodeItem }>(
      '/api/admin/qrcode/generate',
      sessionToken,
      {
        method: 'POST',
        body: JSON.stringify({ cupCount: 1, expiresInDays: 30 }),
      },
    );
    setGenerating(false);

    if (!data?.success || !data.qrCode) {
      setMsg('生成失敗，請再試');
      return;
    }
    const qr = data.qrCode;
    setCurrentQR(qr);
    setIsUsed(false);
    setCopied(false);
    setMsg('掃描此 QR Code 即可抽卡');
    onGenerated();
  }

  async function handleCopy() {
    if (!currentQR) return;
    await copyText(currentQR.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Share tokens functions
  async function handleSearchUser() {
    if (!lineId.trim()) {
      setShareMsg('❌ 請輸入 LINE ID');
      return;
    }

    setLoading(true);
    setShareMsg('');

    const data = await api<{
      success: boolean;
      user?: UserInfo;
      message?: string;
    }>(
      `/api/admin/users/share-tokens?lineId=${encodeURIComponent(lineId)}`,
      sessionToken,
    );

    setLoading(false);

    if (!data?.success) {
      setShareMsg(`❌ ${data?.message || '查詢失敗'}`);
      setUserInfo(null);
      return;
    }

    setUserInfo(data.user || null);
    setShareMsg(`✅ 找到使用者：${data.user?.displayName}`);
  }

  async function handleAddTokens() {
    if (!userInfo || !lineId.trim()) {
      setShareMsg('❌ 請先查詢使用者');
      return;
    }

    if (addAmount <= 0) {
      setShareMsg('❌ 增加數量必須 > 0');
      return;
    }

    setLoading(true);

    const data = await api<{ success: boolean; message?: string }>(
      '/api/admin/users/add-share-tokens',
      sessionToken,
      {
        method: 'POST',
        body: JSON.stringify({ lineId, amount: addAmount }),
      },
    );

    setLoading(false);

    if (!data?.success) {
      setShareMsg(`❌ ${data?.message || '操作失敗'}`);
      return;
    }

    setShareMsg(`✅ ${data.message}`);
    // 重新查詢以更新顯示
    await handleSearchUser();
    setAddAmount(3);
  }

  async function handleGenerateTopupQR() {
    const amt = Number(topupAmount);
    if (!amt || amt <= 0 || !Number.isInteger(amt)) {
      setTopupMsg('❌ 請輸入有效金額（正整數）');
      return;
    }
    setTopupGenerating(true);
    setTopupMsg('');
    setTopupQR(null);

    const data = await api<{
      success: boolean;
      qrCode?: { code: string; url: string; amount: number; expiresAt: string };
      message?: string;
    }>('/api/admin/topup-qr/generate', sessionToken, {
      method: 'POST',
      body: JSON.stringify({ amount: amt, paymentMethod: topupPaymentMethod }),
    });
    setTopupGenerating(false);

    if (!data?.success || !data.qrCode) {
      setTopupMsg(`❌ ${data?.message || '生成失敗'}`);
      return;
    }
    setTopupQR(data.qrCode);
    setTopupMsg(`✅ 儲值 QR 已生成（$${data.qrCode.amount}），30 分鐘內有效`);
  }

  return (
    <div className='card'>
      {/* 內部 Tab 切換 */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '20px',
          borderBottom: '2px solid #eee',
          paddingBottom: '0',
        }}
      >
        {(
          [
            { key: 'topup', label: '💰 儲值' },
            { key: 'qr', label: '🎴 抽卡 QR' },
            { key: 'share-tokens', label: '🎫 分享次數' },
          ] as { key: GachaSubTab; label: string }[]
        ).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setSubTab(key)}
            style={{
              flex: 1,
              padding: '10px 8px',
              background: subTab === key ? '#667eea' : 'transparent',
              color: subTab === key ? 'white' : '#666',
              border: 'none',
              borderBottom: subTab === key ? '3px solid #667eea' : 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '13px',
              transition: 'all 0.2s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* QR Code 頁面 */}
      {subTab === 'qr' && (
        <div id='qrSection'>
          <div className='qr-wrapper'>
            {currentQR && <QRCodeCanvas value={currentQR.url} size={qrSize} />}
            <div className={`used-overlay${isUsed ? ' show' : ''}`}>
              <div className='icon'>🔒</div>
              <div className='lbl'>已使用</div>
            </div>
          </div>

          {currentQR && (
            <div className='current-qr-code'>
              <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                {currentQR.code}
              </span>
              <button
                className={`copy-btn${copied ? ' copied' : ''}`}
                onClick={handleCopy}
              >
                {copied ? '已複製！' : '複製代碼'}
              </button>
            </div>
          )}

          <div className='current-qr-msg'>{msg}</div>

          <button className='btn' onClick={generateNewQR} disabled={generating}>
            ＋ 生成新 QR Code
          </button>
        </div>
      )}

      {/* 分享次數管理頁面 */}
      {subTab === 'share-tokens' && (
        <div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <input
              type='text'
              placeholder='輸入使用者 LINE ID（例：U1234...）'
              value={lineId}
              onChange={(e) => setLineId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearchUser()}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid #ddd',
                fontSize: '14px',
              }}
            />
            <button
              onClick={handleSearchUser}
              disabled={loading}
              style={{
                padding: '10px 20px',
                background: '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              查詢
            </button>
          </div>

          {shareMsg && (
            <div
              style={{
                padding: '12px',
                marginBottom: '20px',
                backgroundColor: shareMsg.includes('❌') ? '#fee' : '#efe',
                borderRadius: '8px',
                fontSize: '14px',
                color: shareMsg.includes('❌') ? '#d32f2f' : '#2e7d32',
              }}
            >
              {shareMsg}
            </div>
          )}

          {userInfo && (
            <div
              style={{
                padding: '15px',
                background: '#f5f5f5',
                borderRadius: '8px',
                marginBottom: '20px',
                fontSize: '14px',
              }}
            >
              <div style={{ marginBottom: '10px' }}>
                <strong>使用者名稱：</strong> {userInfo.displayName}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>LINE ID：</strong> {userInfo.lineId}
              </div>
              <div style={{ marginBottom: '10px' }}>
                <strong>目前分享次數：</strong>{' '}
                <span
                  style={{
                    fontSize: '18px',
                    fontWeight: 'bold',
                    color: '#667eea',
                  }}
                >
                  {userInfo.shareTokens}
                </span>
              </div>

              <div
                style={{
                  marginTop: '20px',
                  paddingTop: '20px',
                  borderTop: '1px solid #ddd',
                }}
              >
                <label
                  style={{
                    display: 'block',
                    marginBottom: '10px',
                    fontWeight: 'bold',
                  }}
                >
                  增加分享次數：
                </label>
                <div
                  style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                >
                  <input
                    type='number'
                    min='1'
                    max='50'
                    value={addAmount}
                    onChange={(e) =>
                      setAddAmount(Math.max(1, parseInt(e.target.value) || 1))
                    }
                    style={{
                      width: '80px',
                      padding: '8px',
                      borderRadius: '8px',
                      border: '1px solid #ddd',
                      fontSize: '14px',
                    }}
                  />
                  <span>次</span>
                  <button
                    onClick={handleAddTokens}
                    disabled={loading}
                    style={{
                      marginLeft: 'auto',
                      padding: '8px 16px',
                      background: '#4caf50',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    ✓ 確認增加
                  </button>
                </div>
              </div>
            </div>
          )}

          {!userInfo && !shareMsg && (
            <div
              style={{
                padding: '20px',
                textAlign: 'center',
                color: '#999',
                background: '#f9f9f9',
                borderRadius: '8px',
              }}
            >
              輸入 LINE ID 並點擊「查詢」開始
            </div>
          )}
        </div>
      )}

      {/* 儲值 QR Code 頁面 */}
      {subTab === 'topup' && (
        <div>
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '16px' }}>
            輸入儲值金額，生成一次性 QR Code（30 分鐘有效）。
            <br />
            顧客掃描後自動入帳到錢包。
          </p>

          {/* 付款方式 */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <button
              onClick={() => setTopupPaymentMethod('cash')}
              style={{
                flex: 1,
                padding: '10px',
                background: topupPaymentMethod === 'cash' ? '#4caf50' : '#f0f0f0',
                color: topupPaymentMethod === 'cash' ? 'white' : '#555',
                border: '2px solid',
                borderColor: topupPaymentMethod === 'cash' ? '#4caf50' : '#ddd',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
              }}
            >
              💵 現金
            </button>
            <button
              onClick={() => setTopupPaymentMethod('line')}
              style={{
                flex: 1,
                padding: '10px',
                background: topupPaymentMethod === 'line' ? '#00b900' : '#f0f0f0',
                color: topupPaymentMethod === 'line' ? 'white' : '#555',
                border: '2px solid',
                borderColor: topupPaymentMethod === 'line' ? '#00b900' : '#ddd',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
              }}
            >
              💚 LINE Pay
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#666',
                  fontWeight: 'bold',
                }}
              >
                $
              </span>
              <input
                type='number'
                min='1'
                placeholder='輸入金額（元）'
                value={topupAmount}
                onChange={(e) => {
                  const v = e.target.value;
                  setTopupAmount(v === '' ? '' : Math.max(1, parseInt(v) || 1));
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleGenerateTopupQR()}
                style={{
                  width: '100%',
                  padding: '12px 12px 12px 28px',
                  borderRadius: '8px',
                  border: '1px solid #ddd',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <button
              onClick={handleGenerateTopupQR}
              disabled={topupGenerating || !topupAmount}
              style={{
                padding: '12px 20px',
                background: topupAmount ? '#4caf50' : '#ccc',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: topupAmount ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
                fontSize: '14px',
                whiteSpace: 'nowrap',
              }}
            >
              {topupGenerating ? '生成中…' : '生成 QR'}
            </button>
          </div>

          {topupMsg && (
            <div
              style={{
                padding: '10px 14px',
                marginBottom: '16px',
                background: topupMsg.includes('❌') ? '#fee' : '#efe',
                borderRadius: '8px',
                fontSize: '13px',
                color: topupMsg.includes('❌') ? '#d32f2f' : '#2e7d32',
              }}
            >
              {topupMsg}
            </div>
          )}

          {topupQR && (
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  display: 'inline-block',
                  padding: '16px',
                  background: 'white',
                  borderRadius: '12px',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
                  marginBottom: '12px',
                }}
              >
                <QRCodeCanvas value={topupQR.url} size={topupQrSize} />
              </div>
              <div
                style={{
                  fontSize: '24px',
                  fontWeight: 'bold',
                  color: '#4caf50',
                  marginBottom: '4px',
                }}
              >
                儲值 ${topupQR.amount} 元
              </div>
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '4px' }}>
                付款方式：{topupPaymentMethod === 'line' ? '💚 LINE Pay' : '💵 現金'}
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#999',
                  marginBottom: '16px',
                }}
              >
                代碼：{topupQR.code}
              </div>
              <button
                onClick={() => {
                  setTopupQR(null);
                  setTopupMsg('');
                  setTopupAmount('');
                  setTopupPaymentMethod('cash');
                }}
                style={{
                  padding: '10px 24px',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                }}
              >
                ＋ 生成新的儲值 QR
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
