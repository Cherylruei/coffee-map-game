import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// 建立 axios 實例
export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// 請求攔截器 - 自動加入 JWT token
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// 回應攔截器 - 錯誤處理
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            // Token 過期或無效
            localStorage.removeItem('auth_token');
            localStorage.removeItem('user');
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

// API 方法
export const authAPI = {
    lineCallback: (code: string, redirectUri: string) =>
        api.post('/auth/line/callback', { code, redirectUri }),
};

export const userAPI = {
    getCollection: () => api.get('/user/collection'),
};

export const gachaAPI = {
    pull: (qrCode: string) => api.post('/gacha/pull', { qrCode }),
};

export const shareAPI = {
    create: (cardId: number) => api.post('/share/create', { cardId }),
    claim: (shareCode: string) => api.post('/share/claim', { shareCode }),
};
