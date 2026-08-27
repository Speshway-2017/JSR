import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserRound,
  ShoppingCart,
  IndianRupee,
  Package,
  Warehouse,
  ArrowRight,
  FileText,
  TrendingUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import api from '../api';
import { formatCurrency, formatDate, formatKg } from '../utils/format';
import { useDataRestored } from '../utils/useDataRestored';

const COLORS = {
  primary: '#637d6c',
  primaryDark: '#425448',
  primaryLight: '#a8bdb0',
  accent: '#9f8668',
  accentLight: '#cfbea3',
  grid: '#e6ede8',
  text: '#506658',
  muted: '#7f9a88',
};

const piePalette = ['#637d6c', '#9f8668', '#7f9a88', '#b8a082', '#a8bdb0', '#cfbea3', '#506658', '#856f55'];

function ChartTooltip({ active, payload, label, valuePrefix = '₹' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-primary-100 bg-surface px-3 py-2 shadow-card text-sm">
      {label && <p className="text-xs text-primary-400 mb-1">{label}</p>}
      {payload.map((entry) => (
        <p key={entry.dataKey || entry.name} className="font-semibold text-primary-700">
          <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ background: entry.color }} />
          {entry.name}: {valuePrefix}
          {Number(entry.value || 0).toLocaleString('en-IN')}
        </p>
      ))}
    </div>
  );
}

function EmptyChart({ message = 'No data yet' }) {
  return (
    <div className="h-56 flex items-center justify-center text-sm text-primary-400">{message}</div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(() => {
    setLoading(true);
    api
      .get('/dashboard/overview')
      .then((res) => setData(res.data))
      .catch((err) => setError(err.response?.data?.message || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useDataRestored(loadOverview);

  if (loading) {
    return <div className="animate-pulse text-primary-500 py-20 text-center">Loading business overview...</div>;
  }

  if (error || !data) {
    return <div className="text-red-500/90 py-20 text-center">{error || 'No data'}</div>;
  }

  const { summary, salesTrend, topMaterials, topCustomers, topVendors, inventory, payables, recentSales } =
    data;

  const cards = [
    {
      label: 'Vendors',
      value: summary.vendors,
      icon: Users,
      color: 'bg-primary-100 text-primary-700',
      link: '/vendors',
    },
    {
      label: 'Customers',
      value: summary.customers,
      icon: UserRound,
      color: 'bg-primary-50 text-primary-600',
      link: '/customers',
    },
    {
      label: 'Sales today',
      value: summary.salesToday,
      sub: formatCurrency(summary.salesTodayAmount),
      icon: ShoppingCart,
      color: 'bg-primary-200 text-primary-800',
      link: '/sell',
    },
    {
      label: 'Month sales',
      value: formatCurrency(summary.salesMonthAmount),
      sub: formatKg(summary.salesMonthKg),
      icon: TrendingUp,
      color: 'bg-accent-50 text-accent-700',
      link: '/sales-report',
    },
    {
      label: 'Inventory',
      value: formatKg(summary.inventoryKg),
      sub: `${summary.materials} products`,
      icon: Warehouse,
      color: 'bg-primary-100 text-primary-700',
      link: '/inventory',
    },
    {
      label: 'Vendor payable',
      value: formatCurrency(summary.vendorPayable),
      icon: IndianRupee,
      color: 'bg-accent-100 text-accent-700',
      link: '/vendors',
    },
    {
      label: 'Customer credit',
      value: formatCurrency(summary.customerCredit),
      icon: IndianRupee,
      color: 'bg-primary-100 text-primary-700',
      link: '/customers',
    },
    {
      label: 'Month purchases',
      value: formatCurrency(summary.purchasesMonthAmount),
      sub: formatKg(summary.purchasesMonthKg),
      icon: Package,
      color: 'bg-primary-50 text-primary-600',
      link: '/purchase',
    },
  ];

  const actions = [
    { label: 'Sell to Customer', desc: 'Bags + rate on credit', link: '/sell' },
    { label: 'Sale Patty', desc: 'Vendor day bill from sales', link: '/sale-patty' },
    { label: 'Purchase', desc: 'Record vendor purchase', link: '/purchase' },
    { label: 'Inventory History', desc: 'Incoming stock trail', link: '/inventory' },
  ];

  const hasTrend = salesTrend.some((d) => d.sales > 0 || d.purchases > 0);
  const payableTotal = payables.reduce((s, p) => s + (p.value || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Business Overview</h1>
          <p className="text-primary-400 text-sm mt-0.5">
            Vendors, customers, sales, purchases & inventory at a glance
          </p>
        </div>
        <p className="text-xs text-primary-400">Last 14 days charts · Month totals in cards</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ label, value, sub, icon: Icon, color, link }) => (
          <Link key={label} to={link} className="card hover:border-primary-200 transition !p-4">
            <div className="flex items-start justify-between gap-2">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xs text-primary-400 mt-3">{label}</p>
            <p className="text-lg font-bold text-primary-700 mt-0.5 leading-tight">{value}</p>
            {sub && <p className="text-[11px] text-primary-400 mt-0.5">{sub}</p>}
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="card xl:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-primary-700">Sales vs Purchases</h2>
            <span className="text-xs text-primary-400">₹ by day</span>
          </div>
          {!hasTrend ? (
            <EmptyChart message="No sales or purchases in the last 14 days" />
          ) : (
            <div className="h-64 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesTrend} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="purchaseFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: COLORS.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: COLORS.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: COLORS.text }} />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    name="Sales"
                    stroke={COLORS.primary}
                    fill="url(#salesFill)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="purchases"
                    name="Purchases"
                    stroke={COLORS.accent}
                    fill="url(#purchaseFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-lg font-bold text-primary-700 mb-1">Receivables balance</h2>
          <p className="text-xs text-primary-400 mb-2">Vendor payable vs customer credit</p>
          {payableTotal <= 0 ? (
            <EmptyChart message="No outstanding balances" />
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={payables.filter((p) => p.value > 0)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={3}
                  >
                    {payables
                      .filter((p) => p.value > 0)
                      .map((entry) => (
                        <Cell key={entry.name} fill={entry.fill} />
                      ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-primary-700">Top materials sold</h2>
            <span className="text-xs text-primary-400">14 days · ₹</span>
          </div>
          {topMaterials.length === 0 ? (
            <EmptyChart />
          ) : (
            <div className="h-64 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topMaterials} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: COLORS.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={88}
                    tick={{ fill: COLORS.text, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="amount" name="Sales" radius={[0, 8, 8, 0]} barSize={16}>
                    {topMaterials.map((_, i) => (
                      <Cell key={i} fill={piePalette[i % piePalette.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-primary-700">Inventory on hand</h2>
            <Link to="/inventory" className="text-xs font-medium text-primary-500 hover:text-primary-700">
              History →
            </Link>
          </div>
          {inventory.length === 0 ? (
            <EmptyChart message="No stock remaining in load materials" />
          ) : (
            <div className="h-64 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inventory} margin={{ top: 8, right: 8, left: 0, bottom: 28 }}>
                  <CartesianGrid stroke={COLORS.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: COLORS.muted, fontSize: 10 }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis
                    tick={{ fill: COLORS.muted, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    tickFormatter={(v) => `${v}`}
                  />
                  <Tooltip content={<ChartTooltip valuePrefix="" />} />
                  <Bar dataKey="availableKg" name="Available kg" fill={COLORS.primary} radius={[8, 8, 0, 0]} barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-lg font-bold text-primary-700 mb-1">Top customers</h2>
          <p className="text-xs text-primary-400 mb-3">By sales amount · last 14 days</p>
          {topCustomers.length === 0 ? (
            <p className="text-primary-400 text-sm py-8 text-center">No customer sales yet</p>
          ) : (
            <div className="space-y-2">
              {topCustomers.map((c, i) => {
                const max = topCustomers[0]?.amount || 1;
                const pct = Math.max(6, Math.round((c.amount / max) * 100));
                return (
                  <Link
                    key={c.id}
                    to={`/customers/${c.id}`}
                    className="block p-2.5 rounded-xl hover:bg-primary-50 transition"
                  >
                    <div className="flex justify-between gap-2 text-sm mb-1.5">
                      <span className="font-semibold text-primary-700 truncate">
                        {i + 1}. {c.name}
                      </span>
                      <span className="font-bold text-accent-600 shrink-0">{formatCurrency(c.amount)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-primary-50 overflow-hidden">
                      <div className="h-full rounded-full bg-primary-400" style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-lg font-bold text-primary-700 mb-1">Top vendors</h2>
          <p className="text-xs text-primary-400 mb-3">By sales through vendor · last 14 days</p>
          {topVendors.length === 0 ? (
            <p className="text-primary-400 text-sm py-8 text-center">No vendor sales yet</p>
          ) : (
            <div className="space-y-2">
              {topVendors.map((v, i) => {
                const max = topVendors[0]?.amount || 1;
                const pct = Math.max(6, Math.round((v.amount / max) * 100));
                return (
                  <Link
                    key={v.id}
                    to={`/vendors/${v.id}`}
                    className="block p-2.5 rounded-xl hover:bg-primary-50 transition"
                  >
                    <div className="flex justify-between gap-2 text-sm mb-1.5">
                      <span className="font-semibold text-primary-700 truncate">
                        {i + 1}. {v.name}
                      </span>
                      <span className="font-bold text-primary-600 shrink-0">{formatCurrency(v.amount)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-primary-50 overflow-hidden">
                      <div className="h-full rounded-full bg-accent-400" style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-primary-700">Recent Sales</h2>
            <Link to="/sales-report" className="text-xs font-medium text-primary-500 hover:text-primary-700">
              Sales report →
            </Link>
          </div>
          {recentSales.length === 0 ? (
            <p className="text-primary-400 text-sm py-6 text-center">No sales yet</p>
          ) : (
            <div className="space-y-2">
              {recentSales.map((sale) => (
                <Link
                  key={sale._id}
                  to={`/customers/${sale.customer?._id || sale.customer}`}
                  className="flex justify-between items-center gap-3 p-3 rounded-xl hover:bg-primary-50"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-primary-700 truncate">
                      {sale.customer?.name || 'Customer'}
                    </p>
                    <p className="text-xs text-primary-400 truncate">
                      {sale.vendor?.name ? `${sale.vendor.name} · ` : ''}
                      {formatDate(sale.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <FileText className="w-3.5 h-3.5 text-primary-300" />
                    <p className="font-bold text-accent-600 text-sm">{formatCurrency(sale.totalAmount)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
