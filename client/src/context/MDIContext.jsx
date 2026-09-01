import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const MDIContext = createContext(null);

const STORAGE_KEY = 'jsr_mdi_windows_v1';
const MIN_WIDTH = 550;
const MIN_HEIGHT = 380;

export const MODULE_REGISTRY = {
  '/customers': { title: 'Customer List', icon: 'Users' },
  '/vendors': { title: 'Vendor List', icon: 'UserRound' },
  '/materials': { title: 'Product List', icon: 'Package' },
  '/schedules': { title: 'Schedule List', icon: 'Calendar' },
  '/cash-entry': { title: 'Cash Entry', icon: 'Banknote' },
  '/sell': { title: 'Sales Entry', icon: 'ShoppingCart' },
  '/purchase': { title: 'Purchase', icon: 'Package' },
  '/sale-patty': { title: 'Sale Patty', icon: 'FileText' },
  '/transactions': { title: 'Transactions', icon: 'Receipt' },
  '/inventory': { title: 'Inventory History', icon: 'ClipboardList' },
  '/ledger': { title: 'Ledger', icon: 'BookOpen' },
  '/outstanding': { title: 'Outstanding', icon: 'IndianRupee' },
  '/bill-print': { title: 'Bill Print', icon: 'Printer' },
  '/sales-report': { title: 'Sales Checklist', icon: 'FileBarChart' },
  '/sales-report-2': { title: 'Day wise sale report', icon: 'FileBarChart' },
  '/settings': { title: 'Price Settings', icon: 'Settings' },
  '/sales-orders': { title: 'Sales Orders', icon: 'ClipboardPen' },
  '/sales-materials': { title: 'Sales Materials', icon: 'Package' },
  '/sales-orders/previous': { title: 'Previous Reports', icon: 'History' },
};

export function MDIProvider({ children }) {
  const [windows, setWindows] = useState([]);
  const [activeWindowId, setActiveWindowId] = useState(null);
  const [nextZIndex, setNextZIndex] = useState(10);
  const [confirmCloseId, setConfirmCloseId] = useState(null);

  // Restore open window state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          let maxZ = 10;
          const restored = parsed.map((w) => {
            if (w.zIndex > maxZ) maxZ = w.zIndex;
            return {
              ...w,
              size: {
                width: Math.max(w.size?.width || 800, MIN_WIDTH),
                height: Math.max(w.size?.height || 520, MIN_HEIGHT),
              },
            };
          });
          setWindows(restored);
          setNextZIndex(maxZ + 1);
          const active = restored.find((w) => w.isActive && !w.isMinimized);
          if (active) setActiveWindowId(active.id);
        }
      }
    } catch (err) {
      console.warn('[MDI] Failed to restore saved windows:', err);
    }
  }, []);

  // Save state to localStorage on changes
  useEffect(() => {
    try {
      const serializable = windows.map((w) => ({
        id: w.id,
        path: w.path,
        title: w.title,
        iconName: w.iconName,
        isMinimized: w.isMinimized,
        isMaximized: w.isMaximized,
        isActive: w.isActive,
        zIndex: w.zIndex,
        position: w.position,
        size: w.size,
        prevPosition: w.prevPosition,
        prevSize: w.prevSize,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch {
      /* ignore */
    }
  }, [windows]);

  const focusWindow = useCallback((id) => {
    setWindows((prev) => {
      const target = prev.find((w) => w.id === id);
      if (!target) return prev;
      const others = prev.filter((w) => w.id !== id);
      const reordered = [...others, target];
      return reordered.map((w, idx) => ({
        ...w,
        zIndex: 10 + idx * 5,
        isActive: w.id === id,
      }));
    });
    setActiveWindowId(id);
  }, []);

  const openWindow = useCallback(
    ({ path, title, iconName, initialParams = {} }) => {
      if (!path) return;

      const basePath = path.split('?')[0];
      let id = basePath;
      if (basePath.startsWith('/vendors/')) {
        id = 'vendor-detail';
      } else if (basePath.startsWith('/customers/')) {
        id = 'customer-detail';
      } else if (basePath.startsWith('/sales-orders/') && basePath !== '/sales-orders/previous') {
        id = 'sales-order-detail';
      }

      const meta = MODULE_REGISTRY[basePath] || MODULE_REGISTRY[id] || {};
      let winTitle = title;
      let icon = iconName || meta.icon;
      if (!winTitle) {
        if (id === 'vendor-detail') {
          winTitle = 'Vendor Details';
          icon = icon || 'UserRound';
        } else if (id === 'customer-detail') {
          winTitle = 'Customer Details';
          icon = icon || 'Users';
        } else if (id === 'sales-order-detail') {
          winTitle = 'Sales Order Details';
          icon = icon || 'ClipboardPen';
        } else {
          winTitle = meta.title || 'Module';
          icon = icon || 'Package';
        }
      }
      if (!icon) icon = 'Package';

      setWindows((prev) => {
        const existing = prev.find((w) => w.id === id);
        if (existing) {
          // If window exists, update its path, title & parameters, restore & focus it
          setTimeout(() => focusWindow(id), 0);
          return prev.map((w) =>
            w.id === id
              ? {
                  ...w,
                  path,
                  title: winTitle,
                  iconName: icon,
                  isMinimized: false,
                  params: initialParams,
                }
              : w
          );
        }

        // Calculate offset position for cascading windows
        const offsetCount = prev.length % 6;
        const startX = 35 + offsetCount * 30;
        const startY = 25 + offsetCount * 25;

        // Sensible default size based on module type
        const isWide =
          path === '/sell' ||
          path === '/ledger' ||
          path === '/sales-report' ||
          path === '/sales-orders' ||
          id === 'sales-order-detail';
        const defaultWidth = isWide ? 960 : 840;
        const defaultHeight = isWide ? 620 : 540;

        const updatedOthers = prev.map((w) => ({ ...w, isActive: false }));
        const newZ = 10 + updatedOthers.length * 5;

        const newWin = {
          id,
          path,
          title: winTitle,
          iconName: icon,
          isOpen: true,
          isMinimized: false,
          isMaximized: false,
          isActive: true,
          zIndex: newZ,
          position: { x: startX, y: startY },
          size: { width: defaultWidth, height: defaultHeight },
          prevPosition: { x: startX, y: startY },
          prevSize: { width: defaultWidth, height: defaultHeight },
          params: initialParams,
        };

        setActiveWindowId(id);
        return [...updatedOthers, newWin];
      });
    },
    [focusWindow]
  );

  const closeWindow = useCallback((id, force = false) => {
    setWindows((prev) => {
      const target = prev.find((w) => w.id === id);
      if (!target) return prev;

      if (!force && target.hasUnsavedChanges) {
        setConfirmCloseId(id);
        return prev;
      }

      const next = prev.filter((w) => w.id !== id);
      const remainingUnminimized = next.filter((w) => !w.isMinimized);

      if (remainingUnminimized.length > 0) {
        const topRemaining = remainingUnminimized.reduce((top, w) => (w.zIndex > top.zIndex ? w : top));
        topRemaining.isActive = true;
        setActiveWindowId(topRemaining.id);
      } else {
        setActiveWindowId(null);
      }

      return next;
    });
  }, []);

  const minimizeWindow = useCallback((id) => {
    setWindows((prev) => {
      const next = prev.map((w) => (w.id === id ? { ...w, isMinimized: true, isActive: false } : w));
      const remaining = next.filter((w) => !w.isMinimized);
      if (remaining.length > 0) {
        const topRemaining = remaining.reduce((top, w) => (w.zIndex > top.zIndex ? w : top));
        topRemaining.isActive = true;
        setActiveWindowId(topRemaining.id);
      } else {
        setActiveWindowId(null);
      }
      return next;
    });
  }, []);

  const restoreWindow = useCallback(
    (id) => {
      setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, isMinimized: false } : w)));
      focusWindow(id);
    },
    [focusWindow]
  );

  const toggleMaximize = useCallback((id) => {
    setWindows((prev) =>
      prev.map((w) => {
        if (w.id !== id) return w;
        if (w.isMaximized) {
          return {
            ...w,
            isMaximized: false,
            position: { ...w.prevPosition },
            size: { ...w.prevSize },
          };
        }
        return {
          ...w,
          isMaximized: true,
          prevPosition: { ...w.position },
          prevSize: { ...w.size },
        };
      })
    );
  }, []);

  const updatePosition = useCallback((id, position) => {
    setWindows((prev) =>
      prev.map((w) => (w.id === id ? { ...w, position: { x: Math.max(0, position.x), y: Math.max(0, position.y) } } : w))
    );
  }, []);

  const updateSize = useCallback((id, size) => {
    setWindows((prev) =>
      prev.map((w) =>
        w.id === id
          ? {
              ...w,
              size: {
                width: Math.max(size.width, MIN_WIDTH),
                height: Math.max(size.height, MIN_HEIGHT),
              },
            }
          : w
      )
    );
  }, []);

  const setUnsavedChanges = useCallback((id, hasChanges) => {
    setWindows((prev) => prev.map((w) => (w.id === id ? { ...w, hasUnsavedChanges: !!hasChanges } : w)));
  }, []);

  const minimizeAllWindows = useCallback(() => {
    setWindows((prev) => prev.map((w) => ({ ...w, isMinimized: true, isActive: false })));
    setActiveWindowId(null);
  }, []);

  return (
    <MDIContext.Provider
      value={{
        windows,
        activeWindowId,
        openWindow,
        closeWindow,
        minimizeWindow,
        minimizeAllWindows,
        restoreWindow,
        toggleMaximize,
        focusWindow,
        updatePosition,
        updateSize,
        setUnsavedChanges,
        confirmCloseId,
        cancelCloseModal: () => setConfirmCloseId(null),
        confirmCloseModal: () => {
          if (confirmCloseId) {
            closeWindow(confirmCloseId, true);
            setConfirmCloseId(null);
          }
        },
      }}
    >
      {children}
    </MDIContext.Provider>
  );
}

export function useMDI() {
  const context = useContext(MDIContext);
  if (!context) {
    throw new Error('useMDI must be used within an MDIProvider');
  }
  return context;
}
