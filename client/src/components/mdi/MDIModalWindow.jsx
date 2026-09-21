import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as Icons from 'lucide-react';
import { X } from 'lucide-react';

export default function MDIModalWindow({ open, title, iconName, onClose, children, maxWidth = 'max-w-md' }) {
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ width: 0, height: 0 });
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const draggingRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  useEffect(() => {
    if (!open) return;
    setDragOffset({ x: 0, y: 0 });
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open || !containerRef.current) return;
    const el = containerRef.current;
    const updateDims = () => {
      const rect = el.getBoundingClientRect();
      setDims({ width: rect.width, height: rect.height });
    };
    updateDims();

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDims({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [open]);

  if (!open) return null;

  const IconComponent = iconName && Icons[iconName] ? Icons[iconName] : null;

  const winW = dims.width || (typeof window !== 'undefined' ? window.innerWidth : 800);
  const winH = dims.height || (typeof window !== 'undefined' ? window.innerHeight : 600);

  // Parse maximum width threshold from prop
  let maxCap = 460;
  if (maxWidth.includes('sm')) maxCap = 360;
  else if (maxWidth.includes('lg')) maxCap = 540;
  else if (maxWidth.includes('xl')) maxCap = 640;
  else if (maxWidth.includes('2xl')) maxCap = 740;

  // Dynamically calculate popup width proportional to main window
  let modalWidth;
  if (winW < 480) {
    modalWidth = Math.max(260, Math.round(winW - 20));
  } else if (winW < 640) {
    modalWidth = Math.min(maxCap, Math.round(winW * 0.90));
  } else if (winW < 900) {
    modalWidth = Math.min(maxCap, Math.round(winW * 0.82));
  } else {
    modalWidth = Math.min(maxCap, Math.round(winW * 0.72));
  }

  // Dynamically calculate popup max-height strictly within main window
  let maxModalHeight;
  if (winH < 440) {
    maxModalHeight = Math.max(180, Math.round(winH - 16));
  } else if (winH < 600) {
    maxModalHeight = Math.max(220, Math.round(winH * 0.90));
  } else {
    maxModalHeight = Math.min(Math.round(winH * 0.88), winH - 28);
  }

  const isCompact = winH < 520 || winW < 560;

  const handleHeaderMouseDown = (e) => {
    if (e.button !== 0 || e.target.closest('button')) return;
    draggingRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: dragOffset.x,
      origY: dragOffset.y,
    };

    const handleMouseMove = (me) => {
      if (!draggingRef.current.dragging) return;
      const dx = me.clientX - draggingRef.current.startX;
      const dy = me.clientY - draggingRef.current.startY;

      const maxOffsetX = Math.max(10, (winW - modalWidth) / 2 - 8);
      const maxOffsetY = Math.max(10, (winH - 180) / 2 - 8);

      const newX = Math.max(-maxOffsetX, Math.min(maxOffsetX, draggingRef.current.origX + dx));
      const newY = Math.max(-maxOffsetY, Math.min(maxOffsetY, draggingRef.current.origY + dy));
      setDragOffset({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      draggingRef.current.dragging = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-50 flex items-center justify-center p-2 sm:p-3 bg-black/45 backdrop-blur-[1.5px] rounded-xl overflow-hidden select-none"
      onClick={(e) => {
        // Prevent click-through to underlying parent page
        e.stopPropagation();
      }}
    >
      <div
        className={`card flex flex-col shadow-2xl border-2 border-primary-800 bg-surface z-50 animate-in fade-in zoom-in-95 duration-150 select-text overflow-hidden ${
          isCompact ? '!p-3 sm:!p-3.5 space-y-2' : '!p-4 sm:!p-5 space-y-3'
        }`}
        style={{
          width: `${modalWidth}px`,
          maxHeight: `${maxModalHeight}px`,
          maxWidth: '96%',
          transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
          transition: draggingRef.current.dragging ? 'none' : 'width 0.15s ease, max-height 0.15s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div
            className={`flex items-center justify-between border-b border-primary-100 shrink-0 cursor-move select-none ${
              isCompact ? 'pb-1.5 mb-1' : 'pb-2'
            }`}
            onMouseDown={handleHeaderMouseDown}
            onDoubleClick={() => setDragOffset({ x: 0, y: 0 })}
            title="Drag to reposition popup, double-click to center"
          >
            <div className="flex items-center gap-2 min-w-0 pr-2">
              {IconComponent && (
                <IconComponent className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'} text-primary-600 shrink-0`} />
              )}
              <h2 className={`${isCompact ? 'text-sm sm:text-base' : 'text-base sm:text-lg'} font-bold text-primary-800 truncate`}>
                {title}
              </h2>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-primary-50 text-primary-500 hover:text-primary-700 transition-colors shrink-0"
                aria-label="Close modal"
              >
                <X className={`${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
              </button>
            )}
          </div>
        )}
        <div className={`flex-1 min-h-0 overflow-y-auto pr-1 ${isCompact ? 'space-y-2 text-xs' : 'space-y-3 text-sm'} custom-scrollbar`}>
          {children}
        </div>
      </div>
    </div>
  );
}

