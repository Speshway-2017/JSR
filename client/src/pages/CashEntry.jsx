import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDate } from '../utils/format';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function CashEntry() {
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [entries, setEntries] = useState([]);
  const [nameQuery, setNameQuery] = useState('');
  const [partyType, setPartyType] = useState(''); // 'customer' | 'vendor'
  const [partyId, setPartyId] = useState('');
  const [entryDate, setEntryDate] = useState(todayInputValue());
  const [amount, setAmount] = useState('');
  const [less, setLess] = useState('');
  const [cashSide, setCashSide] = useState('credit');
  const [saving, setSaving] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listRef = useRef(null);

  const selectedParty = useMemo(() => {
    if (!partyId || !partyType) return null;
    if (partyType === 'customer') return customers.find((c) => c._id === partyId) || null;
    return vendors.find((v) => v._id === partyId) || null;
  }, [partyId, partyType, customers, vendors]);

  const suggestions = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return [];

    const custHits = customers
      .filter((c) => {
        const name = (c.name || '').toLowerCase();
        const te = (c.nameTelugu || '').toLowerCase();
        return name.includes(q) || te.includes(q);
      })
      .map((c) => ({
        id: c._id,
        kind: 'customer',
        name: c.name,
        nameTelugu: c.nameTelugu || '',
        creditBalance: c.creditBalance || 0,
        label: 'Customer',
      }));

    const vendorHits = vendors
      .filter((v) => {
        const name = (v.name || '').toLowerCase();
        const te = (v.nameTelugu || '').toLowerCase();
        const city = (v.city || '').toLowerCase();
        return name.includes(q) || te.includes(q) || city.includes(q);
      })
      .map((v) => ({
        id: v._id,
        kind: 'vendor',
        name: v.name,
        nameTelugu: v.nameTelugu || '',
        creditBalance: v.creditBalance || 0,
        label: 'Vendor',
      }));

    return [...custHits, ...vendorHits]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 10);
  }, [customers, vendors, nameQuery]);

  /** Less applies on the “payment” side: customer credit / vendor debit */
  const lessEnabled =
    (partyType === 'customer' && cashSide === 'credit') ||
    (partyType === 'vendor' && cashSide === 'debit') ||
    (!partyType && cashSide === 'credit');

  const remainingAfterAmount = selectedParty
    ? Math.max(0, Number(selectedParty.creditBalance || 0) - (Number(amount) || 0))
    : 0;

  const refresh = async () => {
    const [custRes, vendorRes, entryRes] = await Promise.all([
      api.get('/customers'),
      api.get('/vendors'),
      api.get('/transactions/cash-entries', { params: { date: entryDate } }),
    ]);
    setCustomers(custRes.data);
    setVendors(vendorRes.data);
    setEntries(entryRes.data);
  };

  useEffect(() => {
    refresh().catch(() => toast.error('Failed to load cash entry data'));
  }, []);

  useEffect(() => {
    api
      .get('/transactions/cash-entries', { params: { date: entryDate } })
      .then((res) => setEntries(res.data))
      .catch(() => {});
  }, [entryDate]);

  useEffect(() => {
    setHighlight(-1);
  }, [nameQuery, suggestions]);

  const pickParty = (item) => {
    setPartyType(item.kind);
    setPartyId(item.id);
    setNameQuery(item.name);
    // Auto type from party; user can still change Type manually after
    setCashSide(item.kind === 'vendor' ? 'debit' : 'credit');
    setSuggestOpen(false);
    setHighlight(-1);
  };

  const clearFormAmounts = () => {
    setAmount('');
    setLess('');
  };

  const fillLessWithRemaining = () => {
    if (!selectedParty) {
      toast.error('Select a name first');
      return;
    }
    setLess(String(remainingAfterAmount));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!partyId || !partyType) {
      toast.error('Type and select a customer or vendor from suggestions');
      return;
    }
    const mainAmount = Number(amount) || 0;
    const lessAmount = Number(less) || 0;

    if (lessEnabled) {
      if (mainAmount <= 0 && lessAmount <= 0) {
        toast.error('Enter amount or less');
        return;
      }
    } else if (mainAmount <= 0) {
      toast.error('Enter amount');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        partyType,
        amount: mainAmount,
        less: lessEnabled ? lessAmount : 0,
        cashSide,
        entryDate,
      };
      if (partyType === 'customer') payload.customerId = partyId;
      else payload.vendorId = partyId;

      const res = await api.post('/transactions/cash-entry', payload);
      const bal =
        partyType === 'customer'
          ? res.data.customer?.creditBalance
          : res.data.vendor?.creditBalance;
      toast.success(`Saved · Balance ${formatCurrency(bal ?? 0)}`);
      clearFormAmounts();
      setPartyId('');
      setPartyType('');
      setNameQuery('');
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save cash entry');
    } finally {
      setSaving(false);
    }
  };

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
      setHighlight((h) => (h <= 0 ? 0 : h - 1));
      return;
    }
    if (e.key === 'Enter' && suggestOpen && suggestions.length > 0) {
      e.preventDefault();
      pickParty(suggestions[highlight >= 0 ? highlight : 0]);
      return;
    }
    if (e.key === 'Escape') {
      setSuggestOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <div>
        <h1 className="page-title">Cash Entry</h1>
        <p className="text-primary-400 text-sm mt-0.5">
          Customer receipts (Credit) or vendor payments (Debit) — type can still be changed manually
        </p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Date *</label>
            <input
              type="date"
              className="input-field"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Type *</label>
            <select
              className="input-field"
              value={cashSide}
              onChange={(e) => setCashSide(e.target.value)}
            >
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <label className="label">Name *</label>
          <input
            className="input-field"
            value={nameQuery}
            placeholder="Type customer or vendor name…"
            autoComplete="off"
            onChange={(e) => {
              setNameQuery(e.target.value);
              setPartyId('');
              setPartyType('');
              setSuggestOpen(true);
            }}
            onFocus={() => {
              if (nameQuery.trim()) setSuggestOpen(true);
            }}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
            onKeyDown={onNameKeyDown}
            required
          />
          {suggestOpen && suggestions.length > 0 && (
            <ul
              ref={listRef}
              className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-primary-200 bg-surface shadow-card"
            >
              {suggestions.map((item, idx) => (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    className={`w-full text-left px-4 py-2.5 text-sm ${
                      idx === highlight
                        ? 'bg-primary-100 text-primary-900 font-medium'
                        : 'text-primary-700 hover:bg-primary-50'
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => pickParty(item)}
                  >
                    <span className="font-medium">{item.name}</span>
                    <span
                      className={`ml-2 text-[11px] font-semibold uppercase tracking-wide ${
                        item.kind === 'vendor' ? 'text-accent-600' : 'text-primary-500'
                      }`}
                    >
                      {item.label}
                    </span>
                    {item.nameTelugu ? (
                      <span className="text-primary-400 ml-2 text-xs">{item.nameTelugu}</span>
                    ) : null}
                    <span className="block text-xs text-primary-400 mt-0.5">
                      Balance {formatCurrency(item.creditBalance || 0)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedParty && (
          <div className="rounded-xl bg-primary-50 border border-primary-100 px-4 py-3 text-sm text-primary-700 flex flex-wrap items-center justify-between gap-2">
            <span>
              Selected:{' '}
              <strong>
                {selectedParty.name}
              </strong>
              <span className="text-primary-400">
                {' '}
                ({partyType === 'vendor' ? 'Vendor' : 'Customer'})
              </span>
              {' · '}
              Balance <strong>{formatCurrency(selectedParty.creditBalance || 0)}</strong>
            </span>
            {lessEnabled && remainingAfterAmount > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-primary-600 hover:text-primary-800"
                onClick={fillLessWithRemaining}
              >
                Fill Less with remaining ({formatCurrency(remainingAfterAmount)})
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Amount *</label>
            <input
              className="input-field"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            />
          </div>
          <div>
            <label className="label">Less</label>
            <input
              className="input-field"
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={less}
              onChange={(e) => setLess(e.target.value.replace(/[^\d.]/g, ''))}
              disabled={!lessEnabled}
            />
            <p className="text-xs text-primary-400 mt-1">
              Optional. Remaining balance also marked as paid (added with amount).
            </p>
          </div>
        </div>

        {lessEnabled && (Number(amount) > 0 || Number(less) > 0) && (
          <div className="flex items-center gap-2 rounded-lg bg-accent-100/80 text-accent-700 px-3 py-2 text-sm">
            <Banknote className="w-4 h-4 shrink-0" />
            Total paid:{' '}
            <strong>
              {formatCurrency((Number(amount) || 0) + (Number(less) || 0))}
            </strong>
          </div>
        )}

        <button type="submit" className="btn-primary w-full sm:w-auto sm:px-10" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-primary-100 font-semibold text-primary-700">
          Entries for {formatDate(entryDate)}
        </div>
        {entries.length === 0 ? (
          <p className="text-center py-10 text-primary-400 text-sm">No cash entries for this date</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-100 bg-primary-50/50">
                  <th className="text-left px-4 py-2.5 font-semibold text-primary-500">Name</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-primary-500">Detail</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-primary-500">Credit</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-primary-500">Debit</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-primary-500">Less</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((tx) => {
                  const isVendor = !!tx.vendor;
                  const isCredit = tx.cashSide === 'credit';
                  const lessAmt = Number(tx.lessAmount || 0);
                  const main = Math.max(0, Number(tx.amount || 0) - lessAmt);
                  const name = tx.customer?.name || tx.vendor?.name || '—';
                  return (
                    <tr key={tx._id} className="border-b border-primary-50">
                      <td className="px-4 py-2.5 font-medium text-primary-800">
                        {name}
                        <span className="block text-[11px] font-normal text-primary-400">
                          {isVendor ? 'Vendor' : 'Customer'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-primary-500">Cash</td>
                      <td className="px-4 py-2.5 text-right text-primary-700">
                        {isCredit ? formatCurrency(main) : formatCurrency(0)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-primary-700">
                        {!isCredit ? formatCurrency(main) : formatCurrency(0)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-red-600 font-medium">
                        {lessAmt > 0 ? formatCurrency(lessAmt) : formatCurrency(0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
