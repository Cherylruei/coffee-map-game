import { create } from 'zustand';
import type { User } from '../types';

interface AuthState {
    user: User | null;
    token: string | null;
    isAuthenticated: boolean;
    setAuth: (user: User, token: string) => void;
    updateUser: (partial: Partial<User>) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    token: localStorage.getItem('auth_token'),
    isAuthenticated: !!localStorage.getItem('auth_token'),

    setAuth: (user, token) => {
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('auth_token', token);
        set({ user, token, isAuthenticated: true });
    },

    updateUser: (partial) =>
        set((state) => {
            if (!state.user) return state;
            const user = { ...state.user, ...partial };
            localStorage.setItem('user', JSON.stringify(user));
            return { user };
        }),

    logout: () => {
        localStorage.removeItem('user');
        localStorage.removeItem('auth_token');
        set({ user: null, token: null, isAuthenticated: false });
    },
}));
