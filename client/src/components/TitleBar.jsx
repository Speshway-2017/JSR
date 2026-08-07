import { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

export function useIsElectron() {
  return !!isElectron;
}

export default function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [platform, setPlatform] = useState('');

  useEffect(() => {
    if (!isElectron) return undefined;

    window.electronAPI.getInfo?.().then((info) => {
      if (info?.platform) setPlatform(info.platform);
    });
    window.electronAPI.isMaximized?.().then(setMaximized);
    return window.electronAPI.onMaximizedChange?.((value) => {
      setMaximized(value);
    });
  }, []);

  if (!isElectron) return null;

  const isMac = platform === 'darwin';

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-[100] h-10 flex items-center select-none border-b border-primary-100 bg-surface/95 backdrop-blur-sm ${
        isMac ? 'pl-[78px]' : 'pl-3'
      }`}
      style={{ WebkitAppRegion: 'drag' }}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-sm font-semibold text-primary-700 truncate">AgriTrades</span>
        <span className="text-[10px] uppercase tracking-wide text-primary-400 hidden sm:inline">Desktop</span>
      </div>

      {/* Native traffic lights on macOS; custom controls elsewhere */}
      {!isMac && platform && (
        <div className="flex items-stretch h-full" style={{ WebkitAppRegion: 'no-drag' }}>
          <button
            type="button"
            aria-label="Minimize"
            title="Minimize"
            onClick={() => window.electronAPI.minimize()}
            className="w-12 h-full flex items-center justify-center text-primary-500 hover:bg-primary-50 transition"
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
            className="w-12 h-full flex items-center justify-center text-primary-500 hover:bg-primary-50 transition"
          >
            {maximized ? <Copy className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            aria-label="Close"
            title="Close"
            onClick={() => window.electronAPI.close()}
            className="w-12 h-full flex items-center justify-center text-primary-500 hover:bg-red-500 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </header>
  );
}
