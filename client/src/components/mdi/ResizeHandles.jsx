import React from 'react';

const HANDLES = [
  { direction: 'n', cursor: 'cursor-n-resize', className: 'top-0 left-2 right-2 h-1.5' },
  { direction: 's', cursor: 'cursor-s-resize', className: 'bottom-0 left-2 right-2 h-1.5' },
  { direction: 'w', cursor: 'cursor-w-resize', className: 'left-0 top-2 bottom-2 w-1.5' },
  { direction: 'e', cursor: 'cursor-e-resize', className: 'right-0 top-2 bottom-2 w-1.5' },
  { direction: 'nw', cursor: 'cursor-nw-resize', className: 'top-0 left-0 w-3 h-3' },
  { direction: 'ne', cursor: 'cursor-ne-resize', className: 'top-0 right-0 w-3 h-3' },
  { direction: 'sw', cursor: 'cursor-sw-resize', className: 'bottom-0 left-0 w-3 h-3' },
  { direction: 'se', cursor: 'cursor-se-resize', className: 'bottom-0 right-0 w-3 h-3' },
];

export default function ResizeHandles({ onResizeStart }) {
  return (
    <>
      {HANDLES.map(({ direction, cursor, className }) => (
        <div
          key={direction}
          className={`absolute z-30 select-none ${cursor} ${className}`}
          onMouseDown={(e) => {
            e.stopPropagation();
            onResizeStart(e, direction);
          }}
        />
      ))}
    </>
  );
}
