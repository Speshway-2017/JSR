import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

export function useIsElectron() {
  return !!isElectron;
}

/** macOS traffic-light inset for frameless / hiddenInset windows */
export const MAC_TRAFFIC_PAD = '4.75rem';

function guessPlatform() {
  if (typeof navigator === 'undefined') return '';
  if (/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent)) return 'darwin';
  if (/Win/i.test(navigator.platform || navigator.userAgent)) return 'win32';
  return '';
}

export function useElectronPlatform() {
  const [platform, setPlatform] = useState(() => (isElectron ? guessPlatform() : ''));

  useEffect(() => {
    if (!isElectron) return undefined;
    window.electronAPI.getInfo?.().then((info) => {
      if (info?.platform) setPlatform(info.platform);
    });
    return undefined;
  }, []);

  return platform;
}

export const dragRegion = { WebkitAppRegion: 'drag' };
export const noDragRegion = { WebkitAppRegion: 'no-drag' };

/** Windows/Linux window buttons — place inside the app header (no separate title strip). */
export function WindowControls({ className = '' }) {
  const [maximized, setMaximized] = useState(false);
  const platform = useElectronPlatform();

  useEffect(() => {
    if (!isElectron) return undefined;
    window.electronAPI.isMaximized?.().then(setMaximized);
    return window.electronAPI.onMaximizedChange?.((value) => {
      setMaximized(value);
    });
  }, []);

  if (!isElectron || !platform || platform === 'darwin') return null;

  return (
    <div
      className={`flex items-stretch h-full shrink-0 ${className}`}
      style={noDragRegion}
    >
      <button
        type="button"
        aria-label="Minimize"
        title="Minimize"
        onClick={() => window.electronAPI.minimize()}
        className="w-11 h-full flex items-center justify-center text-primary-500 hover:bg-primary-50 transition"
      >
        <Minus className="w-4 h-4" />
      </button>
      <button
        type="button"
        aria-label={maximized ? 'Restore' : 'Maximize'}
        title={maximized ? 'Restore' : 'Maximize'}
        onClick={async () => {
          const next = await window.electronAPI.maximize();
          setMaximized(!!next);
        }}
        className="w-11 h-full flex items-center justify-center text-primary-500 hover:bg-primary-50 transition"
      >
        {maximized ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        aria-label="Close"
        title="Close"
        onClick={() => window.electronAPI.close()}
        className="w-11 h-full flex items-center justify-center text-primary-500 hover:bg-red-500 hover:text-white transition"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

/**
 * Login / loading screens only — provides a drag strip without a second app header.
 * Authenticated Layout owns drag + controls itself.
 */
export default function TitleBar({ standalone = false }) {
  const platform = useElectronPlatform();

  if (!isElectron || !standalone) return null;

  const isMac = platform === 'darwin';

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[100] h-10 flex items-center select-none ${
        isMac ? 'pl-[78px]' : 'pl-3'
      }`}
      style={dragRegion}
      aria-label="Window"
    >
      <div className="flex-1 min-w-0 h-full" />
      <WindowControls />
    </div>
  );
}
