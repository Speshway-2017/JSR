import { useEffect, useState } from 'react';
import api from '../api';

/**
 * Live English/phonetic → Telugu preview while typing a name.
 */
export function useTeluguPreview(name, { delayMs = 350 } = {}) {
  const [telugu, setTelugu] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = String(name || '').trim();
    if (!trimmed) {
      setTelugu('');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get('/transliterate/telugu', { params: { text: trimmed } });
        if (!cancelled) setTelugu(res.data?.telugu || '');
      } catch {
        if (!cancelled) setTelugu('');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, delayMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, delayMs]);

  return { telugu, loading };
}
