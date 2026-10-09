import React, { memo } from 'react';

const HANDLES = [
  { direction: 'n', cursor: 'cursor-n-resize', className: 'top-0 left-3 right-3 h-2' },
  { direction: 's', cursor: 'cursor-s-resize', className: 'bottom-0 left-3 right-3 h-2' },
  { direction: 'w', cursor: 'cursor-w-resize', className: 'left-0 top-3 bottom-3 w-2' },
  { direction: 'e', cursor: 'cursor-e-resize', className: 'right-0 top-3 bottom-3 w-2' },
  { direction: 'nw', cursor: 'cursor-nw-resize', className: 'top-0 left-0 w-4 h-4' },
  { direction: 'ne', cursor: 'cursor-ne-resize', className: 'top-0 right-0 w-4 h-4' },
  { direction: 'sw', cursor: 'cursor-sw-resize', className: 'bottom-0 left-0 w-4 h-4' },
  { direction: 'se', cursor: 'cursor-se-resize', className: 'bottom-0 right-0 w-4 h-4' },
];

function ResizeHandles({ onResizeStart }) {
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

export default memo(ResizeHandles);
