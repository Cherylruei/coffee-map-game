import { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { QRCodeItem, PendingOrder } from '../types';
import { copyText } from '../utils/format';

interface Props {
  qrCode: QRCodeItem;
  cupCount: number;
  pendingOrder: PendingOrder | null;
  onCommit: () => void;
  onCancel: () => void;
}

export function QRViewer({ qrCode, cupCount, pendingOrder, onCommit, onCancel }: Props) {
  const [copied, setCopied] = useState(false);
  const qrSize = Math.min(240, Math.floor(window.innerWidth * 0.65));

  async function handleCopy() {
    await copyText(qrCode.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const paymentLabel = pendingOrder?.paymentMethod === 'line_pay' ? 'LINE Pay' : '現金';

  return (
    <div className="qr-viewer">
      {/* 頂部標題列 */}
      <div className="qr-viewer-bar">
        <div className="qr-viewer-title">
          QR Code — 共 {cupCount} 杯抽卡機會
        </div>
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
        <div className="viewer-qr-card">
          <div className="drink-label">🎫 掃描後可獲得 {cupCount} 次抽卡機會</div>
          <div className="qr-img-wrap">
            <QRCodeCanvas value={qrCode.url} size={qrSize} />
          </div>
          <div className="qr-code-txt">{qrCode.code}</div>
          <button
            className={`viewer-copy-btn${copied ? ' copied' : ''}`}
            onClick={handleCopy}
          >
            {copied ? '已複製！' : '複製代碼'}
          </button>
        </div>
      </div>

      {/* 底部操作列 - 固定在底部 */}
      <div className="qr-viewer-bottom">
        <button className="btn outline" style={{ flex: 1, padding: '11px 14px', fontSize: '0.9rem' }} onClick={onCancel}>
          取消
        </button>
        <button className="btn" style={{ flex: 1, padding: '11px 14px', fontSize: '0.9rem' }} onClick={onCommit}>
          ✅ 完成收款
        </button>
      </div>
    </div>
  );
}
