import React, { useRef } from 'react';
import * as Icons from 'lucide-react';
import { ChevronLeft, ChevronRight, LayoutGrid } from 'lucide-react';
import { useMDI, isPathAllowedForRole } from '../../context/MDIContext';
import { useAuth } from '../../context/AuthContext';

export default function MDIWindowTaskbar() {
  const { windows, activeWindowId, restoreWindow, minimizeWindow, focusWindow, arrangeWindows } = useMDI();
  const { role } = useAuth();
  const scrollRef = useRef(null);

  const visibleWindows = windows.filter((win) => isPathAllowedForRole(win.path, role));

  if (visibleWindows.length === 0) return null;

  const scroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = direction === 'left' ? -200 : 200;
      scrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleWheel = (e) => {
    if (scrollRef.current && e.deltaY !== 0) {
      scrollRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="h-10 shrink-0 bg-surface border-t border-primary-200 px-2 flex items-center gap-1 select-none z-30 shadow-card">
      <div className="flex items-center gap-1.5 shrink-0 border-r border-primary-100 pr-2 mr-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-primary-500 hidden sm:inline">
          Open ({visibleWindows.length})
        </span>
        {visibleWindows.length > 1 && (
          <button
            type="button"
            onClick={arrangeWindows}
            className="h-6 px-2 rounded-md flex items-center gap-1 text-[11px] font-semibold bg-primary-100 text-primary-800 hover:bg-primary-200 transition border border-primary-300"
            title="Arrange open windows side-by-side"
          >
            <LayoutGrid className="w-3 h-3 text-primary-700" />
            <span className="hidden md:inline">Arrange Tabs</span>
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => scroll('left')}
        className="p-1 rounded-md hover:bg-primary-100 text-primary-600 shrink-0 transition"
        title="Scroll left"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div
        ref={scrollRef}
        onWheel={handleWheel}
        className="flex-1 flex items-center gap-1.5 overflow-x-auto scroll-smooth py-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {visibleWindows.map((win) => {
          const IconComponent = Icons[win.iconName] || Icons.Package;
          const isActive = win.id === activeWindowId && !win.isMinimized;

          return (
            <button
              key={win.id}
              type="button"
              onClick={(e) => {
                e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                if (win.isMinimized) {
                  restoreWindow(win.id);
                } else if (isActive) {
                  minimizeWindow(win.id);
                } else {
                  focusWindow(win.id);
                }
              }}
              className={`h-7 px-3 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-all shrink-0 border whitespace-nowrap ${
                isActive
                  ? 'bg-primary-700 text-white border-primary-700 shadow-sm'
                  : win.isMinimized
                  ? 'bg-primary-50/80 text-primary-500 border-primary-200 hover:bg-primary-100 hover:text-primary-700 opacity-75'
                  : 'bg-surface text-primary-700 border-primary-200 hover:bg-primary-50'
              }`}
              title={win.title}
            >
              <IconComponent className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-primary-200' : 'text-primary-500'}`} />
              <span className="max-w-[140px] truncate">{win.title}</span>
              {win.isMinimized && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent-500 shrink-0 ml-0.5" title="Minimized" />
              )}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => scroll('right')}
        className="p-1 rounded-md hover:bg-primary-100 text-primary-600 shrink-0 transition"
        title="Scroll right"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
