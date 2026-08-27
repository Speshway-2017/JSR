import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDateOnly } from '../utils/format';
import { matchesSearchFields } from '../utils/search';
import { useDataRestored } from '../utils/useDataRestored';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function Ledger() {
  const navigate = useNavigate();
  const today = todayInputValue();
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchCustomers = useCallback(() => {
    api
      .get('/customers')
      .then((res) => setCustomers(res.data))
      .catch(() => toast.error('Failed to load customers'));
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const suggestions = useMemo(() => {
    if (!nameQuery.trim()) return [];
    return customers
      .filter((c) => matchesSearchFields(c, ['name', 'nameTelugu', 'mobile'], nameQuery))
      .slice(0, 10);
  }, [customers, nameQuery]);

  const selected = customers.find((c) => c._id === customerId);

  const loadLedger = useCallback(async (e) => {
    e?.preventDefault?.();
    if (!customerId) {
      if (e) toast.error('Select a customer');
      return;
    }
    if (startDate > endDate) {
      if (e) toast.error('Start date must be before end date');
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/reports/ledger', {
        params: { customerId, startDate, endDate },
      });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load ledger');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [customerId, startDate, endDate]);

  useEffect(() => {
    if (customerId && startDate <= endDate) {
      loadLedger();
    }
  }, [customerId, startDate, endDate, loadLedger]);

  const reloadAll = useCallback(() => {
    fetchCustomers();
    if (customerId) loadLedger();
  }, [fetchCustomers, customerId, loadLedger]);

  useDataRestored(reloadAll);

  const openEntry = (row) => {
    const d = new Date(row.date).toISOString().slice(0, 10);
    const params = new URLSearchParams({ date: d, customerId });
    if (row.saleId) params.set('saleId', row.saleId);
    navigate(`/sell?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Ledger</h1>
        <p className="text-primary-400 text-sm mt-0.5">
          Customer transactions — sales, cash received, and less (record only)
        </p>
      </div>

      <form onSubmit={loadLedger} className="card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <label className="label">Customer *</label>
            <input
              className="input-field"
              value={nameQuery}
              onChange={(e) => {
                setNameQuery(e.target.value);
                setCustomerId('');
              }}
              placeholder="Type to search…"
              autoComplete="off"
            />
            {!customerId && suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-xl border border-primary-200 bg-surface shadow-card">
                {suggestions.map((c) => (
                  <li key={c._id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-primary-50"
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        setCustomerId(c._id);
                        setNameQuery(c.name);
                      }}
                    >
                      {c.name}
                      {c.schedule?.name ? (
                        <span className="text-xs text-primary-400"> · {c.schedule.name}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected ? (
              <p className="text-xs text-primary-400 mt-1">
                {selected.schedule?.name || 'No schedule'} · Balance{' '}
                {formatCurrency(selected.creditBalance)}
              </p>
            ) : null}
          </div>
          <div>
            <label className="label">From *</label>
            <input
              type="date"
              className="input-field"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">To *</label>
            <input
              type="date"
              className="input-field"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>
        <button type="submit" className="btn-primary" disabled={loading}>
          <BookOpen className="w-4 h-4" />
          {loading ? 'Loading…' : 'Show ledger'}
        </button>
      </form>

      {data && (
        <div className="card !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-primary-100">
            <p className="font-bold text-primary-800">{data.customer.name}</p>
            <p className="text-xs text-primary-400">
              {formatDateOnly(data.startDate)} — {formatDateOnly(data.endDate)}
            </p>
          </div>
          <div className="px-4 py-2.5 bg-primary-50/80 border-b border-primary-100 flex items-center justify-between gap-3 text-sm">
            <span className="text-primary-500">Opening</span>
            <span className="font-semibold text-primary-800 tabular-nums">
              {formatCurrency(data.openingBalance)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-50 text-left text-primary-600">
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Particulars</th>
                  <th className="px-3 py-2 font-semibold text-right">Sale</th>
                  <th className="px-3 py-2 font-semibold text-right">Paid</th>
                  <th className="px-3 py-2 font-semibold text-right">Less</th>
                  <th className="px-3 py-2 font-semibold text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-primary-400">
                      No transactions in this range
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-primary-50 hover:bg-primary-50/80 cursor-pointer"
                      onClick={() => openEntry(row)}
                      title="Open sales bill for this date"
                    >
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateOnly(row.date)}</td>
                      <td className="px-3 py-2 text-primary-700">{row.particulars}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.sale ? formatCurrency(row.sale) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.paid ? formatCurrency(row.paid) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-primary-400">
                        {row.less ? formatCurrency(row.less) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatCurrency(row.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-accent-50 border-t border-primary-100 font-semibold">
                  <td className="px-3 py-3" colSpan={2}>
                    Total
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatCurrency(data.totals.sale)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {formatCurrency(data.totals.paid)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-primary-500">
                    {formatCurrency(data.totals.less)}
                    <span className="block text-[10px] font-normal text-primary-400">
                      record only
                    </span>
                  </td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-4 py-2.5 bg-accent-50 border-t border-primary-100 flex items-center justify-between gap-3 text-sm">
            <span className="text-primary-500">Closing</span>
            <span className="font-semibold text-accent-700 tabular-nums">
              {formatCurrency(data.closingBalance)}
            </span>
          </div>
          <p className="px-4 py-2 text-xs text-primary-400">
            Less is shown as a record and is not included in total paid. Click a row to open that
            day’s sales bill.
          </p>
        </div>
      )}
    </div>
  );
}
