import { useEffect, useState } from 'react';
import { Receipt } from 'lucide-react';
import api from '../api';
import { formatCurrency, formatDate } from '../utils/format';
import { transactionTypeColors, transactionTypeLabels } from '../utils/transactionTypes';

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [filter, setFilter] = useState({ vendorId: '', customerId: '', type: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/vendors'), api.get('/customers')]).then(([v, c]) => {
      setVendors(v.data);
      setCustomers(c.data);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.vendorId) params.set('vendorId', filter.vendorId);
    if (filter.customerId) params.set('customerId', filter.customerId);
    if (filter.type) params.set('type', filter.type);

    api
      .get(`/transactions?${params}`)
      .then((res) => setTransactions(res.data))
      .finally(() => setLoading(false));
  }, [filter]);

  const partyName = (tx) => tx.customer?.name || tx.vendor?.name || '—';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Transaction History</h1>
        <p className="text-primary-400 text-sm mt-0.5">Customer & vendor credits and payments</p>
      </div>

      <div className="card !p-3 sm:!p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 min-w-[140px] flex-1">
            <label className="text-xs text-primary-400 shrink-0">Vendor</label>
            <select
              className="input-field !py-2 !text-sm flex-1"
              value={filter.vendorId}
              onChange={(e) => setFilter({ ...filter, vendorId: e.target.value })}
            >
              <option value="">All</option>
              {vendors.map((v) => (
                <option key={v._id} value={v._id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 min-w-[140px] flex-1">
            <label className="text-xs text-primary-400 shrink-0">Customer</label>
            <select
              className="input-field !py-2 !text-sm flex-1"
              value={filter.customerId}
              onChange={(e) => setFilter({ ...filter, customerId: e.target.value })}
            >
              <option value="">All</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 min-w-[140px] flex-1">
            <label className="text-xs text-primary-400 shrink-0">Type</label>
            <select
              className="input-field !py-2 !text-sm flex-1"
              value={filter.type}
              onChange={(e) => setFilter({ ...filter, type: e.target.value })}
            >
              <option value="">All</option>
              <option value="customer_credit">Customer Credit</option>
              <option value="customer_payment">Customer Payment</option>
              <option value="vendor_credit">Vendor Credit</option>
              <option value="vendor_payment">Vendor Payment</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-primary-400 text-sm">Loading...</div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-12">
            <Receipt className="w-10 h-10 text-primary-300 mx-auto mb-2" />
            <p className="text-primary-400 text-sm">No transactions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-primary-50/80 border-b border-primary-100">
                  <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase">Date</th>
                  <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase">Type</th>
                  <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase">Party</th>
                  <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase">Description</th>
                  <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx._id} className="border-b border-primary-50">
                    <td className="py-2.5 px-4 text-sm text-primary-600 whitespace-nowrap">{formatDate(tx.createdAt)}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${transactionTypeColors[tx.type] || 'bg-primary-100 text-primary-600'}`}>
                        {transactionTypeLabels[tx.type] || tx.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-sm text-primary-600">{partyName(tx)}</td>
                    <td className="py-2.5 px-4 text-sm text-primary-600 max-w-xs truncate">{tx.description}</td>
                    <td className="py-2.5 px-4 text-sm font-semibold text-primary-700 text-right whitespace-nowrap">
                      {tx.type.includes('payment') ? '-' : '+'}{formatCurrency(tx.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
