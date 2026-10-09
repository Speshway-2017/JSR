import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Package,
  FileBarChart,
  LogOut,
  Menu,
  X,
  ClipboardPen,
  ChevronDown,
  KeyRound,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  useIsElectron,
  useElectronPlatform,
  WindowControls,
  dragRegion,
  noDragRegion,
  MAC_TRAFFIC_PAD,
} from './TitleBar';
import BrandLogo from './BrandLogo';
import ChangePasswordModal from './ChangePasswordModal';
import UtilConfirmModal from './UtilConfirmModal';
import LogoutConfirmModal from './LogoutConfirmModal';
import ShareReportModal from './ShareReportModal';
import MDIWorkspace from './mdi/MDIWorkspace';
import { useMDI } from '../context/MDIContext';
import { warmRaituBillAssets } from '../utils/raituBillShared';
import { runAtlasUtilAction } from '../utils/atlasNetwork';

const salesTopLinks = [
  { to: '/sales-orders', icon: ClipboardPen, label: 'Sales Orders', end: true },
  { to: '/sales-materials', icon: Package, label: 'Sales Materials' },
  { to: '/sales-orders/previous', icon: FileBarChart, label: 'Previous Reports' },
];

/** Admin top menu — labels match the product menu bar */
const adminTopMenus = [
  {
    id: 'master',
    label: 'Master',
    items: [
      { to: '/customers', label: 'Customer List' },
      { to: '/vendors', label: 'Vendor List' },
      { to: '/materials', label: 'Product List' },
      { to: '/schedules', label: 'Schedule List' },
    ],
  },
  {
    id: 'inventory',
    label: 'Inventory',
    items: [
      { to: '/cash-entry', label: 'Cash Entry' },
      { to: '/sell', label: 'Sales Entry' },
      { to: '/purchase', label: 'Purchase' },
      { to: '/sale-patty', label: 'Sale Patty' },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { to: '/transactions', label: 'Transactions' },
      { to: '/inventory', label: 'Inventory History' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { to: '/ledger', label: 'Ledger' },
      { to: '/outstanding', label: 'Outstanding' },
      { to: '/bill-print', label: 'Bill Print' },
      { to: '/sales-report', label: 'Sales Checklist' },
      { to: '/cash-checklist', label: 'Cash Checklist' },
      { to: '/less-checklist', label: 'Less Checklist' },
      { to: '/sales-report-2', label: 'Day wise sale report' },
      { to: '/cash-sales-report', label: 'Cash sale report' },
      { to: '/hamali-report', label: 'Hamali Report' },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { to: '/settings', label: 'Price Settings' },
      { to: '/shortcuts', label: 'Shortcut Settings' },
      { to: '/whatsapp-settings', label: 'WhatsApp Settings' },
    ],
  },
  {
    id: 'util',
    label: 'Util',
    items: [
      { action: 'backup', label: 'Backup' },
      { action: 'restore', label: 'Restore' },
    ],
  },
];

function pathMatches(to, pathname, end = false) {
  if (end || to === '/') return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function menuIsActive(menu, pathname) {
  return menu.items.some((item) => item.to && pathMatches(item.to, pathname));
}

function linkClass(isActive) {
  return `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
    isActive
      ? 'nav-active'
      : 'text-primary-500 hover:bg-primary-50 hover:text-primary-600'
  }`;
}

function AdminTopNav({ onNavigate, user, onLogout, onChangePassword, onUtilAction }) {
  const location = useLocation();
  const { openWindow, windows } = useMDI();
  const [openMenuId, setOpenMenuId] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const barRef = useRef(null);
  const buttonRefs = useRef({});

  useEffect(() => {
    setOpenMenuId(null);
  }, [location.pathname]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!barRef.current?.contains(e.target)) setOpenMenuId(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };
    const onScroll = () => setOpenMenuId(null);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, []);

  const toggleMenu = (id) => {
    if (openMenuId === id) {
      setOpenMenuId(null);
      return;
    }
    const btn = buttonRefs.current[id];
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpenMenuId(id);
  };

  const openMenu = adminTopMenus.find((m) => m.id === openMenuId);

  return (
    <div ref={barRef} className="flex items-center gap-1 min-w-0 flex-1 overflow-visible">
      <nav className="hidden md:flex items-center gap-0.5 min-w-0 flex-1 overflow-visible">
        {adminTopMenus.map((menu) => {
          const active = menu.items.some((item) => item.to && windows.some((w) => w.path === item.to && !w.isMinimized));
          const open = openMenuId === menu.id;
          const hasItems = menu.items.length > 0;

          return (
            <div key={menu.id} className="relative shrink-0">
              <button
                type="button"
                ref={(el) => {
                  buttonRefs.current[menu.id] = el;
                }}
                onClick={() => {
                  if (!hasItems) return;
                  toggleMenu(menu.id);
                }}
                style={noDragRegion}
                className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  active || open
                    ? 'text-primary-800 bg-primary-100'
                    : 'text-primary-600 hover:bg-primary-50 hover:text-primary-800'
                } ${!hasItems ? 'opacity-60 cursor-default' : ''}`}
                aria-expanded={hasItems ? open : undefined}
                aria-haspopup={hasItems ? 'menu' : undefined}
              >
                {menu.label}
                {hasItems && (
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                )}
              </button>
            </div>
          );
        })}
      </nav>

      {openMenu && openMenu.items.length > 0 && (
        <div
          role="menu"
          className="fixed min-w-[12rem] rounded-xl border border-primary-200 bg-surface shadow-card py-1 z-[9999]"
          style={{ top: menuPos.top, left: menuPos.left, ...noDragRegion }}
        >
          {openMenu.items.map((item) =>
            item.action ? (
              <button
                key={item.action}
                type="button"
                role="menuitem"
                className="block w-full text-left px-4 py-2.5 text-sm text-primary-700 hover:bg-primary-50"
                onClick={() => {
                  setOpenMenuId(null);
                  onNavigate?.();
                  onUtilAction?.(item.action);
                }}
              >
                {item.label}
              </button>
            ) : (
              <button
                key={item.to}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpenMenuId(null);
                  onNavigate?.();
                  openWindow({ path: item.to, title: item.label });
                }}
                className={`block w-full text-left px-4 py-2.5 text-sm transition ${
                  windows.some((w) => w.path === item.to && w.isActive && !w.isMinimized)
                    ? 'bg-primary-100 text-primary-800 font-semibold'
                    : 'text-primary-700 hover:bg-primary-50'
                }`}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}

      <div
        className="hidden md:flex items-center gap-2 shrink-0 ml-2 pl-2 border-l border-primary-100"
        style={noDragRegion}
      >
        <span className="text-xs text-primary-400 max-w-[10rem] truncate hidden lg:inline">
          {user?.email}
        </span>
        <button
          type="button"
          onClick={onChangePassword}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-primary-600 hover:bg-primary-50 transition"
          title="Change password"
        >
          <KeyRound className="w-4 h-4" />
          Password
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-500/90 hover:bg-red-50/60 transition"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </div>
  );
}

function AdminMobileMenu({ onClose, onLogout, onChangePassword, user, onUtilAction }) {
  const { openWindow, windows } = useMDI();

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-primary-100">
        <h1 className="font-bold text-primary-700 text-lg leading-tight">JSR</h1>
        <p className="text-xs text-primary-400">Admin</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {adminTopMenus.map((menu) => (
          <div key={menu.id}>
            <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary-400">
              {menu.label}
            </p>
            {menu.items.length === 0 ? (
              <p className="px-3 py-2 text-sm text-primary-300">No items yet</p>
            ) : (
              <div className="space-y-0.5">
                {menu.items.map((item) =>
                  item.action ? (
                    <button
                      key={item.action}
                      type="button"
                      className={linkClass(false)}
                      onClick={() => {
                        onClose?.();
                        onUtilAction?.(item.action);
                      }}
                    >
                      {item.label}
                    </button>
                  ) : (
                    <button
                      key={item.to}
                      type="button"
                      onClick={() => {
                        onClose?.();
                        openWindow({ path: item.to, title: item.label });
                      }}
                      className={`w-full text-left ${linkClass(
                        windows.some((w) => w.path === item.to && w.isActive && !w.isMinimized)
                      )}`}
                    >
                      {item.label}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-primary-100 space-y-2">
        <p className="text-xs text-primary-400 px-2 truncate">{user?.email}</p>
        <button
          type="button"
          onClick={() => {
            onClose?.();
            onChangePassword?.();
          }}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-primary-600 hover:bg-primary-50 font-medium transition"
        >
          <KeyRound className="w-5 h-5" />
          Change password
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-500/90 hover:bg-red-50/60 font-medium transition"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>
    </div>
  );
}

function salesLinkIsActive(to, pathname, end = false) {
  if (to === '/sales-orders' && end) {
    if (pathname === '/sales-orders') return true;
    if (pathname.startsWith('/sales-orders/') && !pathname.startsWith('/sales-orders/previous')) {
      return true;
    }
    return false;
  }
  return pathMatches(to, pathname, end);
}

function SalesTopNav({ onNavigate, user, onLogout, onChangePassword }) {
  const location = useLocation();

  return (
    <div className="flex items-center gap-1 min-w-0 flex-1 overflow-visible">
      <nav className="hidden md:flex items-center gap-0.5 min-w-0 flex-1 overflow-visible">
        {salesTopLinks.map(({ to, label, end }) => {
          const active = salesLinkIsActive(to, location.pathname, end);
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onNavigate}
              style={noDragRegion}
              className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                active
                  ? 'text-primary-800 bg-primary-100'
                  : 'text-primary-600 hover:bg-primary-50 hover:text-primary-800'
              }`}
            >
              {label}
            </NavLink>
          );
        })}
      </nav>

      <div
        className="hidden md:flex items-center gap-2 shrink-0 ml-2 pl-2 border-l border-primary-100"
        style={noDragRegion}
      >
        <span className="text-xs text-primary-400 max-w-[10rem] truncate hidden lg:inline">
          {user?.email}
        </span>
        <button
          type="button"
          onClick={onChangePassword}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-primary-600 hover:bg-primary-50 transition"
          title="Change password"
        >
          <KeyRound className="w-4 h-4" />
          Password
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-500/90 hover:bg-red-50/60 transition"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>
    </div>
  );
}

function SalesMobileMenu({ onClose, onLogout, onChangePassword, user }) {
  const location = useLocation();

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-primary-100">
        <h1 className="font-bold text-primary-700 text-lg leading-tight">JSR</h1>
        <p className="text-xs text-primary-400">Sales</p>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {salesTopLinks.map(({ to, icon: Icon, label, end }) => {
          const active = salesLinkIsActive(to, location.pathname, end);
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={`w-full ${linkClass(active)}`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-primary-100 space-y-2">
        <p className="text-xs text-primary-400 px-2 truncate">{user?.email}</p>
        <button
          type="button"
          onClick={() => {
            onClose?.();
            onChangePassword?.();
          }}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-primary-600 hover:bg-primary-50 font-medium transition"
        >
          <KeyRound className="w-5 h-5" />
          Change password
        </button>
        <button
          type="button"
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-500/90 hover:bg-red-50/60 font-medium transition"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>
    </div>
  );
}

export default function Layout({ children }) {
  const { logout, user, isSales } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const sellPage = location.pathname === '/sell';
  const isElectron = useIsElectron();
  const platform = useElectronPlatform();
  const isMacElectron = isElectron && platform === 'darwin';
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [utilModalAction, setUtilModalAction] = useState(null);
  const [utilBusy, setUtilBusy] = useState(false);

  useEffect(() => {
    warmRaituBillAssets();
  }, []);

  const openLogoutPrompt = () => setLogoutOpen(true);

  const confirmLogout = () => {
    setLogoutOpen(false);
    logout();
    navigate('/login');
  };

  const openChangePassword = () => setPasswordOpen(true);
  const closeMenu = () => setMenuOpen(false);

  const handleUtilAction = (action) => {
    setUtilModalAction(action);
  };

  const handleUtilConfirm = async () => {
    if (!utilModalAction || utilBusy) return;
    setUtilBusy(true);
    try {
      await runAtlasUtilAction(utilModalAction, { skipConfirm: true });
    } finally {
      setUtilBusy(false);
      setUtilModalAction(null);
      if (document.activeElement && typeof document.activeElement.blur === 'function') {
        document.activeElement.blur();
      }
      if (typeof window.focus === 'function') {
        window.focus();
      }
    }
  };
  const { minimizeAllWindows } = useMDI();
  const headerPadLeft = isMacElectron ? MAC_TRAFFIC_PAD : undefined;
  const chromeStyle = isElectron ? dragRegion : undefined;
  const roleLabel = isSales ? 'Sales' : 'Admin';

  return (
    <div className="h-full min-h-0 flex flex-col bg-cream overflow-hidden">
      <header
        className="fixed left-0 right-0 top-0 z-[9990] bg-surface border-b border-primary-200 overflow-visible"
        style={chromeStyle}
      >
        <div
          className="flex items-center gap-3 px-3 md:px-4 h-12 overflow-visible"
          style={headerPadLeft ? { paddingLeft: headerPadLeft } : undefined}
        >
          <button
            type="button"
            onClick={() => {
              closeMenu();
              minimizeAllWindows();
            }}
            className="flex items-center shrink-0 text-left hover:opacity-85 transition pr-1"
            title="Minimize all active windows"
            style={noDragRegion}
          >
            <div className="leading-tight">
              <p className="font-bold text-primary-700 text-sm">JSR</p>
              <p className="text-[10px] text-primary-400 -mt-0.5">{roleLabel}</p>
            </div>
          </button>

          {isSales ? (
            <SalesTopNav
              onNavigate={closeMenu}
              user={user}
              onLogout={openLogoutPrompt}
              onChangePassword={openChangePassword}
            />
          ) : (
            <AdminTopNav
              onNavigate={closeMenu}
              user={user}
              onLogout={openLogoutPrompt}
              onChangePassword={openChangePassword}
              onUtilAction={handleUtilAction}
            />
          )}

          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            style={noDragRegion}
            className="md:hidden p-2 rounded-lg hover:bg-primary-50 text-primary-700 shrink-0"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>

          <WindowControls className="h-12 -mr-3 md:-mr-4" />
        </div>
        <div className="h-0.5 bg-primary-700/80" />
      </header>

      {menuOpen && (
        <>
          <div className="md:hidden fixed inset-0 bg-black/20 z-40" onClick={closeMenu} />
          <aside className="md:hidden fixed right-0 top-0 bottom-0 w-72 bg-surface z-50 flex flex-col shadow-xl">
            <div style={noDragRegion} className="flex flex-col h-full">
              {isSales ? (
                <SalesMobileMenu
                  onClose={closeMenu}
                  onLogout={openLogoutPrompt}
                  onChangePassword={openChangePassword}
                  user={user}
                />
              ) : (
                <AdminMobileMenu
                  onClose={closeMenu}
                  onLogout={openLogoutPrompt}
                  onChangePassword={openChangePassword}
                  user={user}
                  onUtilAction={handleUtilAction}
                />
              )}
            </div>
          </aside>
        </>
      )}

      <main className="flex-1 min-h-0 overflow-hidden flex flex-col pt-[3.125rem]">
        {isSales ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6">{children}</div>
        ) : (
          <MDIWorkspace fallbackChildren={children} />
        )}
      </main>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
      <LogoutConfirmModal
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={confirmLogout}
      />
      <UtilConfirmModal
        action={utilModalAction}
        open={!!utilModalAction}
        onClose={() => setUtilModalAction(null)}
        onConfirm={handleUtilConfirm}
        busy={utilBusy}
      />
      <ShareReportModal />
    </div>
  );
}

