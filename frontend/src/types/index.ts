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
