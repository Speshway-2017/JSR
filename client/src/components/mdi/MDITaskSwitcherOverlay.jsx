import React, { useEffect, useRef } from 'react';
import * as Icons from 'lucide-react';
import { Layers, CheckCircle2, Eye, LayoutGrid } from 'lucide-react';
import { useMDI, isPathAllowedForRole } from '../../context/MDIContext';
import { useAuth } from '../../context/AuthContext';

export default function MDITaskSwitcherOverlay() {
  const {
    windows,
    switcherOpen,
    switcherIndex,
    setSwitcherIndex,
    closeSwitcher,
    selectSwitcherWindow,
  } = useMDI();
  const { role } = useAuth();
  const containerRef = useRef(null);

  const visibleWindows = windows.filter((win) => isPathAllowedForRole(win.path, role));

  useEffect(() => {
    if (switcherOpen && containerRef.current) {
      const activeCard = containerRef.current.querySelector(`[data-switcher-idx="${switcherIndex}"]`);
      if (activeCard) {
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [switcherOpen, switcherIndex]);

  if (!switcherOpen || visibleWindows.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-transparent transition-all animate-in fade-in duration-150 select-none"
      onClick={closeSwitcher}
    >
      {/* Floating Solid Dark Glass Panel Container */}
      <div
        className="w-full max-w-4xl bg-slate-900/95 border border-slate-700/80 rounded-3xl p-6 sm:p-7 text-white shadow-2xl space-y-5 flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-slate-800 text-emerald-400 border border-slate-700 shadow-inner">
              <LayoutGrid className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                Task Switcher
              </h2>
              <p className="text-xs text-slate-300">
                Hold <kbd className="font-mono bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[11px] font-bold text-emerald-400">Ctrl</kbd> & press <kbd className="font-mono bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded text-[11px] font-bold text-emerald-400">Tab</kbd> to cycle • Release to switch
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            {visibleWindows.length} {visibleWindows.length === 1 ? 'window open' : 'windows open'}
          </span>
        </div>

        {/* Windows Cards Carousel */}
        <div
          ref={containerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden flex items-center gap-4 py-3 px-1 min-h-[200px] [scrollbar-width:thin] [scrollbar-color:#334155_transparent]"
        >
          {visibleWindows.map((win, idx) => {
            const IconComponent = Icons[win.iconName] || Icons.Package;
            const isSelected = idx === switcherIndex;
            const basePath = win.path.split('?')[0];

            return (
              <div
                key={win.id}
                data-switcher-idx={idx}
                onClick={() => selectSwitcherWindow(idx)}
                onMouseEnter={() => setSwitcherIndex(idx)}
                className={`relative w-64 h-44 rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all duration-150 shrink-0 border ${
                  isSelected
                    ? 'bg-slate-800 border-2 border-emerald-400 shadow-2xl scale-105 ring-4 ring-emerald-500/30 z-20'
                    : 'bg-slate-800/90 border-slate-700/80 hover:bg-slate-800 opacity-80 hover:opacity-100 shadow-md z-10'
                }`}
              >
                {/* Top: Icon & Title */}
                <div className="flex items-start gap-2.5">
                  <div
                    className={`p-2 rounded-xl border shrink-0 transition ${
                      isSelected
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold shadow-md'
                        : 'bg-slate-700/80 text-slate-200 border-slate-600'
                    }`}
                  >
                    <IconComponent className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm text-white truncate leading-snug">{win.title}</p>
                    <p className="text-[11px] text-slate-400 font-mono truncate">{basePath}</p>
                  </div>
                </div>

                {/* Center Preview Box */}
                <div className="flex-1 my-2 rounded-xl bg-slate-950/70 border border-slate-800 p-2 flex flex-col justify-center items-center text-center gap-1.5 overflow-hidden">
                  <div className="flex items-center gap-1.5 text-xs text-slate-300">
                    <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="truncate max-w-[170px]">{win.title}</span>
                  </div>
                  {win.isMinimized ? (
                    <span className="text-[10px] uppercase font-bold text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                      Minimized
                    </span>
                  ) : win.isMaximized ? (
                    <span className="text-[10px] uppercase font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      Full Screen
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase font-semibold text-slate-300 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
                      Normal Size
                    </span>
                  )}
                </div>

                {/* Bottom Active Indicator */}
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-700/60">
                  <span className="font-mono font-semibold text-slate-400">#{idx + 1}</span>
                  {isSelected && (
                    <span className="flex items-center gap-1 font-bold text-emerald-400 text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Selected
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Guidance */}
        <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
          <span>Click any card to switch directly</span>
          <span className="font-mono text-slate-300">Release Ctrl key to confirm selection</span>
        </div>
      </div>
    </div>
  );
}
