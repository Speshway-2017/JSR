import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  UserRound,
  Truck,
  Package,
  ShoppingCart,
  Receipt,
  ClipboardList,
  Settings,
  FileBarChart,
  LogOut,
  Menu,
  X,
  ChevronDown,
  ClipboardPen,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useIsElectron } from './TitleBar';
import BrandLogo from './BrandLogo';

const adminTopLinks = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', end: true },
];

const salesTopLinks = [
  { to: '/sales-orders', icon: ClipboardPen, label: 'Sales Orders', end: true },
  { to: '/sales-orders/previous', icon: FileBarChart, label: 'Previous Reports' },
];

const adminNavSections = [
  {
    id: 'parties',
    label: 'Parties',
    items: [
      { to: '/vendors', icon: Users, label: 'Vendors' },
      { to: '/customers', icon: UserRound, label: 'Customers' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    items: [
      { to: '/loads', icon: Truck, label: 'Add Load' },
      { to: '/sell', icon: ShoppingCart, label: 'Sell' },
      { to: '/sales-orders', icon: ClipboardPen, label: 'Sales Orders' },
      { to: '/sales-orders/previous', icon: FileBarChart, label: 'Previous Reports' },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    items: [
      { to: '/materials', icon: Package, label: 'Materials' },
      { to: '/settings', icon: Settings, label: 'Price Settings' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    items: [
      { to: '/inventory', icon: ClipboardList, label: 'Inventory' },
      { to: '/sales-report', icon: FileBarChart, label: 'Sales Report' },
      { to: '/transactions', icon: Receipt, label: 'Transactions' },
    ],
  },
];

function pathMatches(to, pathname, end = false) {
  if (end || to === '/') return pathname === to;
  return pathname === to || pathname.startsWith(`${to}/`);
}

function getActiveSectionId(sections, pathname) {
  for (const section of sections) {
    if (section.items.some((item) => pathMatches(item.to, pathname))) {
      return section.id;
    }
  }
  return null;
}

function linkClass(isActive) {
  return `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
    isActive
      ? 'nav-active'
      : 'text-primary-500 hover:bg-primary-50 hover:text-primary-600'
  }`;
}

export default function Layout({ children }) {
  const { logout, user, role, isSales } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isElectron = useIsElectron();
  const [menuOpen, setMenuOpen] = useState(false);

  const topLinks = isSales ? salesTopLinks : adminTopLinks;
  const navSections = useMemo(() => (isSales ? [] : adminNavSections), [isSales]);

  const [openSections, setOpenSections] = useState(() => {
    const activeId = getActiveSectionId(adminNavSections, location.pathname);
    return Object.fromEntries(
      adminNavSections.map((s) => [s.id, !activeId || s.id === activeId])
    );
  });

  useEffect(() => {
    const activeId = getActiveSectionId(navSections, location.pathname);
    if (!activeId) return;
    setOpenSections((prev) => (prev[activeId] ? prev : { ...prev, [activeId]: true }));
  }, [location.pathname, navSections]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const closeMenu = () => setMenuOpen(false);
  const roleLabel = role === 'sales' ? 'Sales' : 'Admin';

  const NavContent = () => (
    <>
      <div className="flex items-center gap-3 px-4 py-6 border-b border-primary-100">
        <BrandLogo className="w-10 h-10" />
        <div>
          <h1 className="font-bold text-primary-700 text-lg leading-tight">JSR</h1>
          <p className="text-xs text-primary-400">{roleLabel}</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-3 overflow-y-auto">
        <div className="space-y-0.5">
          {topLinks.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={closeMenu}
              className={({ isActive }) => linkClass(isActive)}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </div>

        {navSections.map((section) => {
          const isOpen = !!openSections[section.id];
          const sectionActive = section.items.some((item) =>
            pathMatches(item.to, location.pathname)
          );

          return (
            <div key={section.id} className="space-y-0.5">
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide transition ${
                  sectionActive
                    ? 'text-primary-700'
                    : 'text-primary-400 hover:text-primary-600 hover:bg-primary-50/80'
                }`}
                aria-expanded={isOpen}
              >
                <span>{section.label}</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {isOpen && (
                <div className="space-y-0.5 pl-0.5">
                  {section.items.map(({ to, icon: Icon, label }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={closeMenu}
                      className={({ isActive }) => linkClass(isActive)}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      {label}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-primary-100">
        <p className="text-xs text-primary-400 px-2 mb-2 truncate">{user?.email}</p>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-500/90 hover:bg-red-50/60 font-medium transition"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>
    </>
  );

  const topOffset = isElectron ? '2.5rem' : '0';

  return (
    <div className="min-h-screen flex bg-cream">
      <aside
        className="hidden lg:flex lg:flex-col lg:w-64 bg-surface border-r border-primary-100 fixed z-30"
        style={{ top: topOffset, bottom: 0 }}
      >
        <NavContent />
      </aside>

      <div
        className="lg:hidden fixed left-0 right-0 z-40 bg-surface border-b border-primary-100 px-4 py-3 flex items-center justify-between"
        style={{ top: topOffset }}
      >
        <div className="flex items-center gap-2">
          <BrandLogo className="w-8 h-8" />
          <span className="font-bold text-primary-700">JSR</span>
        </div>
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 rounded-lg hover:bg-primary-50 text-primary-700"
          aria-label="Toggle menu"
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/20 z-40" onClick={closeMenu} />
          <aside
            className="lg:hidden fixed left-0 bottom-0 w-72 bg-surface z-50 flex flex-col shadow-xl"
            style={{ top: topOffset }}
          >
            <NavContent />
          </aside>
        </>
      )}

      <main className="flex-1 lg:ml-64 pt-16 lg:pt-0">
        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
