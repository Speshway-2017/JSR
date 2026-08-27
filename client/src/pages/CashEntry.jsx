import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDate } from '../utils/format';
import { matchesSearchFields } from '../utils/search';
import { useDataRestored } from '../utils/useDataRestored';

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
  const [savingRowId, setSavingRowId] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listRef = useRef(null);

  const selectedParty = useMemo(() => {
    if (!partyId || !partyType) return null;
    if (partyType === 'customer') return customers.find((c) => c._id === partyId) || null;
    return vendors.find((v) => v._id === partyId) || null;
  }, [partyId, partyType, customers, vendors]);

  const suggestions = useMemo(() => {
    if (!nameQuery.trim()) return [];

    const custHits = customers
      .filter((c) => matchesSearchFields(c, ['name', 'nameTelugu', 'mobile'], nameQuery))
      .map((c) => ({
        id: c._id,
        kind: 'customer',
        name: c.name,
        nameTelugu: c.nameTelugu || '',
        creditBalance: c.creditBalance || 0,
        label: 'Customer',
      }));

    const vendorHits = vendors
      .filter((v) => matchesSearchFields(v, ['name', 'nameTelugu', 'city', 'mobile'], nameQuery))
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

  const refresh = useCallback(async () => {
    const [custRes, vendorRes, entryRes] = await Promise.all([
      api.get('/customers'),
      api.get('/vendors'),
      api.get('/transactions/cash-entries', { params: { date: entryDate } }),
    ]);
    setCustomers(custRes.data);
    setVendors(vendorRes.data);
    setEntries(entryRes.data);
  }, [entryDate]);

  useEffect(() => {
    refresh().catch(() => toast.error('Failed to load cash entry data'));
  }, [refresh]);

  useDataRestored(refresh);

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

  const rowAmounts = (tx) => {
    const lessAmt = Number(tx.lessAmount || 0);
    const main = Math.max(0, Number(tx.amount || 0) - lessAmt);
    const isCredit = tx.cashSide === 'credit';
    return {
      lessAmt,
      credit: isCredit ? main : 0,
      debit: isCredit ? 0 : main,
      isCredit,
      isVendor: !!tx.vendor,
      partyKey: tx.vendor ? `vendor:${tx.vendor._id}` : `customer:${tx.customer?._id || ''}`,
    };
  };

  const persistRow = async (tx, patch) => {
    const cur = rowAmounts(tx);
    const partyType = patch.partyType ?? (cur.isVendor ? 'vendor' : 'customer');
    const cashSide = patch.cashSide ?? tx.cashSide;
    const amount =
      patch.amount != null ? patch.amount : cashSide === 'credit' ? cur.credit : cur.debit;
    const lessAllowed =
      (partyType === 'customer' && cashSide === 'credit') ||
      (partyType === 'vendor' && cashSide === 'debit');
    const less = lessAllowed ? (patch.less != null ? patch.less : cur.lessAmt) : 0;

    const payload = {
      partyType,
      cashSide,
      amount,
      less: lessAllowed ? less : 0,
      entryDate,
    };
    if (partyType === 'customer') {
      payload.customerId = patch.customerId ?? tx.customer?._id;
      payload.vendorId = undefined;
    } else {
      payload.vendorId = patch.vendorId ?? tx.vendor?._id;
      payload.customerId = undefined;
    }

    setSavingRowId(tx._id);
    try {
      await api.put(`/transactions/cash-entry/${tx._id}`, payload);
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update');
      throw err;
    } finally {
      setSavingRowId('');
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
              autoComplete="off"
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
              autoComplete="off"
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
          <>
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
                  const cur = rowAmounts(tx);
                  const busy = savingRowId === tx._id;
                  const lessAllowed =
                    (!cur.isVendor && cur.isCredit) || (cur.isVendor && !cur.isCredit);
                  const cell =
                    'w-full bg-transparent rounded-lg border border-transparent hover:border-primary-200 focus:border-primary-400 focus:bg-surface outline-none px-1.5 py-1 disabled:opacity-60';
                  return (
                    <tr key={tx._id} className="border-b border-primary-50">
                      <td className="px-2 py-1.5 min-w-[10rem]">
                        <select
                          className={`${cell} font-medium text-primary-800`}
                          value={cur.partyKey}
                          disabled={busy}
                          onChange={(e) => {
                            const [kind, id] = e.target.value.split(':');
                            if (e.target.value === cur.partyKey) return;
                            persistRow(tx, {
                              partyType: kind,
                              customerId: kind === 'customer' ? id : undefined,
                              vendorId: kind === 'vendor' ? id : undefined,
                            }).catch(() => {});
                          }}
                        >
                          {cur.partyKey &&
                          !customers.some((c) => `customer:${c._id}` === cur.partyKey) &&
                          !vendors.some((v) => `vendor:${v._id}` === cur.partyKey) ? (
                            <option value={cur.partyKey}>
                              {tx.customer?.name || tx.vendor?.name || '—'}
                            </option>
                          ) : null}
                          <optgroup label="Customers">
                            {customers.map((c) => (
                              <option key={c._id} value={`customer:${c._id}`}>
                                {c.name}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Vendors">
                            {vendors.map((v) => (
                              <option key={v._id} value={`vendor:${v._id}`}>
                                {v.name}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        <span className="block text-[11px] font-normal text-primary-400 px-1.5">
                          {cur.isVendor ? 'Vendor' : 'Customer'}
                        </span>
                      </td>
                      <td className="px-4 py-1.5 text-primary-500">Cash</td>
                      <td className="px-2 py-1.5 w-28">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          disabled={busy}
                          defaultValue={cur.credit || ''}
                          key={`${tx._id}-credit-${cur.credit}`}
                          className={`${cell} text-right tabular-nums text-primary-700`}
                          onBlur={(e) => {
                            const n = Number(String(e.target.value).replace(/[^\d.]/g, '')) || 0;
                            if (n === cur.credit) return;
                            persistRow(tx, { cashSide: 'credit', amount: n }).catch(() => {});
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                      </td>
                      <td className="px-2 py-1.5 w-28">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          disabled={busy}
                          defaultValue={cur.debit || ''}
                          key={`${tx._id}-debit-${cur.debit}`}
                          className={`${cell} text-right tabular-nums text-primary-700`}
                          onBlur={(e) => {
                            const n = Number(String(e.target.value).replace(/[^\d.]/g, '')) || 0;
                            if (n === cur.debit) return;
                            persistRow(tx, { cashSide: 'debit', amount: n }).catch(() => {});
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                      </td>
                      <td className="px-2 py-1.5 w-28">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          disabled={busy || !lessAllowed}
                          defaultValue={cur.lessAmt || ''}
                          key={`${tx._id}-less-${cur.lessAmt}`}
                          className={`${cell} text-right tabular-nums text-red-600 font-medium`}
                          onBlur={(e) => {
                            const n = Number(String(e.target.value).replace(/[^\d.]/g, '')) || 0;
                            if (n === cur.lessAmt) return;
                            persistRow(tx, { less: n }).catch(() => {});
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
            <p className="text-xs text-primary-400 px-4 py-2 border-t border-primary-50">
              Edit name, credit, debit or less in the table — Enter or click away to save.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
