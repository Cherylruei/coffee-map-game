import { useState, useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { QRCodeItem } from '../types';
import { api } from '../utils/api';
import { fmtDate, copyText } from '../utils/format';

interface Props {
  sessionToken: string;
  onGenerated: () => void;
}

export function GachaTab({ sessionToken, onGenerated }: Props) {
  const [currentQR, setCurrentQR] = useState<QRCodeItem | null>(null);
  const [msg, setMsg] = useState('載入中…');
  const [isUsed, setIsUsed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const qrSize = Math.min(220, Math.floor(window.innerWidth * 0.62));

  // Generate one QR on mount
  useEffect(() => {
    generateNewQR();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Start polling when we have a current QR
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!currentQR || isUsed) return;

    pollRef.current = setInterval(async () => {
      const data = await api<{ success: boolean; qrCodes: QRCodeItem[] }>(
        '/api/admin/qrcode/list', sessionToken
      );
      if (!data?.success) return;
      const found = data.qrCodes.find(q => q.code === currentQR.code);
      if (found && (found.used ?? false)) {
        setIsUsed(true);
        const usedAt = fmtDate(found.usedAt ?? found.used_at);
        setMsg(`已於 ${usedAt} 使用，點上方按鈕生成新的`);
        onGenerated();
        if (pollRef.current) clearInterval(pollRef.current);
      }
    }, 8000);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [currentQR, isUsed]);

  async function generateNewQR() {
    setGenerating(true);
    setMsg('生成中…');
    const data = await api<{ success: boolean; qrCodes: QRCodeItem[] }>(
      '/api/admin/qrcode/generate',
      sessionToken,
      { method: 'POST', body: JSON.stringify({ quantity: 1, expiresInDays: 30 }) }
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

  return (
    <div className="card">
      <h2>🎴 目前抽卡 QR Code</h2>
      <div id="qrSection">
        <div className="qr-wrapper">
          {currentQR && (
            <QRCodeCanvas value={currentQR.url} size={qrSize} />
          )}
          <div className={`used-overlay${isUsed ? ' show' : ''}`}>
            <div className="icon">🔒</div>
            <div className="lbl">已使用</div>
          </div>
        </div>

        {currentQR && (
          <div className="current-qr-code">
            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{currentQR.code}</span>
            <button className={`copy-btn${copied ? ' copied' : ''}`} onClick={handleCopy}>
              {copied ? '已複製！' : '複製代碼'}
            </button>
          </div>
        )}

        <div className="current-qr-msg">{msg}</div>

        <button className="btn" onClick={generateNewQR} disabled={generating}>
          ＋ 生成新 QR Code
        </button>
      </div>
    </div>
  );
}
