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
    await copyText(code);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  }

  const paymentLabel = pendingOrder?.paymentMethod === 'line_pay' ? 'LINE Pay' : '現金';

  return (
    <div className="qr-viewer">
      <div className="qr-viewer-bar">
        <button className="btn outline" style={{ padding: '7px 14px', fontSize: '0.85rem', flexShrink: 0 }} onClick={onCancel}>
          取消
        </button>
        <div className="qr-viewer-title">
          QR Code — 共 {qrCodes.length} 張
        </div>
        <button className="btn" style={{ padding: '7px 14px', fontSize: '0.85rem', flexShrink: 0 }} onClick={onCommit}>
          完成收款
        </button>
      </div>

      {/* 訂單摘要 */}
      {pendingOrder && (
        <div className="order-summary">
          <div className="summary-rows">
            {pendingOrder.items.map((item, i) => (
              <div key={i} className="summary-row">
                <span>{item.name} × {item.qty}</span>
                <span>${item.price * item.qty}</span>
              </div>
            ))}
            {pendingOrder.discount > 0 && (
              <div className="summary-row discount">
                <span>折扣券</span>
                <span>－${pendingOrder.discount}</span>
              </div>
            )}
          </div>
          <div className="summary-total">
            <span>合計</span>
            <span>${pendingOrder.totalAmount}</span>
          </div>
          <div className="summary-meta">
            <span>{paymentLabel}</span>
            {pendingOrder.employeeId && <span>員編：{pendingOrder.employeeId}</span>}
          </div>
        </div>
      )}

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
