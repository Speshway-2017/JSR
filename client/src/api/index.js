import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config;

    // Retry transparently on 503 (Service Unavailable) or transient network errors during server restarts
    const isRetryable =
      config &&
      (err.response?.status === 503 ||
        !err.response ||
        err.code === 'ECONNABORTED' ||
        err.code === 'ERR_NETWORK');

    if (isRetryable) {
      config._retryCount = (config._retryCount || 0) + 1;
      if (config._retryCount <= 3) {
        const delay = config._retryCount * 800;
        await new Promise((resolve) => setTimeout(resolve, delay));
        return api(config);
      }
    }

    const raw = err.response?.data?.message || err.message || '';
    if (/ECONNREFUSED|MongoServerSelection|buffering timed out|topology was destroyed|reconnecting/i.test(raw)) {
      if (!err.response) err.response = { data: {} };
      if (!err.response.data) err.response.data = {};
      err.response.data.message =
        'Database connection lost. Close JSR fully, wait a few seconds, then open it again.';
    }
    if (err.response?.data?.code === 'LICENSE_EXPIRED') {
      window.dispatchEvent(
        new CustomEvent('jsr-license-expired', {
          detail: err.response.data.message,
        })
      );
    }
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;
