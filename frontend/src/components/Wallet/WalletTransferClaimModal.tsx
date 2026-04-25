import { useEffect, useState } from 'react';
import { walletAPI } from '../../utils/api';
import './WalletPaymentModal.css'; // reuse same base styles

interface WalletTransferClaimModalProps {
  token: string;
  onClose: () => void;
  onClaimed: (amount: number) => void;
}

type Status = 'loading' | 'ready' | 'claiming' | 'error';

export function WalletTransferClaimModal({
  token,
  onClose,
  onClaimed,
}: WalletTransferClaimModalProps) {
  const [status, setStatus] = useState<Status>('loading');
  const [amount, setAmount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    walletAPI
      .getTransferStatus(token)
      .then((res) => {
        const data = res.data;
        if (data.success && data.status === 'pending') {
          setAmount(data.amount);
          setStatus('ready');
        } else {
          const msgMap: Record<string, string> = {
            claimed:   '此轉帳已被領取',
            cancelled: '此轉帳已被取消',
            expired:   '轉帳連結已過期',
          };
          setErrorMsg(msgMap[data.status] || data.message || '無效的轉帳連結');
          setStatus('error');
        }
      })
      .catch(() => {
        setErrorMsg('無效的轉帳連結');
        setStatus('error');
      });
  }, [token]);

  const handleClaim = async () => {
    setStatus('claiming');
    try {
      const res = await walletAPI.claimTransfer(token);
      const data = res.data;
      if (data.success) {
        onClaimed(data.amount);
      } else {
        setErrorMsg(data.message || '領取失敗');
        setStatus('error');
      }
    } catch (e: any) {
      setErrorMsg(e.response?.data?.message || '領取失敗，請稍後再試');
      setStatus('error');
    }
  };

  return (
    <div className='wallet-modal-overlay'>
      <div className='wallet-modal-box'>
        <div className='wallet-modal-icon'>
          {status === 'loading' || status === 'claiming' ? '⏳' : status === 'error' ? '❌' : '💸'}
        </div>

        {status === 'loading' && (
          <>
            <h2 className='wallet-modal-title'>查詢轉帳中…</h2>
          </>
        )}

        {status === 'ready' && (
          <>
            <h2 className='wallet-modal-title'>收到儲值金轉帳</h2>
            <p className='wallet-modal-subtitle'>確認後即可入帳</p>
            <div className='wallet-modal-detail'>
              <div className='wallet-modal-row'>
                <span className='wallet-modal-row-label'>轉帳金額</span>
                <span
                  className='wallet-modal-row-value wallet-modal-row-value--bold'
                  style={{ color: '#2e7d32' }}
                >
                  ${amount}
                </span>
              </div>
            </div>
            <div className='wallet-modal-actions'>
              <button
                className='wallet-modal-btn wallet-modal-btn--cancel'
                onClick={onClose}
              >
                稍後再說
              </button>
              <button
                className='wallet-modal-btn wallet-modal-btn--confirm'
                onClick={handleClaim}
              >
                立即領取
              </button>
            </div>
          </>
        )}

        {status === 'claiming' && (
          <h2 className='wallet-modal-title'>領取中…</h2>
        )}

        {status === 'error' && (
          <>
            <h2 className='wallet-modal-title'>無法領取</h2>
            <p className='wallet-modal-subtitle'>{errorMsg}</p>
            <div className='wallet-modal-actions'>
              <button
                className='wallet-modal-btn wallet-modal-btn--confirm'
                onClick={onClose}
              >
                關閉
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
