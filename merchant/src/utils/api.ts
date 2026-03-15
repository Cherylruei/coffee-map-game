const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE = import.meta.env.VITE_API_BASE ||
  (isLocal
    ? 'http://localhost:3001'
    : window.location.hostname.match(/^\d+\.\d+\.\d+\.\d+$/)
      ? `${window.location.protocol}//${window.location.hostname}:3001`
      : 'https://coffee-map-game-backend.vercel.app');

export { API_BASE };

export async function api<T = unknown>(
  path: string,
  sessionToken: string,
  options: RequestInit = {}
): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-session': sessionToken,
        ...(options.headers as Record<string, string> || {}),
      },
    });
    if (res.status === 401 || res.status === 403) {
      return { __expired: true } as T;
    }
    return res.json();
  } catch {
    return null;
  }
}
