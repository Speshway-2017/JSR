import React, { useEffect } from 'react';
import * as Icons from 'lucide-react';
import { X } from 'lucide-react';

export default function MDIModalWindow({ open, title, iconName, onClose, children, maxWidth = 'max-w-md' }) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const IconComponent = iconName && Icons[iconName] ? Icons[iconName] : null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/45 backdrop-blur-[1.5px] rounded-xl overflow-hidden select-none"
      onClick={(e) => {
        // Prevent click-through to underlying parent page
        e.stopPropagation();
      }}
    >
      <div
        className={`card w-full ${maxWidth} max-h-full flex flex-col space-y-3 shadow-2xl border border-primary-200 bg-surface z-50 my-auto animate-in fade-in zoom-in-95 duration-150 select-text overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between pb-2 border-b border-primary-100 shrink-0">
            <div className="flex items-center gap-2 min-w-0 pr-2">
              {IconComponent && <IconComponent className="w-5 h-5 text-primary-600 shrink-0" />}
              <h2 className="text-base sm:text-lg font-bold text-primary-800 truncate">{title}</h2>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-primary-50 text-primary-500 transition-colors shrink-0"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">{children}</div>
      </div>
    </div>
  );
}
