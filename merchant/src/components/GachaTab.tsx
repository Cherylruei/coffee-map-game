import { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { QRCodeItem } from '../types';
import { api } from '../utils/api';
import { fmtDate, copyText } from '../utils/format';

interface Props {
  sessionToken: string;
  onGenerated: () => void;
}

type GachaSubTab = 'qr' | 'share-tokens';

interface UserInfo {
  id: string;
  lineId: string;
  displayName: string;
  shareTokens: number;
}

export function GachaTab({ sessionToken, onGenerated }: Props) {
  const [subTab, setSubTab] = useState<GachaSubTab>('qr');

  // QR Code state
  const [currentQR, setCurrentQR] = useState<QRCodeItem | null>(null);
  const [msg, setMsg] = useState('載入中…');
  const [isUsed, setIsUsed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrSize = Math.min(220, Math.floor(window.innerWidth * 0.62));

  // Share tokens state
  const [lineId, setLineId] = useState('');
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [addAmount, setAddAmount] = useState(3);

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
    const data = await api<{ success: boolean; qrCodes: QRCodeItem[] }>(
      '/api/admin/qrcode/generate',
      sessionToken,
      {
        method: 'POST',
        body: JSON.stringify({ quantity: 1, expiresInDays: 30 }),
      },
    );
    setGenerating(false);

    if (!data?.success || !data.qrCodes?.[0]) {
      setMsg('生成失敗，請再試');
      return;
    }
    const qr = data.qrCodes[0];
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

  return (
    <div className='card'>
      {/* 內部 Tab 切換 */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          borderBottom: '2px solid #eee',
          paddingBottom: '0',
        }}
      >
        <button
          onClick={() => setSubTab('qr')}
          style={{
            flex: 1,
            padding: '12px 16px',
            background: subTab === 'qr' ? '#667eea' : 'transparent',
            color: subTab === 'qr' ? 'white' : '#666',
            border: 'none',
            borderBottom: subTab === 'qr' ? '3px solid #667eea' : 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
            transition: 'all 0.2s',
          }}
        >
          🎴 抽卡 QR Code
        </button>
        <button
          onClick={() => setSubTab('share-tokens')}
          style={{
            flex: 1,
            padding: '12px 16px',
            background: subTab === 'share-tokens' ? '#667eea' : 'transparent',
            color: subTab === 'share-tokens' ? 'white' : '#666',
            border: 'none',
            borderBottom:
              subTab === 'share-tokens' ? '3px solid #667eea' : 'none',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '14px',
            transition: 'all 0.2s',
          }}
        >
          🎫 分享次數
        </button>
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
    </div>
  );
}
