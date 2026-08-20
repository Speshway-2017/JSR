import { useEffect, useState } from 'react';
import api from '../api';

export default function LicenseGate({ children }) {
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const apply = (data) => {
      if (cancelled || !data) return;
      if (data.locked) {
        setLocked(true);
        setMessage(
          data.message ||
            'License expired. Contact Support team from Speshway to reactivate the license.'
        );
      }
    };

    const check = () => {
      api
        .get('/license/status', { timeout: 20000 })
        .then((res) => apply(res.data))
        .catch((err) => apply(err.response?.data))
        .finally(() => {
          if (!cancelled) setReady(true);
        });
    };

    check();
    const onExpired = (e) => {
      apply({
        locked: true,
        message: e.detail || '',
      });
    };
    window.addEventListener('jsr-license-expired', onExpired);
    return () => {
      cancelled = true;
      window.removeEventListener('jsr-license-expired', onExpired);
    };
  }, []);

  if (!ready && !locked) return children;

  if (!locked) return children;

  return (
    <div className="fixed inset-0 z-[2147483646] bg-cream flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-red-200 bg-surface shadow-card px-8 py-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-500 mb-3">JSR</p>
        <h1 className="text-xl font-bold text-primary-800 mb-4">License expired</h1>
        <p className="text-base text-primary-700 leading-relaxed whitespace-pre-wrap">{message}</p>
      </div>
    </div>
  );
}
