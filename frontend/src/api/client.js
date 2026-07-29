import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({ baseURL: API_BASE_URL });

function readAuth() {
  const raw = localStorage.getItem('auth-storage');
  if (!raw) return {};
  try {
    return JSON.parse(raw).state || {};
  } catch {
    return {};
  }
}

// Attach the access token to every request.
api.interceptors.request.use((config) => {
  const { accessToken } = readAuth();
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// On a 401, try a one-shot refresh, then replay the original request. If the
// refresh fails, clear auth so the app falls back to the login screen.
let refreshing = null;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const { refreshToken } = readAuth();
    if (error.response?.status === 401 && refreshToken && !original._retried) {
      original._retried = true;
      try {
        refreshing =
          refreshing ||
          axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
        const { data } = await refreshing;
        refreshing = null;

        const raw = JSON.parse(localStorage.getItem('auth-storage'));
        raw.state.accessToken = data.accessToken;
        raw.state.token = data.accessToken;
        raw.state.refreshToken = data.refreshToken;
        localStorage.setItem('auth-storage', JSON.stringify(raw));

        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (e) {
        refreshing = null;
        localStorage.removeItem('auth-storage');
        if (typeof window !== 'undefined') window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
