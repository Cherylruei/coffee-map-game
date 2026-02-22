import { create } from 'zustand';

interface CollectionState {
    collection: Record<number, number>;
    shareTokens: number;
    setCollection: (collection: Record<number, number>) => void;
    setShareTokens: (tokens: number) => void;
    addCard: (cardId: number) => void;
}

export const useCollectionStore = create<CollectionState>((set) => ({
    collection: {},
    shareTokens: 3,

    setCollection: (collection) => set({ collection }),

    setShareTokens: (tokens) => set({ shareTokens: tokens }),

    addCard: (cardId) => set((state) => ({
        collection: {
            ...state.collection,
            [cardId]: (state.collection[cardId] || 0) + 1
        }
    })),
}));
