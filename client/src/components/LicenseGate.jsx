import { useEffect, useState } from 'react';
import api from '../api';

export default function LicenseGate({ children }) {
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState('');
  const [ready, setReady] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const apply = (data) => {
    if (!data) return;
    if (data.locked) {
      setLocked(true);
      setMessage(
        data.message ||
          'Please connect to the internet to verify your license.'
      );
    } else {
      setLocked(false);
      setMessage('');
    }
  };

  const checkStatus = async (force = false) => {
    setVerifying(true);
    try {
      const endpoint = force ? '/license/status?force=true' : '/license/status';
      const res = await api.get(endpoint, { timeout: 20000 });
      apply(res.data);
    } catch (err) {
      apply(err.response?.data);
    } finally {
      setReady(true);
      setVerifying(false);
    }
  };

  useEffect(() => {
    checkStatus();

    const onExpired = (e) => {
      apply({
        locked: true,
        message: e.detail || '',
      });
    };
    window.addEventListener('jsr-license-expired', onExpired);
    return () => {
      window.removeEventListener('jsr-license-expired', onExpired);
    };
  }, []);

  if (!ready && !locked) return children;

  if (!locked) return children;

  return (
    <div className="fixed inset-0 z-[2147483646] bg-cream flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-red-200 bg-surface shadow-card px-8 py-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-500 mb-3">JSR</p>
        <h1 className="text-xl font-bold text-primary-800 mb-4">License Verification</h1>
        <p className="text-base text-primary-700 leading-relaxed whitespace-pre-wrap mb-6">{message}</p>
        <button
          type="button"
          disabled={verifying}
          onClick={() => checkStatus(true)}
          className="btn-primary w-full py-2.5"
        >
          {verifying ? 'Verifying License...' : 'Retry / Verify License'}
        </button>
      </div>
    </div>
  );
}
