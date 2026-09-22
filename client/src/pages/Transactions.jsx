import { useCallback, useEffect, useMemo, useState } from 'react';
import { Receipt, Search } from 'lucide-react';
import api from '../api';
import { formatCurrency, formatDate } from '../utils/format';
import { transactionTypeColors, transactionTypeLabels } from '../utils/transactionTypes';
import { matchesPrefix } from '../utils/search';
import { useDataRestored } from '../utils/useDataRestored';

export default function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [type, setType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [limit, setLimit] = useState(200);
  const [loading, setLoading] = useState(true);

  const fetchMasters = useCallback(() => {
    Promise.all([api.get('/vendors'), api.get('/customers')])
      .then(([v, c]) => {
        setVendors(v.data);
        setCustomers(c.data);
      })
      .catch(() => {});
  }, []);

  const fetchTransactions = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (vendorId) params.set('vendorId', vendorId);
    if (customerId) params.set('customerId', customerId);
    if (type) params.set('type', type);
    if (limit) params.set('limit', String(limit));

    api
      .get(`/transactions?${params}`)
      .then((res) => setTransactions(res.data || []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, [vendorId, customerId, type, limit]);

  useEffect(() => {
    fetchMasters();
  }, [fetchMasters]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const reloadAll = useCallback(() => {
    fetchMasters();
    fetchTransactions();
  }, [fetchMasters, fetchTransactions]);

  useDataRestored(reloadAll);

  const partyName = (tx) => tx.customer?.name || tx.vendor?.name || '—';

  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return transactions;
    const q = searchQuery.trim();
    return transactions.filter((tx) => {
      const pName = partyName(tx);
      const desc = tx.description || '';
      return matchesPrefix(pName, q) || matchesPrefix(desc, q);
    });
  }, [transactions, searchQuery]);

  return (
    <div className="space-y-2.5 max-w-3xl">
      <div>
        <h1 className="text-sm font-bold text-primary-800">Transaction History</h1>
        <p className="text-primary-400 text-[11px] mt-0.5">Customer & vendor credits and payments</p>
      </div>

      <div className="card !p-3 space-y-2.5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-primary-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            className="h-8 w-full rounded-lg border border-primary-200 bg-surface pl-8 pr-2.5 py-1 text-xs text-primary-700 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
            placeholder="Search by party or description…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div>
            <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">Vendor</label>
            <select
              className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">All Vendors</option>
              {vendors.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">Customer</label>
            <select
              className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">All Customers</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">Type</label>
            <select
              className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="customer_credit">Customer Credit</option>
              <option value="customer_payment">Customer Payment</option>
              <option value="vendor_credit">Vendor Credit</option>
              <option value="vendor_payment">Vendor Payment</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden border border-primary-200">
        {loading ? (
          <div className="text-center py-8 text-primary-400 text-xs">Loading transactions…</div>
        ) : filteredTransactions.length === 0 ? (
          <div className="text-center py-8">
            <Receipt className="w-8 h-8 text-primary-300 mx-auto mb-1.5" />
            <p className="text-primary-400 text-xs">No transactions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="bg-primary-50/80 border-b border-primary-200">
                  <th className="py-2 px-3 text-[10px] font-semibold text-primary-500 uppercase tracking-wide w-[140px]">Date</th>
                  <th className="py-2 px-3 text-[10px] font-semibold text-primary-500 uppercase tracking-wide w-[120px]">Type</th>
                  <th className="py-2 px-3 text-[10px] font-semibold text-primary-500 uppercase tracking-wide w-[120px]">Party</th>
                  <th className="py-2 px-3 text-[10px] font-semibold text-primary-500 uppercase tracking-wide">Description</th>
                  <th className="py-2 px-3 text-[10px] font-semibold text-primary-500 uppercase tracking-wide text-right w-[100px]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx._id} className="border-b border-primary-100 hover:bg-primary-50/40 transition">
                    <td className="py-2 px-3 text-xs text-primary-600 whitespace-nowrap">{formatDate(tx.createdAt)}</td>
                    <td className="py-2 px-3">
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${transactionTypeColors[tx.type] || 'bg-primary-100 text-primary-600'}`}>
                        {transactionTypeLabels[tx.type] || tx.type}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs font-semibold text-primary-800 truncate">{partyName(tx)}</td>
                    <td className="py-2 px-3 text-xs text-primary-500 truncate">{tx.description}</td>
                    <td className="py-2 px-3 text-xs font-bold text-primary-800 text-right whitespace-nowrap tabular-nums">
                      {tx.type?.includes('payment') ? '-' : '+'}{formatCurrency(tx.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {transactions.length >= limit && (
          <div className="px-3 py-2 text-center border-t border-primary-200 bg-surface">
            <button
              type="button"
              className="btn-secondary !py-1.5 !px-4 !text-xs font-semibold"
              onClick={() => setLimit((prev) => prev + 200)}
            >
              Load More Transactions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
