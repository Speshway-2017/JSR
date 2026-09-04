import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

const MDIContext = createContext(null);

const MIN_WIDTH = 550;
const MIN_HEIGHT = 380;

export function isPathAllowedForRole(path, role) {
  if (!path) return false;
  const basePath = path.split('?')[0];
  const isSalesPath =
    basePath === '/sales-orders' ||
    basePath === '/sales-materials' ||
    basePath === '/sales-orders/previous' ||
    basePath.startsWith('/sales-orders/');

  if (role === 'sales') {
    return isSalesPath;
  }
  if (role === 'admin') {
    return !isSalesPath;
  }
  return true;
}

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
  '/sales-print': { title: 'Sales Print', icon: 'Printer' },
  '/sales-report': { title: 'Sales Checklist', icon: 'FileBarChart' },
  '/sales-report-2': { title: 'Day wise sale report', icon: 'FileBarChart' },
  '/cash-checklist': { title: 'Cash Checklist', icon: 'Banknote' },
  '/less-checklist': { title: 'Less Checklist', icon: 'Receipt' },
  '/settings': { title: 'Price Settings', icon: 'Settings' },
  '/shortcuts': { title: 'Shortcut Settings', icon: 'Keyboard' },
  '/sales-orders': { title: 'Sales Orders', icon: 'ClipboardPen' },
  '/sales-materials': { title: 'Sales Materials', icon: 'Package' },
  '/sales-orders/previous': { title: 'Previous Reports', icon: 'History' },
};

export const DEFAULT_SHORTCUTS = {
  F1: { type: 'window', action: 'toggle_maximize', label: 'Maximize / Restore Active Window' },
  F2: { type: 'window', action: 'minimize_active', label: 'Minimize Active Window' },
  F3: { type: 'window', action: 'close_active', label: 'Close Active Window' },
  F4: { type: 'module', path: '/sell', title: 'Sales Entry', label: 'Sales Entry' },
  F5: { type: 'module', path: '/cash-entry', title: 'Cash Entry', label: 'Cash Entry' },
  F6: { type: 'module', path: '/ledger', title: 'Ledger', label: 'Ledger' },
  F7: { type: 'module', path: '/transactions', title: 'Transactions', label: 'Transactions' },
  F8: { type: 'module', path: '/purchase', title: 'Purchase', label: 'Purchase' },
  F9: { type: 'module', path: '/sell', title: 'Sales Entry', label: 'Sales Entry' },
  F10: { type: 'module', path: '/sale-patty', title: 'Sale Patty', label: 'Sale Patty' },
  F11: { type: 'window', action: 'minimize_all', label: 'Minimize All Windows' },
  F12: { type: 'module', path: '/customers', title: 'Customer List', label: 'Customer List' },
};

export const AVAILABLE_SHORTCUT_OPTIONS = [
  { value: 'none', label: 'None / Disabled', group: 'General' },
  { value: 'window:toggle_maximize', label: 'Maximize / Restore Active Window', group: 'Window Actions', type: 'window', action: 'toggle_maximize' },
  { value: 'window:minimize_active', label: 'Minimize Active Window', group: 'Window Actions', type: 'window', action: 'minimize_active' },
  { value: 'window:minimize_all', label: 'Minimize All Windows', group: 'Window Actions', type: 'window', action: 'minimize_all' },
  { value: 'window:close_active', label: 'Close Active Window / Tab', group: 'Window Actions', type: 'window', action: 'close_active' },
  { value: 'window:next_window', label: 'Switch Next Window (Ctrl+Tab)', group: 'Window Actions', type: 'window', action: 'next_window' },
  { value: 'window:prev_window', label: 'Switch Previous Window (Ctrl+Shift+Tab)', group: 'Window Actions', type: 'window', action: 'prev_window' },
  { value: 'module:/sell', label: 'Open: Sales Entry', group: 'Application Modules', type: 'module', path: '/sell', title: 'Sales Entry' },
  { value: 'module:/customers', label: 'Open: Customer List', group: 'Application Modules', type: 'module', path: '/customers', title: 'Customer List' },
  { value: 'module:/vendors', label: 'Open: Vendor List', group: 'Application Modules', type: 'module', path: '/vendors', title: 'Vendor List' },
  { value: 'module:/materials', label: 'Open: Product List', group: 'Application Modules', type: 'module', path: '/materials', title: 'Product List' },
  { value: 'module:/schedules', label: 'Open: Schedule List', group: 'Application Modules', type: 'module', path: '/schedules', title: 'Schedule List' },
  { value: 'module:/cash-entry', label: 'Open: Cash Entry', group: 'Application Modules', type: 'module', path: '/cash-entry', title: 'Cash Entry' },
  { value: 'module:/purchase', label: 'Open: Purchase', group: 'Application Modules', type: 'module', path: '/purchase', title: 'Purchase' },
  { value: 'module:/sale-patty', label: 'Open: Sale Patty', group: 'Application Modules', type: 'module', path: '/sale-patty', title: 'Sale Patty' },
  { value: 'module:/transactions', label: 'Open: Transactions', group: 'Application Modules', type: 'module', path: '/transactions', title: 'Transactions' },
  { value: 'module:/inventory', label: 'Open: Inventory History', group: 'Application Modules', type: 'module', path: '/inventory', title: 'Inventory History' },
  { value: 'module:/ledger', label: 'Open: Ledger', group: 'Application Modules', type: 'module', path: '/ledger', title: 'Ledger' },
  { value: 'module:/outstanding', label: 'Open: Outstanding', group: 'Application Modules', type: 'module', path: '/outstanding', title: 'Outstanding' },
  { value: 'module:/bill-print', label: 'Open: Bill Print', group: 'Application Modules', type: 'module', path: '/bill-print', title: 'Bill Print' },
  { value: 'module:/sales-print', label: 'Open: Sales Print', group: 'Application Modules', type: 'module', path: '/sales-print', title: 'Sales Print' },
  { value: 'module:/sales-report', label: 'Open: Sales Checklist', group: 'Application Modules', type: 'module', path: '/sales-report', title: 'Sales Checklist' },
  { value: 'module:/sales-report-2', label: 'Open: Day wise sale report', group: 'Application Modules', type: 'module', path: '/sales-report-2', title: 'Day wise sale report' },
  { value: 'module:/cash-checklist', label: 'Open: Cash Checklist', group: 'Application Modules', type: 'module', path: '/cash-checklist', title: 'Cash Checklist' },
  { value: 'module:/less-checklist', label: 'Open: Less Checklist', group: 'Application Modules', type: 'module', path: '/less-checklist', title: 'Less Checklist' },
  { value: 'module:/hamali-report', label: 'Open: Hamali Report', group: 'Application Modules', type: 'module', path: '/hamali-report', title: 'Hamali Report' },
  { value: 'module:/settings', label: 'Open: Price Settings', group: 'Application Modules', type: 'module', path: '/settings', title: 'Price Settings' },
  { value: 'module:/shortcuts', label: 'Open: Shortcut Settings', group: 'Application Modules', type: 'module', path: '/shortcuts', title: 'Shortcut Settings' },
];

const SHORTCUTS_STORAGE_KEY = 'jsr_keyboard_shortcuts_v1';

export function MDIProvider({ children }) {
  const { user, role } = useAuth();
  const [windows, setWindows] = useState([]);
  const [activeWindowId, setActiveWindowId] = useState(null);
  const [nextZIndex, setNextZIndex] = useState(10);
  const [confirmCloseId, setConfirmCloseId] = useState(null);

  const [shortcuts, setShortcuts] = useState(() => {
    try {
      const saved = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_SHORTCUTS;
  });

  const updateShortcuts = useCallback((newShortcuts) => {
    setShortcuts(newShortcuts);
    try {
      localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(newShortcuts));
    } catch {
      /* ignore */
    }
  }, []);

  const resetShortcuts = useCallback(() => {
    setShortcuts(DEFAULT_SHORTCUTS);
    try {
      localStorage.removeItem(SHORTCUTS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const userIdKey = user?.id || user?._id || user?.email || role;
  const storageKey = user ? `jsr_mdi_windows_v1_${userIdKey}` : null;

  // Restore open window state from user-scoped localStorage
  useEffect(() => {
    if (!storageKey) {
      setWindows([]);
      setActiveWindowId(null);
      return;
    }
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const validWindows = parsed.filter((w) => isPathAllowedForRole(w.path, role));
          let maxZ = 10;
          const restored = validWindows.map((w) => {
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
          return;
        }
      }
    } catch (err) {
      console.warn('[MDI] Failed to restore saved windows:', err);
    }
    setWindows([]);
    setActiveWindowId(null);
  }, [storageKey, role]);

  // Save state to user-scoped localStorage on changes
  useEffect(() => {
    if (!storageKey) return;
    try {
      const validWindows = windows.filter((w) => isPathAllowedForRole(w.path, role));
      const serializable = validWindows.map((w) => ({
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
      localStorage.setItem(storageKey, JSON.stringify(serializable));
    } catch {
      /* ignore */
    }
  }, [windows, storageKey, role]);

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
      if (!path || !isPathAllowedForRole(path, role)) return;

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

        const offsetCount = prev.length % 6;
        const startX = 35 + offsetCount * 30;
        const startY = 25 + offsetCount * 25;

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
    [focusWindow, role]
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
      if (next.length > 0) {
        const sorted = [...next].sort((a, b) => b.zIndex - a.zIndex);
        const top = sorted.find((w) => !w.isMinimized);
        if (top) {
          setActiveWindowId(top.id);
        } else {
          setActiveWindowId(null);
        }
      } else {
        setActiveWindowId(null);
      }

      return next;
    });
  }, []);

  const minimizeWindow = useCallback((id) => {
    setWindows((prev) => {
      const next = prev.map((w) => (w.id === id ? { ...w, isMinimized: true, isActive: false } : w));
      const sorted = [...next].sort((a, b) => b.zIndex - a.zIndex);
      const top = sorted.find((w) => !w.isMinimized);
      if (top) {
        setActiveWindowId(top.id);
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

  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switcherIndex, setSwitcherIndex] = useState(0);

  const selectSwitcherWindow = useCallback(
    (idx) => {
      const validWindows = windows.filter((w) => isPathAllowedForRole(w.path, role));
      if (idx >= 0 && idx < validWindows.length) {
        const target = validWindows[idx];
        if (target.isMinimized) {
          restoreWindow(target.id);
        } else {
          focusWindow(target.id);
        }
      }
      setSwitcherOpen(false);
    },
    [windows, role, restoreWindow, focusWindow]
  );

  const closeSwitcher = useCallback(() => {
    setSwitcherOpen(false);
  }, []);

  // Global Event Capturing Keyboard Shortcuts & Live Task Switcher Overlay for Admin Dashboard
  useEffect(() => {
    if (role !== 'admin') return;

    const handleKeyDown = (e) => {
      // 1. Ctrl + Tab / Ctrl + Shift + Tab (Windows Alt+Tab / Ctrl+Tab live switcher preview)
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const validWindows = windows.filter((w) => isPathAllowedForRole(w.path, role));
        if (validWindows.length === 0) return;

        setSwitcherOpen((prevOpen) => {
          if (!prevOpen) {
            const activeIdx = validWindows.findIndex((w) => w.id === activeWindowId);
            const initialNext = e.shiftKey
              ? activeIdx <= 0 ? validWindows.length - 1 : activeIdx - 1
              : activeIdx < 0 ? 0 : (activeIdx + 1) % validWindows.length;
            setSwitcherIndex(initialNext);
            return true;
          } else {
            setSwitcherIndex((prevIdx) => {
              if (e.shiftKey) {
                return prevIdx <= 0 ? validWindows.length - 1 : prevIdx - 1;
              }
              return (prevIdx + 1) % validWindows.length;
            });
            return true;
          }
        });
        return;
      }

      // 2. Function keys F1..F12
      const key = e.key;
      if (shortcuts && shortcuts[key]) {
        const binding = shortcuts[key];
        if (!binding || binding.action === 'none') return;
        e.preventDefault();
        e.stopPropagation();

        if (binding.type === 'module' && binding.path) {
          openWindow({ path: binding.path, title: binding.title });
          return;
        }

        if (binding.type === 'window') {
          switch (binding.action) {
            case 'toggle_maximize':
              if (activeWindowId) toggleMaximize(activeWindowId);
              break;
            case 'minimize_active':
              if (activeWindowId) minimizeWindow(activeWindowId);
              break;
            case 'minimize_all':
              minimizeAllWindows();
              break;
            case 'close_active':
              if (activeWindowId) closeWindow(activeWindowId, true);
              break;
            case 'next_window': {
              const validWindows = windows.filter((w) => isPathAllowedForRole(w.path, role));
              if (validWindows.length === 0) break;
              const idx = validWindows.findIndex((w) => w.id === activeWindowId);
              const next = validWindows[(idx + 1) % validWindows.length];
              if (next) {
                if (next.isMinimized) restoreWindow(next.id);
                else focusWindow(next.id);
              }
              break;
            }
            case 'prev_window': {
              const validWindows = windows.filter((w) => isPathAllowedForRole(w.path, role));
              if (validWindows.length === 0) break;
              const idx = validWindows.findIndex((w) => w.id === activeWindowId);
              const prev = validWindows[idx <= 0 ? validWindows.length - 1 : idx - 1];
              if (prev) {
                if (prev.isMinimized) restoreWindow(prev.id);
                else focusWindow(prev.id);
              }
              break;
            }
            default:
              break;
          }
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Control') {
        setSwitcherOpen((open) => {
          if (open) {
            const validWindows = windows.filter((w) => isPathAllowedForRole(w.path, role));
            setSwitcherIndex((idx) => {
              if (idx >= 0 && idx < validWindows.length) {
                const target = validWindows[idx];
                if (target) {
                  if (target.isMinimized) {
                    restoreWindow(target.id);
                  } else {
                    focusWindow(target.id);
                  }
                }
              }
              return idx;
            });
          }
          return false;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keyup', handleKeyUp, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keyup', handleKeyUp, true);
    };
  }, [
    role,
    activeWindowId,
    windows,
    shortcuts,
    openWindow,
    toggleMaximize,
    minimizeWindow,
    minimizeAllWindows,
    closeWindow,
    restoreWindow,
    focusWindow,
  ]);

  return (
    <MDIContext.Provider
      value={{
        windows,
        activeWindowId,
        shortcuts,
        updateShortcuts,
        resetShortcuts,
        switcherOpen,
        switcherIndex,
        setSwitcherIndex,
        closeSwitcher,
        selectSwitcherWindow,
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
