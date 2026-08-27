import { useEffect } from 'react';

/**
 * Custom React hook that Listens for the `jsr:data-restored` global event
 * (fired when database restore from MongoDB Atlas completes) and executes
 * the provided callback to refresh on-screen state in real-time.
 */
export function useDataRestored(onRestore) {
  useEffect(() => {
    if (typeof onRestore !== 'function') return;

    const handleRestore = () => {
      try {
        onRestore();
      } catch (err) {
        console.error('[useDataRestored] Error refreshing page data after restore:', err);
      }
    };

    window.addEventListener('jsr:data-restored', handleRestore);
    return () => {
      window.removeEventListener('jsr:data-restored', handleRestore);
    };
  }, [onRestore]);
}
