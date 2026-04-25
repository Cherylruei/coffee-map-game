import { useState } from 'react';
import { walletAPI } from '../../utils/api';
import { useDialog } from '../../hooks/useDialog';
import './WalletTransferModal.css';

interface WalletTransferModalProps {
  currentBalance: number;
  onClose: () => void;
  onBalanceChange: (newBalance: number) => void;
}

type Step = 'input' | 'created' | 'loading';

export function WalletTransferModal({
  currentBalance,
  onClose,
  onBalanceChange,
}: WalletTransferModalProps) {
  const [step, setStep] = useState<Step>('input');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [transferUrl, setTransferUrl] = useState('');
  const [transferToken, setTransferToken] = useState('');
  const [transferAmount, setTransferAmount] = useState(0);
  const [expiresAt, setExpiresAt] = useState('');
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const showDialog = useDialog();

  const parsedAmount = parseInt(amount, 10);
  const isAmountValid =
    !isNaN(parsedAmount) && parsedAmount >= 10 && parsedAmount <= 5000;
  const isInsufficient = isAmountValid && parsedAmount > currentBalance;

  const handleCreate = async () => {
    if (!isAmountValid || isInsufficient) return;
    setError('');
    setStep('loading');

    try {
      const res = await walletAPI.createTransfer(parsedAmount);
      const data = res.data;
      if (data.success) {
        setTransferUrl(data.transferUrl);
        setTransferToken(data.token);
        setTransferAmount(data.amount);
        setExpiresAt(data.expiresAt);
        onBalanceChange(data.newBalance);
        setStep('created');
      } else {
        setError(data.message || '建立失敗');
        setStep('input');
      }
    } catch (e: any) {
      setError(e.response?.data?.message || '建立失敗，請稍後再試');
      setStep('input');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(transferUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older browsers
      const input = document.createElement('input');
      input.value = transferUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLineShare = () => {
    const text = encodeURIComponent(
      `我傳送了 $${transferAmount} 儲值金給你，點連結領取（48小時內有效）：${transferUrl}`
    );
    window.open(`https://line.me/R/msg/text/?${text}`, '_blank');
  };

  const handleCancel = () => {
    if (!transferToken || cancelling) return;
    showDialog({
      type: 'confirm',
      title: '確定取消此轉帳？',
      message: '金額將退回您的錢包。',
      buttons: [
        { label: '返回', variant: 'secondary' },
        {
          label: '確定取消',
          variant: 'danger',
          onClick: async () => {
            setCancelling(true);
            try {
              const res = await walletAPI.cancelTransfer(transferToken);
              const data = res.data;
              if (data.success) {
                showDialog({ type: 'success', title: data.message });
                onClose();
              } else {
                showDialog({ type: 'error', title: data.message || '取消失敗' });
              }
            } catch (e: any) {
              showDialog({ type: 'error', title: e.response?.data?.message || '取消失敗，請稍後再試' });
            } finally {
              setCancelling(false);
            }
          },
        },
      ],
    });
  };

  const expireLabel = expiresAt
    ? new Date(expiresAt).toLocaleString('zh-TW', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  return (
    <div className='wtransfer-overlay' onClick={onClose}>
      <div className='wtransfer-box' onClick={(e) => e.stopPropagation()}>
        <div className='wtransfer-icon'>💸</div>
        <h2 className='wtransfer-title'>轉帳儲值金</h2>

        {step === 'input' && (
          <>
            <p className='wtransfer-subtitle'>
              輸入金額，對方用 LINE 登入即可領取
            </p>
            <div className='wtransfer-balance-row'>
              <span className='wtransfer-balance-label'>目前餘額</span>
              <span className='wtransfer-balance-value'>${currentBalance}</span>
            </div>

            <div className='wtransfer-input-wrap'>
              <span className='wtransfer-currency'>$</span>
              <input
                className='wtransfer-input'
                type='number'
                min={10}
                max={Math.min(5000, currentBalance)}
                placeholder='10 ~ 5000'
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setError('');
                }}
                autoFocus
              />
            </div>

            {isInsufficient && (
              <p className='wtransfer-error'>⚠️ 超過目前餘額</p>
            )}
            {!isInsufficient && error && (
              <p className='wtransfer-error'>{error}</p>
            )}

            <div className='wtransfer-actions'>
              <button className='wtransfer-btn wtransfer-btn--cancel' onClick={onClose}>
                取消
              </button>
              <button
                className='wtransfer-btn wtransfer-btn--confirm'
                onClick={handleCreate}
                disabled={!isAmountValid || isInsufficient}
              >
                產生轉帳連結
              </button>
            </div>
          </>
        )}

        {step === 'loading' && (
          <div className='wtransfer-loading'>⏳ 建立中...</div>
        )}

        {step === 'created' && (
          <>
            <p className='wtransfer-success-msg'>
              已從您的餘額扣除{' '}
              <strong>${transferAmount}</strong>，分享連結給對方領取吧！
            </p>

            <div className='wtransfer-url-box'>
              <span className='wtransfer-url-text'>{transferUrl}</span>
            </div>

            <p className='wtransfer-expire'>🕐 有效期限：{expireLabel} 前</p>

            <div className='wtransfer-share-btns'>
              <button className='wtransfer-btn wtransfer-btn--copy' onClick={handleCopy}>
                {copied ? '✅ 已複製！' : '📋 複製連結'}
              </button>
              <button className='wtransfer-btn wtransfer-btn--line' onClick={handleLineShare}>
                💬 LINE 分享
              </button>
            </div>

            <div className='wtransfer-actions wtransfer-actions--bottom'>
              <button
                className='wtransfer-btn wtransfer-btn--cancel-transfer'
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? '取消中...' : '❌ 取消此轉帳'}
              </button>
              <button className='wtransfer-btn wtransfer-btn--close' onClick={onClose}>
                完成
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
