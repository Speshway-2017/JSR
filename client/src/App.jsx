import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import RoleRoute from './components/RoleRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Vendors from './pages/Vendors';
import VendorDetail from './pages/VendorDetail';
import VendorBill from './pages/VendorBill';
import LoadBill from './pages/LoadBill';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Sell from './pages/Sell';
import Materials from './pages/Materials';
import PriceSettings from './pages/PriceSettings';
import ShortcutSettings from './pages/ShortcutSettings';
import WhatsAppSettings from './pages/WhatsAppSettings';
import Transactions from './pages/Transactions';
import InventoryHistory from './pages/InventoryHistory';
import SalesReport from './pages/SalesReport';
import SalesReport2 from './pages/SalesReport2';
import CashSalesReport from './pages/CashSalesReport';
import CashChecklist from './pages/CashChecklist';
import LessChecklist from './pages/LessChecklist';
import HamaliReport from './pages/HamaliReport';
import Ledger from './pages/Ledger';
import Outstanding from './pages/Outstanding';
import BillPrint from './pages/BillPrint';
import SalesPrint from './pages/SalesPrint';
import SalesOrders, { SalesBagReportsList } from './pages/SalesOrders';
import SalesMaterials from './pages/SalesMaterials';
import Schedules from './pages/Schedules';
import CashEntry from './pages/CashEntry';
import SalePatty from './pages/SalePatty';
import Purchase from './pages/Purchase';
import { useAuth, homePathForRole } from './context/AuthContext';

function HomeRedirect() {
  const { role } = useAuth();
  return <Navigate to={homePathForRole(role)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<PrivateRoute />}>
        <Route path="/" element={<HomeRedirect />} />

        <Route element={<RoleRoute roles={['sales']} />}>
          <Route path="/sales-orders" element={<SalesOrders />} />
          <Route path="/sales-orders/previous" element={<SalesBagReportsList />} />
          <Route path="/sales-orders/:id" element={<SalesOrders />} />
          <Route path="/sales-materials" element={<SalesMaterials />} />
        </Route>

        <Route element={<RoleRoute roles={['admin']} />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/vendors/:id" element={<VendorDetail />} />
          <Route path="/vendors/:id/bill" element={<VendorBill />} />
          <Route path="/loads/:loadId/bill" element={<LoadBill />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/schedules" element={<Schedules />} />
          <Route path="/cash-entry" element={<CashEntry />} />
          <Route path="/purchase" element={<Purchase />} />
          <Route path="/sale-patty" element={<SalePatty />} />
          <Route path="/loads" element={<Navigate to="/sell" replace />} />
          <Route path="/sell" element={<Sell />} />
          <Route path="/materials" element={<Materials />} />
          <Route path="/settings" element={<PriceSettings />} />
          <Route path="/shortcuts" element={<ShortcutSettings />} />
          <Route path="/whatsapp-settings" element={<WhatsAppSettings />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/inventory" element={<InventoryHistory />} />
          <Route path="/ledger" element={<Ledger />} />
          <Route path="/outstanding" element={<Outstanding />} />
          <Route path="/bill-print" element={<BillPrint />} />
          <Route path="/sales-print" element={<SalesPrint />} />
          <Route path="/sales-report" element={<SalesReport />} />
          <Route path="/sales-report-2" element={<SalesReport2 />} />
          <Route path="/cash-sales-report" element={<CashSalesReport />} />
          <Route path="/cash-checklist" element={<CashChecklist />} />
          <Route path="/less-checklist" element={<LessChecklist />} />
          <Route path="/hamali-report" element={<HamaliReport />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
