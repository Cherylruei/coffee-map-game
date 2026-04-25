import { useWalletStore } from '../../hooks/useWallet';

interface WalletBalanceProps {
  onTransferClick?: () => void;
}

export function WalletBalance({ onTransferClick }: WalletBalanceProps) {
  const { balance, loaded } = useWalletStore();

  if (!loaded) return null;

  return (
    <div className='wallet-balance-chip'>
      <span className='wallet-balance-label'>☕ 咖啡儲值金</span>
      <span className='wallet-balance-amount'>${balance}</span>
      {onTransferClick && (
        <button className='wallet-transfer-btn' onClick={onTransferClick} title='轉帳給朋友'>
          💸
        </button>
      )}
    </div>
  );
}
