import React, { useRef, useEffect, memo } from 'react';
import WindowTitleBar from './WindowTitleBar';
import ResizeHandles from './ResizeHandles';
import { useMDI } from '../../context/MDIContext';

function MDIWindow({ windowItem, children }) {
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
    updateBounds,
  } = useMDI();

  const windowRef = useRef(null);
  const dragStateRef = useRef({
    isDragging: false,
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    currentX: 0,
    currentY: 0,
    rafId: null,
  });

  const resizeStateRef = useRef({
    isResizing: false,
    dir: '',
    startX: 0,
    startY: 0,
    initialX: 0,
    initialY: 0,
    initialW: 0,
    initialH: 0,
    currentX: 0,
    currentY: 0,
    currentW: 0,
    currentH: 0,
    rafId: null,
  });

  // Cleanup any lingering global drag/resize state or DOM shields if component unmounts
  useEffect(() => {
    return () => {
      if (dragStateRef.current.rafId) {
        cancelAnimationFrame(dragStateRef.current.rafId);
      }
      if (resizeStateRef.current.rafId) {
        cancelAnimationFrame(resizeStateRef.current.rafId);
      }
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      const dragShield = document.getElementById('mdi-drag-shield');
      if (dragShield) dragShield.remove();
      const resizeShield = document.getElementById('mdi-resize-shield');
      if (resizeShield) resizeShield.remove();
    };
  }, []);

  if (isMinimized) return null;

  const handleDragStart = (e) => {
    if (isMaximized || e.button !== 0) return;
    if (!isActive) focusWindow(id);

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startPosX = position?.x || 0;
    const startPosY = position?.y || 0;

    dragStateRef.current = {
      isDragging: true,
      startX: startMouseX,
      startY: startMouseY,
      initialX: startPosX,
      initialY: startPosY,
      currentX: startPosX,
      currentY: startPosY,
      rafId: null,
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'move';

    // Invisible high-z-index shield to prevent mouse event loss over iframes/inputs during fast drag
    const shield = document.createElement('div');
    shield.id = 'mdi-drag-shield';
    shield.style.position = 'fixed';
    shield.style.inset = '0';
    shield.style.zIndex = '99999';
    shield.style.cursor = 'move';
    shield.style.background = 'transparent';
    shield.style.userSelect = 'none';
    document.body.appendChild(shield);

    const handleMouseMove = (me) => {
      const state = dragStateRef.current;
      if (!state.isDragging) return;

      const dx = me.clientX - state.startX;
      const dy = me.clientY - state.startY;

      const containerW = typeof window !== 'undefined' ? window.innerWidth : 1200;
      const containerH = typeof window !== 'undefined' ? window.innerHeight - 88 : 700;
      const curW = size?.width || 800;
      const curH = size?.height || 520;

      const nextX = Math.max(10, Math.min(state.initialX + dx, Math.max(10, containerW - 100)));
      const nextY = Math.max(10, Math.min(state.initialY + dy, Math.max(10, containerH - 60)));

      state.currentX = nextX;
      state.currentY = nextY;

      if (!state.rafId) {
        state.rafId = requestAnimationFrame(() => {
          if (windowRef.current) {
            windowRef.current.style.left = `${state.currentX}px`;
            windowRef.current.style.top = `${state.currentY}px`;
          }
          state.rafId = null;
        });
      }
    };

    const handleMouseUp = () => {
      const state = dragStateRef.current;
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
      state.isDragging = false;

      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      const existingShield = document.getElementById('mdi-drag-shield');
      if (existingShield) existingShield.remove();

      window.removeEventListener('mousemove', handleMouseMove, { passive: true });
      window.removeEventListener('mouseup', handleMouseUp);

      // Commit final position once at drag end
      if (state.currentX !== startPosX || state.currentY !== startPosY) {
        updatePosition(id, { x: state.currentX, y: state.currentY });
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleResizeStart = (e, dir) => {
    if (isMaximized || e.button !== 0) return;
    if (!isActive) focusWindow(id);

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startPosX = position?.x || 0;
    const startPosY = position?.y || 0;
    const startW = size?.width || 800;
    const startH = size?.height || 520;

    resizeStateRef.current = {
      isResizing: true,
      dir,
      startX: startMouseX,
      startY: startMouseY,
      initialX: startPosX,
      initialY: startPosY,
      initialW: startW,
      initialH: startH,
      currentX: startPosX,
      currentY: startPosY,
      currentW: startW,
      currentH: startH,
      rafId: null,
    };

    const cursorStyle = `${dir}-resize`;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = cursorStyle;

    const shield = document.createElement('div');
    shield.id = 'mdi-resize-shield';
    shield.style.position = 'fixed';
    shield.style.inset = '0';
    shield.style.zIndex = '99999';
    shield.style.cursor = cursorStyle;
    shield.style.background = 'transparent';
    shield.style.userSelect = 'none';
    document.body.appendChild(shield);

    const handleMouseMove = (me) => {
      const state = resizeStateRef.current;
      if (!state.isResizing) return;

      const dx = me.clientX - state.startX;
      const dy = me.clientY - state.startY;

      let nextW = state.initialW;
      let nextH = state.initialH;
      let nextX = state.initialX;
      let nextY = state.initialY;

      if (state.dir.includes('e')) {
        nextW = Math.max(500, state.initialW + dx);
      }
      if (state.dir.includes('s')) {
        nextH = Math.max(350, state.initialH + dy);
      }
      if (state.dir.includes('w')) {
        const potentialW = state.initialW - dx;
        if (potentialW >= 500) {
          nextW = potentialW;
          nextX = state.initialX + dx;
        } else {
          nextW = 500;
          nextX = state.initialX + (state.initialW - 500);
        }
      }
      if (state.dir.includes('n')) {
        const potentialH = state.initialH - dy;
        if (potentialH >= 350) {
          nextH = potentialH;
          nextY = state.initialY + dy;
        } else {
          nextH = 350;
          nextY = state.initialY + (state.initialH - 350);
        }
      }

      state.currentX = nextX;
      state.currentY = nextY;
      state.currentW = nextW;
      state.currentH = nextH;

      if (!state.rafId) {
        state.rafId = requestAnimationFrame(() => {
          if (windowRef.current) {
            windowRef.current.style.left = `${state.currentX}px`;
            windowRef.current.style.top = `${state.currentY}px`;
            windowRef.current.style.width = `${state.currentW}px`;
            windowRef.current.style.height = `${state.currentH}px`;
          }
          state.rafId = null;
        });
      }
    };

    const handleMouseUp = () => {
      const state = resizeStateRef.current;
      if (state.rafId) {
        cancelAnimationFrame(state.rafId);
        state.rafId = null;
      }
      state.isResizing = false;

      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      const existingShield = document.getElementById('mdi-resize-shield');
      if (existingShield) existingShield.remove();

      window.removeEventListener('mousemove', handleMouseMove, { passive: true });
      window.removeEventListener('mouseup', handleMouseUp);

      // Commit bounds in a single atomic update at the end of resize
      if (
        state.currentX !== startPosX ||
        state.currentY !== startPosY ||
        state.currentW !== startW ||
        state.currentH !== startH
      ) {
        if (typeof updateBounds === 'function') {
          updateBounds(id, {
            position: { x: state.currentX, y: state.currentY },
            size: { width: state.currentW, height: state.currentH },
          });
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
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
        left: `${position?.x || 0}px`,
        top: `${position?.y || 0}px`,
        width: `${size?.width || 800}px`,
        height: `${size?.height || 520}px`,
        maxWidth: 'calc(100% - 20px)',
        maxHeight: 'calc(100% - 20px)',
        zIndex,
        willChange: 'left, top, width, height',
      };

  return (
    <div
      ref={windowRef}
      style={windowStyle}
      onMouseDown={() => {
        if (!isActive) focusWindow(id);
      }}
      className={`rounded-xl flex flex-col bg-surface overflow-hidden transition-[border-color,box-shadow] duration-150 ${
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

export default memo(MDIWindow);
