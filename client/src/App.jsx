import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Vendors from './pages/Vendors';
import VendorDetail from './pages/VendorDetail';
import VendorBill from './pages/VendorBill';
import LoadBill from './pages/LoadBill';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import AddLoad from './pages/AddLoad';
import Sell from './pages/Sell';
import Materials from './pages/Materials';
import PriceSettings from './pages/PriceSettings';
import Transactions from './pages/Transactions';
import InventoryHistory from './pages/InventoryHistory';
import SalesReport from './pages/SalesReport';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<PrivateRoute />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/vendors" element={<Vendors />} />
        <Route path="/vendors/:id" element={<VendorDetail />} />
        <Route path="/vendors/:id/bill" element={<VendorBill />} />
        <Route path="/loads/:loadId/bill" element={<LoadBill />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/customers/:id" element={<CustomerDetail />} />
        <Route path="/loads" element={<AddLoad />} />
        <Route path="/sell" element={<Sell />} />
        <Route path="/materials" element={<Materials />} />
        <Route path="/settings" element={<PriceSettings />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/inventory" element={<InventoryHistory />} />
        <Route path="/sales-report" element={<SalesReport />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
