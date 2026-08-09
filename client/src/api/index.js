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
  (err) => {
    const raw = err.response?.data?.message || err.message || '';
    if (/ECONNREFUSED|MongoServerSelection|buffering timed out|topology was destroyed/i.test(raw)) {
      if (!err.response) err.response = { data: {} };
      if (!err.response.data) err.response.data = {};
      err.response.data.message =
        'Database connection lost. Close JSR fully, wait a few seconds, then open it again.';
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
