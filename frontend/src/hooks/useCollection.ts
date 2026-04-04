import { create } from 'zustand';

interface CollectionState {
    collection: Record<number, number>;
    pendingShares: Record<number, number>; // 待接收的分享數量
    shareTokens: number;
    setCollection: (collection: Record<number, number>) => void;
    setPendingShares: (pendingShares: Record<number, number>) => void;
    setShareTokens: (tokens: number) => void;
    addCard: (cardId: number) => void;
}

export const useCollectionStore = create<CollectionState>((set) => ({
    collection: {},
    pendingShares: {},
    shareTokens: 3,

    setCollection: (collection) => set({ collection }),

    setPendingShares: (pendingShares) => set({ pendingShares }),

    setShareTokens: (tokens) => set({ shareTokens: tokens }),

    addCard: (cardId) => set((state) => ({
        collection: {
            ...state.collection,
            [cardId]: (state.collection[cardId] || 0) + 1
        }
    })),
}));
