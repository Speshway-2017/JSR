import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDateOnly } from '../utils/format';
import { matchesSearchFields } from '../utils/search';
import { useDataRestored } from '../utils/useDataRestored';
import { useMDI } from '../context/MDIContext';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function Ledger() {
  const { openWindow } = useMDI();
  const today = todayInputValue();
  const [partyType, setPartyType] = useState('customer'); // 'customer' | 'vendor'
  const [parties, setParties] = useState([]);
  const [partyId, setPartyId] = useState('');
  const [nameQuery, setNameQuery] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchParties = useCallback(() => {
    const endpoint = partyType === 'vendor' ? '/vendors' : '/customers';
    api
      .get(endpoint)
      .then((res) => setParties(res.data))
      .catch(() => toast.error(`Failed to load ${partyType}s`));
  }, [partyType]);

  useEffect(() => {
    setPartyId('');
    setNameQuery('');
    setData(null);
    fetchParties();
  }, [partyType, fetchParties]);

  const suggestions = useMemo(() => {
    if (!nameQuery.trim()) return [];
    return parties
      .filter((p) => matchesSearchFields(p, ['name', 'nameTelugu', 'mobile', 'city'], nameQuery))
      .slice(0, 10);
  }, [parties, nameQuery]);

  const [highlight, setHighlight] = useState(-1);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    setHighlight(-1);
  }, [nameQuery, suggestions]);

  useEffect(() => {
    if (!suggestOpen || highlight < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, suggestOpen]);

  const onNameKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setSuggestOpen(true);
      setHighlight((h) => (h < 0 ? 0 : Math.min(h + 1, suggestions.length - 1)));
      return;
    }
    if (e.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setSuggestOpen(true);
      setHighlight((h) => (h <= 0 ? 0 : h - 1));
      return;
    }
    if (e.key === 'Enter' && suggestOpen && suggestions.length > 0) {
      e.preventDefault();
      const p = suggestions[highlight >= 0 ? highlight : 0];
      if (p) {
        setPartyId(p._id);
        setNameQuery(p.name);
        setSuggestOpen(false);
        setHighlight(-1);
      }
      return;
    }
    if (e.key === 'Escape') {
      setSuggestOpen(false);
      setHighlight(-1);
    }
  };

  const selected = parties.find((p) => p._id === partyId);

  const loadLedger = useCallback(async (e) => {
    e?.preventDefault?.();
    if (!partyId) {
      if (e) toast.error(`Select a ${partyType}`);
      return;
    }
    if (startDate > endDate) {
      if (e) toast.error('Start date must be before end date');
      return;
    }
    setLoading(true);
    try {
      const params = { partyType, startDate, endDate };
      if (partyType === 'vendor') params.vendorId = partyId;
      else params.customerId = partyId;

      const res = await api.get('/reports/ledger', { params });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load ledger');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [partyId, partyType, startDate, endDate]);

  useEffect(() => {
    if (partyId && startDate <= endDate) {
      loadLedger();
    }
  }, [partyId, startDate, endDate, loadLedger]);

  const reloadAll = useCallback(() => {
    fetchParties();
    if (partyId) loadLedger();
  }, [fetchParties, partyId, loadLedger]);

  useDataRestored(reloadAll);

  useEffect(() => {
    const handleDataUpdated = () => {
      reloadAll();
    };
    window.addEventListener('jsr_data_updated', handleDataUpdated);
    return () => window.removeEventListener('jsr_data_updated', handleDataUpdated);
  }, [reloadAll]);

  const openEntry = (row) => {
    const d = new Date(row.date).toISOString().slice(0, 10);
    const params = new URLSearchParams({ date: d });
    if (partyType === 'vendor') params.set('vendorId', partyId);
    else params.set('customerId', partyId);

    if (row.saleId) {
      params.set('saleId', row.saleId);
      params.set('highlightSaleId', row.saleId);
    }
    openWindow({ path: `/sell?${params.toString()}`, title: 'Sales Entry' });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Ledger</h1>
        <p className="text-primary-400 text-sm mt-0.5">
          Customer & Vendor transactions — sales, cash received/paid, running balance
        </p>
      </div>

      <form onSubmit={loadLedger} className="card space-y-3">
        <div className="flex items-center gap-3 bg-primary-50/70 p-2 rounded-xl border border-primary-100 mb-2">
          <span className="text-xs font-semibold text-primary-600">Party Type:</span>
          <button
            type="button"
            onClick={() => setPartyType('customer')}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition ${
              partyType === 'customer'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-primary-600 hover:bg-primary-100'
            }`}
          >
            Customer
          </button>
          <button
            type="button"
            onClick={() => setPartyType('vendor')}
            className={`px-3 py-1 text-xs rounded-lg font-medium transition ${
              partyType === 'vendor'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-primary-600 hover:bg-primary-100'
            }`}
          >
            Vendor
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
            <label className="label">{partyType === 'vendor' ? 'Vendor *' : 'Customer *'}</label>
            <input
              className="input-field"
              value={nameQuery}
              onChange={(e) => {
                setNameQuery(e.target.value);
                setPartyId('');
                setSuggestOpen(true);
              }}
              onFocus={() => {
                if (nameQuery.trim()) setSuggestOpen(true);
              }}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              onKeyDown={onNameKeyDown}
              placeholder={`Search ${partyType === 'vendor' ? 'vendor' : 'customer'}…`}
              autoComplete="off"
            />
            {!partyId && suggestOpen && suggestions.length > 0 && (
              <ul
                ref={listRef}
                className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-xl border border-primary-200 bg-surface shadow-card"
              >
                {suggestions.map((p, idx) => (
                  <li key={p._id}>
                    <button
                      type="button"
                      data-idx={idx}
                      className={`w-full text-left px-3 py-2 text-sm transition ${
                        idx === highlight
                          ? 'bg-primary-100 font-semibold text-primary-900'
                          : 'hover:bg-primary-50 text-primary-800'
                      }`}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        setPartyId(p._id);
                        setNameQuery(p.name);
                        setSuggestOpen(false);
                        setHighlight(-1);
                      }}
                      onMouseEnter={() => setHighlight(idx)}
                    >
                      {p.name}
                      {p.city ? (
                        <span className="text-xs text-primary-400"> · {p.city}</span>
                      ) : p.schedule?.name ? (
                        <span className="text-xs text-primary-400"> · {p.schedule.name}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected ? (
              <p className="text-xs text-primary-400 mt-1">
                {selected.city || selected.schedule?.name || 'Party selected'} · Balance{' '}
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
                      className="border-t border-primary-50 hover:bg-primary-50/80 cursor-pointer transition-colors"
                      onClick={() => openEntry(row)}
                      onDoubleClick={() => openEntry(row)}
                      title="Double-click or click to open sale details in Sales"
                    >
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateOnly(row.date)}</td>
                      <td className="px-3 py-2 text-primary-700">{row.particulars}</td>
                      <td
                        className="px-3 py-2 text-right tabular-nums font-semibold text-primary-800 hover:text-accent-700 underline underline-offset-2 decoration-primary-200"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEntry(row);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          openEntry(row);
                        }}
                        title="Click or double-click sale to view and highlight in Sales"
                      >
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
