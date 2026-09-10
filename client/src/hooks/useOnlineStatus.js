import { useState, useEffect, useCallback } from 'react';
import { hasInternet } from '../utils/atlasNetwork';

async function checkInternetConnectivity() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    await fetch('https://www.google.com/favicon.ico', {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    return true;
  } catch (err) {
    try {
      const controller2 = new AbortController();
      const timer2 = setTimeout(() => controller2.abort(), 2500);
      await fetch('https://1.1.1.1/favicon.ico', {
        method: 'HEAD',
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller2.signal,
      });
      clearTimeout(timer2);
      return true;
    } catch (err2) {
      return false;
    }
  }
}

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(() => hasInternet());

  const verify = useCallback(async () => {
    const online = await checkInternetConnectivity();
    setIsOnline(online);
  }, []);

  useEffect(() => {
    verify();

    const handleOnline = () => verify();
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleOnline);

    const interval = setInterval(verify, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleOnline);
      clearInterval(interval);
    };
  }, [verify]);

  return isOnline;
}
