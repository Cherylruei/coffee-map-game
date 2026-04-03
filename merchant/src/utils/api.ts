const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (isLocal
    ? 'http://localhost:3001'
    : window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/)
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : 'https://coffee-map-game-backend.vercel.app');

export { API_BASE };

export async function api<T = unknown>(
  path: string,
  sessionToken: string,
  options: RequestInit = {},
): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-session': sessionToken,
        ...((options.headers as Record<string, string>) || {}),
      },
    });

    const data = await res.json();

    console.log(`[API] ${options.method || 'GET'} ${path}`, {
      status: res.status,
      response: data,
    });

    if (res.status === 401 || res.status === 403) {
      console.error('[API] 認證失敗或權限不足');
      return { __expired: true } as T;
    }

    if (!res.ok && !data.success) {
      console.error('[API] 請求失敗:', data.message || data);
    }

    return data;
  } catch (error) {
    console.error('[API] 網路錯誤:', error);
    return null;
  }
}
