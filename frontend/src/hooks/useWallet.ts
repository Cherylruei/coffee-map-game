import { create } from 'zustand';
import { walletAPI } from '../utils/api';

interface WalletState {
    balance: number;
    loaded: boolean;
    fetchBalance: () => Promise<void>;
    setBalance: (balance: number) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
    balance: 0,
    loaded: false,

    fetchBalance: async () => {
        try {
            const res = await walletAPI.getBalance();
            if (res.data?.success) {
                set({ balance: res.data.balance ?? 0, loaded: true });
            }
        } catch {
            // 未登入或無錢包時靜默忽略
        }
    },

    setBalance: (balance: number) => {
        set({ balance, loaded: true });
    },
}));
