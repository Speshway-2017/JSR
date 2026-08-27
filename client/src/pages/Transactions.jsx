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
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Transaction History</h1>
        <p className="text-primary-400 text-sm mt-0.5">Customer & vendor credits and payments</p>
      </div>

      <div className="card !p-3 sm:!p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="w-4 h-4 text-primary-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              className="input-field !pl-9 !py-2 !text-sm"
              placeholder="Search by party or description…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 min-w-[140px] shrink-0">
            <label className="text-xs text-primary-400 shrink-0">Vendor</label>
            <select
              className="input-field !py-2 !text-sm flex-1"
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

          <div className="flex items-center gap-2 min-w-[140px] shrink-0">
            <label className="text-xs text-primary-400 shrink-0">Customer</label>
            <select
              className="input-field !py-2 !text-sm flex-1"
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

          <div className="flex items-center gap-2 min-w-[140px] shrink-0">
            <label className="text-xs text-primary-400 shrink-0">Type</label>
            <select
              className="input-field !py-2 !text-sm flex-1"
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

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-primary-400 text-sm">Loading transactions…</div>
        ) : filteredTransactions.length === 0 ? (
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
                {filteredTransactions.map((tx) => (
                  <tr key={tx._id} className="border-b border-primary-50 hover:bg-primary-50/30">
                    <td className="py-2.5 px-4 text-sm text-primary-600 whitespace-nowrap">{formatDate(tx.createdAt)}</td>
                    <td className="py-2.5 px-4">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${transactionTypeColors[tx.type] || 'bg-primary-100 text-primary-600'}`}>
                        {transactionTypeLabels[tx.type] || tx.type}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-sm text-primary-600">{partyName(tx)}</td>
                    <td className="py-2.5 px-4 text-sm text-primary-600 max-w-xs truncate">{tx.description}</td>
                    <td className="py-2.5 px-4 text-sm font-semibold text-primary-700 text-right whitespace-nowrap">
                      {tx.type?.includes('payment') ? '-' : '+'}{formatCurrency(tx.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {transactions.length >= limit && (
          <div className="p-3 text-center border-t border-primary-100 bg-primary-50/40">
            <button
              type="button"
              className="btn-secondary !py-1.5 !px-4 !text-xs"
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
