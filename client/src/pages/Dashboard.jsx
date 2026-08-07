import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserRound, Truck, ShoppingCart, IndianRupee, ArrowRight } from 'lucide-react';
import api from '../api';
import { formatCurrency } from '../utils/format';

export default function Dashboard() {
  const [stats, setStats] = useState({
    vendors: 0,
    customers: 0,
    loads: 0,
    sales: 0,
    vendorPayable: 0,
    customerCredit: 0,
  });
  const [recentLoads, setRecentLoads] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/vendors'),
      api.get('/customers'),
      api.get('/loads'),
      api.get('/sales'),
    ])
      .then(([vendorsRes, customersRes, loadsRes, salesRes]) => {
        const vendors = vendorsRes.data;
        const customers = customersRes.data;
        const loads = loadsRes.data;
        const sales = salesRes.data;

        setStats({
          vendors: vendors.length,
          customers: customers.length,
          loads: loads.length,
          sales: sales.length,
          vendorPayable: vendors.reduce((sum, v) => sum + (v.creditBalance || 0), 0),
          customerCredit: customers.reduce((sum, c) => sum + (c.creditBalance || 0), 0),
        });
        setRecentLoads(loads.slice(0, 5));
      })
      .finally(() => setLoading(false));
  }, []);

  const cards = [
    { label: 'Vendors', value: stats.vendors, icon: Users, color: 'bg-primary-100 text-primary-700', link: '/vendors' },
    { label: 'Customers', value: stats.customers, icon: UserRound, color: 'bg-primary-50 text-primary-600', link: '/customers' },
    { label: 'Loads', value: stats.loads, icon: Truck, color: 'bg-accent-100 text-accent-600', link: '/loads' },
    { label: 'Sales', value: stats.sales, icon: ShoppingCart, color: 'bg-primary-200 text-primary-800', link: '/sell' },
    { label: 'Vendor Payable', value: formatCurrency(stats.vendorPayable), icon: IndianRupee, color: 'bg-accent-50 text-accent-700', link: '/vendors' },
    { label: 'Customer Credit', value: formatCurrency(stats.customerCredit), icon: IndianRupee, color: 'bg-primary-100 text-primary-700', link: '/customers' },
  ];

  const actions = [
    { label: 'Add Load', desc: 'Vendor brings stock', link: '/loads' },
    { label: 'Sell to Customer', desc: 'Bags + rate on credit', link: '/sell' },
    { label: 'Add Customer', desc: 'Name, state & city', link: '/customers' },
    { label: 'Price Settings', desc: 'Labour, aaseelu, bill, union', link: '/settings' },
  ];

  if (loading) {
    return <div className="animate-pulse text-primary-500 py-20 text-center">Loading dashboard...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-primary-400 text-sm mt-0.5">Admin overview</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map(({ label, value, icon: Icon, color, link }) => (
          <Link key={label} to={link} className="card hover:border-primary-200 transition">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <p className="text-xs text-primary-400 mt-3">{label}</p>
            <p className="text-xl font-bold text-primary-700 mt-0.5">{value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-lg font-bold text-primary-700 mb-3">Quick Actions</h2>
          <div className="space-y-2">
            {actions.map(({ label, desc, link }) => (
              <Link
                key={label}
                to={link}
                className="flex items-center justify-between p-3 rounded-xl hover:bg-primary-50 transition group"
              >
                <div>
                  <p className="font-semibold text-primary-700 group-hover:text-primary-600">{label}</p>
                  <p className="text-xs text-primary-400">{desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-primary-300" />
              </Link>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-lg font-bold text-primary-700 mb-3">Recent Loads</h2>
          {recentLoads.length === 0 ? (
            <p className="text-primary-400 text-sm py-6 text-center">No loads yet</p>
          ) : (
            <div className="space-y-2">
              {recentLoads.map((load) => (
                <Link
                  key={load._id}
                  to={`/vendors/${load.vendor?._id || load.vendor}`}
                  className="flex justify-between p-3 rounded-xl hover:bg-primary-50"
                >
                  <div>
                    <p className="font-semibold text-primary-700">{load.vendor?.name}</p>
                    <p className="text-xs text-primary-400">
                      {load.materials?.map((m) => m.materialName).join(', ')}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-primary-600">{Number(load.totalWeight).toFixed(1)} kg</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
