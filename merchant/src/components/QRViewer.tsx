import { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { QRCodeItem, PendingOrder } from '../types';
import { copyText } from '../utils/format';

interface Props {
  qrCodes: QRCodeItem[];
  drinkList: string[];
  pendingOrder: PendingOrder | null;
  onCommit: () => void;
  onCancel: () => void;
}

export function QRViewer({ qrCodes, drinkList, pendingOrder, onCommit, onCancel }: Props) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const qrSize = Math.min(200, Math.floor(window.innerWidth * 0.6));

  async function handleCopy(url: string, idx: number, code: string) {
    await copyText(code); // 只複製代碼，不含網址
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  return (
    <div className="qr-viewer">
      <div className="qr-viewer-bar">
        <button className="btn outline" style={{ padding: '7px 14px', fontSize: '0.85rem', flexShrink: 0 }} onClick={onCancel}>
          取消
        </button>
        <div className="qr-viewer-title">
          QR Code — 共 {qrCodes.length} 張
          {pendingOrder && ` · $${pendingOrder.totalAmount}`}
        </div>
        <button className="btn" style={{ padding: '7px 14px', fontSize: '0.85rem', flexShrink: 0 }} onClick={onCommit}>
          完成
        </button>
      </div>

      <div className="qr-viewer-body">
        {qrCodes.map((qr, idx) => (
          <div key={qr.code} className="viewer-qr-card">
            <div className="drink-label">{drinkList[idx] || '抽卡'}</div>
            <div className="qr-img-wrap">
              <QRCodeCanvas value={qr.url} size={qrSize} />
            </div>
            <div className="qr-code-txt">{qr.code}</div>
            <button
              className={`viewer-copy-btn${copiedIdx === idx ? ' copied' : ''}`}
              onClick={() => handleCopy(qr.url, idx, qr.code)}
            >
              {copiedIdx === idx ? '已複製！' : '複製代碼'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
