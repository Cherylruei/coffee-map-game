import './WalletPaymentModal.css';

interface WalletPaymentModalProps {
  amount: number;
  currentBalance: number;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function WalletPaymentModal({
  amount,
  currentBalance,
  onConfirm,
  onCancel,
  loading = false,
}: WalletPaymentModalProps) {
  const afterBalance = currentBalance - amount;
  const isInsufficient = currentBalance < amount;

  return (
    <div className='wallet-modal-overlay'>
      <div className='wallet-modal-box'>
        <div className='wallet-modal-icon'>☕</div>
        <h2 className='wallet-modal-title'>確認使用儲值金付款</h2>
        <p className='wallet-modal-subtitle'>請確認以下付款明細</p>

        <div className='wallet-modal-detail'>
          <Row label='即將扣款' value={`$${amount}`} valueColor='#e53935' bold />
          <Row label='目前餘額' value={`$${currentBalance}`} />
          <hr className='wallet-modal-detail-divider' />
          <Row
            label='扣款後餘額'
            value={isInsufficient ? '餘額不足' : `$${afterBalance}`}
            valueColor={isInsufficient ? '#e53935' : '#2e7d32'}
            bold
          />
        </div>

        {isInsufficient && (
          <div className='wallet-modal-insufficient'>
            ⚠️ 餘額不足，請先至門市儲值
          </div>
        )}

        <div className='wallet-modal-actions'>
          <button
            className='wallet-modal-btn wallet-modal-btn--cancel'
            onClick={onCancel}
            disabled={loading}
          >
            取消
          </button>
          <button
            className='wallet-modal-btn wallet-modal-btn--confirm'
            onClick={onConfirm}
            disabled={loading || isInsufficient}
          >
            {loading ? '處理中…' : '確認付款'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  valueColor = '#333',
  bold = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <div className='wallet-modal-row'>
      <span className='wallet-modal-row-label'>{label}</span>
      <span
        className={`wallet-modal-row-value${bold ? ' wallet-modal-row-value--bold' : ''}`}
        style={{ color: valueColor }}
      >
        {value}
      </span>
    </div>
  );
}
