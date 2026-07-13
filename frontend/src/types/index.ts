// TypeScript 型別定義

// GA4 全域型別
declare global {
  interface Window {
    dataLayer: unknown[]
  }
}

export interface User {
    id: string;
    lineUserId: string;
    displayName: string;
    pictureUrl: string;
    shareTokens: number;
    createdAt: string;
    // 會員自行登記的員工編號（強制必填，登記後每 30 天可修改一次）
    customerEmployeeId?: string | null;
    // 下次可修改員編的時間（ISO 字串）；null 表示現在就能修改
    customerEmployeeIdEditableAt?: string | null;
}

export interface Collection {
    id: string;
    userId: string;
    cardId: number;
    count: number;
    obtainedAt: string;
}

export interface GachaResult {
    success: boolean;
    card: {
        id: number;
    };
    isNew: boolean;
    collection: Record<number, number>;
}

export interface ShareData {
    success: boolean;
    shareCode: string;
    shareUrl: string;
    remainingTokens: number;
}

export interface QRCode {
    id: string;
    code: string;
    used: boolean;
    usedBy?: string;
    usedAt?: string;
    expiresAt: string;
    createdAt: string;
}

export interface WalletTransaction {
    id: string;
    amount: number;
    type: 'topup' | 'deduct';
    note: string;
    orderRef: string;
    createdAt: string;
}

export interface WalletInfo {
    balance: number;
    transactions: WalletTransaction[];
}

export interface QRCodeInfo {
    type: 'topup' | 'gacha';
    amount?: number;       // topup 時有值
    cupCount?: number;     // gacha 時有值
    walletAmount?: number; // gacha + 錢包付款時有值
}
