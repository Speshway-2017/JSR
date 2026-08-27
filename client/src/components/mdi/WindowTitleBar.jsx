import React from 'react';
import * as Icons from 'lucide-react';
import { Minus, Square, Copy, X } from 'lucide-react';

export default function WindowTitleBar({
  title,
  iconName,
  isActive,
  isMaximized,
  onMinimize,
  onToggleMaximize,
  onClose,
  onMouseDown,
}) {
  const IconComponent = Icons[iconName] || Icons.Package;

  return (
    <div
      className={`h-9 px-3 flex items-center justify-between select-none cursor-move rounded-t-xl transition-colors duration-150 ${
        isActive
          ? 'bg-primary-700 text-white shadow-sm'
          : 'bg-primary-100 text-primary-700 hover:bg-primary-150'
      }`}
      onMouseDown={onMouseDown}
      onDoubleClick={onToggleMaximize}
    >
      <div className="flex items-center gap-2 min-w-0 pr-2 pointer-events-none">
        <IconComponent className={`w-4 h-4 shrink-0 ${isActive ? 'text-primary-200' : 'text-primary-600'}`} />
        <span className="text-xs font-bold tracking-wide truncate">{title}</span>
      </div>

      <div
        className="flex items-center gap-1 shrink-0 pointer-events-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onMinimize}
          className={`p-1 rounded-md transition-colors ${
            isActive
              ? 'hover:bg-primary-600 text-primary-200 hover:text-white'
              : 'hover:bg-primary-200 text-primary-600'
          }`}
          title="Minimize"
          aria-label="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={onToggleMaximize}
          className={`p-1 rounded-md transition-colors ${
            isActive
              ? 'hover:bg-primary-600 text-primary-200 hover:text-white'
              : 'hover:bg-primary-200 text-primary-600'
          }`}
          title={isMaximized ? 'Restore' : 'Maximize'}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? <Copy className="w-3 h-3 rotate-180" /> : <Square className="w-3 h-3" />}
        </button>

        <button
          type="button"
          onClick={onClose}
          className={`p-1 rounded-md transition-colors ${
            isActive
              ? 'hover:bg-red-600 text-primary-200 hover:text-white'
              : 'hover:bg-red-500 hover:text-white text-primary-600'
          }`}
          title="Close"
          aria-label="Close"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
