import React, { useRef } from 'react';
import WindowTitleBar from './WindowTitleBar';
import ResizeHandles from './ResizeHandles';
import { useMDI } from '../../context/MDIContext';

export default function MDIWindow({ windowItem, children }) {
  const {
    id,
    title,
    iconName,
    isMinimized,
    isMaximized,
    isActive,
    zIndex,
    position,
    size,
  } = windowItem;

  const {
    focusWindow,
    closeWindow,
    minimizeWindow,
    toggleMaximize,
    updatePosition,
    updateSize,
  } = useMDI();

  const windowRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, posX: 0, posY: 0 });
  const resizeRef = useRef({ resizing: false, dir: '', startX: 0, startY: 0, posX: 0, posY: 0, width: 0, height: 0 });

  if (isMinimized) return null;

  const handleDragStart = (e) => {
    if (isMaximized || e.button !== 0) return;
    focusWindow(id);
    dragRef.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };

    const handleMouseMove = (me) => {
      if (!dragRef.current.dragging) return;
      const dx = me.clientX - dragRef.current.startX;
      const dy = me.clientY - dragRef.current.startY;
      updatePosition(id, {
        x: Math.max(0, dragRef.current.posX + dx),
        y: Math.max(0, dragRef.current.posY + dy),
      });
    };

    const handleMouseUp = () => {
      dragRef.current.dragging = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeStart = (e, dir) => {
    if (isMaximized || e.button !== 0) return;
    focusWindow(id);
    resizeRef.current = {
      resizing: true,
      dir,
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
      width: size.width,
      height: size.height,
    };

    const handleMouseMove = (me) => {
      if (!resizeRef.current.resizing) return;
      const dx = me.clientX - resizeRef.current.startX;
      const dy = me.clientY - resizeRef.current.startY;
      const r = resizeRef.current;

      let newWidth = r.width;
      let newHeight = r.height;
      let newX = r.posX;
      let newY = r.posY;

      if (dir.includes('e')) newWidth = Math.max(550, r.width + dx);
      if (dir.includes('s')) newHeight = Math.max(380, r.height + dy);

      if (dir.includes('w')) {
        const potentialW = r.width - dx;
        if (potentialW >= 550) {
          newWidth = potentialW;
          newX = r.posX + dx;
        }
      }

      if (dir.includes('n')) {
        const potentialH = r.height - dy;
        if (potentialH >= 380) {
          newHeight = potentialH;
          newY = r.posY + dy;
        }
      }

      updatePosition(id, { x: newX, y: newY });
      updateSize(id, { width: newWidth, height: newHeight });
    };

    const handleMouseUp = () => {
      resizeRef.current.resizing = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const windowStyle = isMaximized
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex,
        width: '100%',
        height: '100%',
      }
    : {
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        zIndex,
      };

  return (
    <div
      ref={windowRef}
      style={windowStyle}
      onMouseDown={() => {
        if (!isActive) focusWindow(id);
      }}
      className={`rounded-xl flex flex-col bg-surface overflow-hidden transition-all duration-150 ${
        isActive
          ? 'border-2 border-primary-900 ring-2 ring-primary-700/60 shadow-[0_20px_60px_rgba(0,0,0,0.35)] z-40'
          : 'border-2 border-primary-600/90 shadow-xl opacity-98 hover:border-primary-700'
      }`}
    >
      <WindowTitleBar
        title={title}
        iconName={iconName}
        isActive={isActive}
        isMaximized={isMaximized}
        onMinimize={() => minimizeWindow(id)}
        onToggleMaximize={() => toggleMaximize(id)}
        onClose={() => closeWindow(id)}
        onMouseDown={handleDragStart}
      />

      <div className="flex-1 min-h-0 w-full flex flex-col bg-surface p-3 md:p-4 overflow-y-auto">
        {children}
      </div>

      {!isMaximized && <ResizeHandles onResizeStart={handleResizeStart} />}
    </div>
  );
}
