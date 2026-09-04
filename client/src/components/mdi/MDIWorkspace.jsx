import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useMDI, isPathAllowedForRole } from '../../context/MDIContext';
import { useAuth } from '../../context/AuthContext';
import MDIWindow from './MDIWindow';
import MDIWindowTaskbar from './MDIWindowTaskbar';
import MDITaskSwitcherOverlay from './MDITaskSwitcherOverlay';
import Dashboard from '../../pages/Dashboard';
import Customers from '../../pages/Customers';
import CustomerDetail from '../../pages/CustomerDetail';
import Vendors from '../../pages/Vendors';
import VendorDetail from '../../pages/VendorDetail';
import Materials from '../../pages/Materials';
import Schedules from '../../pages/Schedules';
import CashEntry from '../../pages/CashEntry';
import Sell from '../../pages/Sell';
import Purchase from '../../pages/Purchase';
import SalePatty from '../../pages/SalePatty';
import Transactions from '../../pages/Transactions';
import InventoryHistory from '../../pages/InventoryHistory';
import Ledger from '../../pages/Ledger';
import Outstanding from '../../pages/Outstanding';
import BillPrint from '../../pages/BillPrint';
import SalesPrint from '../../pages/SalesPrint';
import SalesReport from '../../pages/SalesReport';
import SalesReport2 from '../../pages/SalesReport2';
import CashChecklist from '../../pages/CashChecklist';
import LessChecklist from '../../pages/LessChecklist';
import HamaliReport from '../../pages/HamaliReport';
import PriceSettings from '../../pages/PriceSettings';
import ShortcutSettings from '../../pages/ShortcutSettings';
import WhatsAppSettings from '../../pages/WhatsAppSettings';
import SalesOrders, { SalesBagReportsList } from '../../pages/SalesOrders';
import SalesMaterials from '../../pages/SalesMaterials';

function renderModuleComponent(path) {
  if (!path) return <Dashboard />;
  if (path.startsWith('/customers/')) return <CustomerDetail path={path} />;
  if (path.startsWith('/vendors/')) return <VendorDetail path={path} />;
  if (path.startsWith('/sales-orders/') && path !== '/sales-orders/previous') return <SalesOrders path={path} />;

  const basePath = path.split('?')[0];

  switch (basePath) {
    case '/customers':
      return <Customers path={path} />;
    case '/vendors':
      return <Vendors path={path} />;
    case '/materials':
      return <Materials path={path} />;
    case '/schedules':
      return <Schedules path={path} />;
    case '/cash-entry':
      return <CashEntry path={path} />;
    case '/sell':
      return <Sell path={path} />;
    case '/purchase':
      return <Purchase path={path} />;
    case '/sale-patty':
      return <SalePatty path={path} />;
    case '/transactions':
      return <Transactions path={path} />;
    case '/inventory':
      return <InventoryHistory path={path} />;
    case '/ledger':
      return <Ledger path={path} />;
    case '/outstanding':
      return <Outstanding path={path} />;
    case '/bill-print':
      return <BillPrint path={path} />;
    case '/sales-print':
      return <SalesPrint path={path} />;
    case '/sales-report':
      return <SalesReport path={path} />;
    case '/sales-report-2':
      return <SalesReport2 path={path} />;
    case '/cash-checklist':
      return <CashChecklist path={path} />;
    case '/less-checklist':
      return <LessChecklist path={path} />;
    case '/hamali-report':
      return <HamaliReport path={path} />;
    case '/settings':
      return <PriceSettings path={path} />;
    case '/shortcuts':
      return <ShortcutSettings path={path} />;
    case '/whatsapp-settings':
      return <WhatsAppSettings path={path} />;
    case '/sales-orders':
      return <SalesOrders path={path} />;
    case '/sales-materials':
      return <SalesMaterials path={path} />;
    case '/sales-orders/previous':
      return <SalesBagReportsList path={path} />;
    default:
      return <Dashboard />;
  }
}

export default function MDIWorkspace({ fallbackChildren }) {
  const { windows, confirmCloseId, cancelCloseModal, confirmCloseModal } = useMDI();
  const { role } = useAuth();

  const visibleWindows = windows.filter((win) => isPathAllowedForRole(win.path, role));

  return (
    <div className="flex-1 min-h-0 flex flex-col relative overflow-hidden bg-cream">
      {/* MDI Workspace Container */}
      <div className="flex-1 min-h-0 relative overflow-hidden w-full">
        {/* Base Persistent Background Dashboard */}
        <div className="absolute inset-0 overflow-y-auto p-4 md:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <Dashboard />
        </div>

        {/* Floating Internal Windows */}
        {visibleWindows.map((win) => (
          <MDIWindow key={win.id} windowItem={win}>
            {renderModuleComponent(win.path)}
          </MDIWindow>
        ))}
      </div>

      {/* Bottom Taskbar Strip for Open/Minimized Module Windows */}
      <MDIWindowTaskbar />

      {/* Windows Alt+Tab / Ctrl+Tab Live Task Switcher Preview Overlay */}
      <MDITaskSwitcherOverlay />

      {/* Unsaved Changes Confirmation Modal */}
      {confirmCloseId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-[1px]">
          <div className="card w-full max-w-sm space-y-4 shadow-xl border border-primary-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-50 text-amber-600">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-primary-800">Unsaved Changes</h2>
              </div>
              <button
                type="button"
                onClick={cancelCloseModal}
                className="p-1.5 rounded-lg hover:bg-primary-50 text-primary-500"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-primary-600 leading-relaxed">
              You have unsaved changes in this module. Are you sure you want to close?
            </p>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={cancelCloseModal}
                className="btn-secondary flex-1 !py-2.5 !text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCloseModal}
                className="btn-primary flex-1 !py-2.5 !text-sm !bg-amber-600 hover:!bg-amber-700"
              >
                Close Module
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
