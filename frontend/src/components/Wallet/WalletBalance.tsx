import { useWalletStore } from '../../hooks/useWallet';

export function WalletBalance() {
  const { balance, loaded } = useWalletStore();

  if (!loaded) return null;

  return (
    <div className='wallet-balance-chip'>
      <span className='wallet-balance-label'>☕ 咖啡儲值金</span>
      <span className='wallet-balance-amount'>${balance}</span>
    </div>
  );
}
