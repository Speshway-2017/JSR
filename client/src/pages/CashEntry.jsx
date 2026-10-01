import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Banknote, Trash2 } from 'lucide-react';
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
  const [reason, setReason] = useState('');
  const [cashSide, setCashSide] = useState('credit');
  const [paymentType, setPaymentType] = useState('Cash');
  const [saving, setSaving] = useState(false);
  const [savingRowId, setSavingRowId] = useState('');
  const [deletingRowId, setDeletingRowId] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const listRef = useRef(null);
  const dateRef = useRef(null);
  const typeRef = useRef(null);
  const nameRef = useRef(null);
  const amountRef = useRef(null);
  const lessRef = useRef(null);
  const reasonRef = useRef(null);
  const saveRef = useRef(null);

  const pendingFocusCell = useRef(null);
  const originalCellRef = useRef(null);
  const cancelEditRef = useRef(false);

  useLayoutEffect(() => {
    if (pendingFocusCell.current) {
      const { row, col } = pendingFocusCell.current;
      const selector = `[data-table-row="${row}"][data-table-col="${col}"]`;
      const target = document.querySelector(selector);
      if (target) {
        target.focus();
        if (typeof target.select === 'function' && target.tagName === 'INPUT') {
          target.select();
        }
        pendingFocusCell.current = null;
      }
    }
  });

  useEffect(() => {
    if (pendingFocusCell.current) {
      const { row, col } = pendingFocusCell.current;
      const selector = `[data-table-row="${row}"][data-table-col="${col}"]`;
      const target = document.querySelector(selector);
      if (target) {
        target.focus();
        if (typeof target.select === 'function' && target.tagName === 'INPUT') {
          target.select();
        }
        pendingFocusCell.current = null;
      }
    }
  });

  const selectedParty = useMemo(() => {
    if (!partyId || !partyType) return null;
    if (partyType === 'customer') return customers.find((c) => c._id === partyId) || null;
    return vendors.find((v) => v._id === partyId) || null;
  }, [partyId, partyType, customers, vendors]);

  const suggestions = useMemo(() => {
    if (!nameQuery.trim()) return [];

    const custHits = customers
      .filter((c) => matchesSearchFields(c, ['name', 'nameTelugu'], nameQuery))
      .map((c) => ({
        id: c._id,
        kind: 'customer',
        name: c.name,
        nameTelugu: c.nameTelugu || '',
        creditBalance: c.creditBalance || 0,
        label: 'Customer',
      }));

    const vendorHits = vendors
      .filter((v) => matchesSearchFields(v, ['name', 'nameTelugu'], nameQuery))
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

  useEffect(() => {
    if (!suggestOpen || highlight < 0 || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, suggestOpen]);

  const pickParty = (item) => {
    setPartyType(item.kind);
    setPartyId(item.id);
    setNameQuery(item.name);
    // Auto type from party; user can still change Type manually after
    setCashSide(item.kind === 'vendor' ? 'debit' : 'credit');
    setSuggestOpen(false);
    setHighlight(-1);
    setTimeout(() => {
      amountRef.current?.focus();
      amountRef.current?.select();
    }, 50);
  };

  const clearFormAmounts = () => {
    setAmount('');
    setLess('');
    setReason('');
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
        paymentType,
        entryDate,
        reason: reason.trim(),
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
      setReason('');
      setPaymentType('Cash');
      await refresh();
      setTimeout(() => {
        nameRef.current?.focus();
      }, 50);
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
    if (e.key === 'Enter') {
      if (suggestOpen && suggestions.length > 0) {
        e.preventDefault();
        pickParty(suggestions[highlight >= 0 ? highlight : 0]);
        return;
      }
      if (partyId) {
        e.preventDefault();
        amountRef.current?.focus();
        amountRef.current?.select();
        return;
      }
    }
    if (e.key === 'Escape') {
      setSuggestOpen(false);
      setHighlight(-1);
    }
  };

  const handleFormKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    const target = e.target;
    if (target === nameRef.current) return;

    if (target === dateRef.current) {
      e.preventDefault();
      typeRef.current?.focus();
      return;
    }

    if (target === typeRef.current) {
      e.preventDefault();
      nameRef.current?.focus();
      nameRef.current?.select();
      return;
    }

    if (target === amountRef.current) {
      if (lessEnabled) {
        e.preventDefault();
        lessRef.current?.focus();
        lessRef.current?.select();
      } else {
        e.preventDefault();
        reasonRef.current?.focus();
        reasonRef.current?.select();
      }
      return;
    }

    if (target === lessRef.current) {
      e.preventDefault();
      reasonRef.current?.focus();
      reasonRef.current?.select();
      return;
    }

    if (target === reasonRef.current) {
      e.preventDefault();
      saveRef.current?.focus();
      return;
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
    const payType = patch.paymentType ?? tx.paymentType ?? 'Cash';
    const amount =
      patch.amount != null ? patch.amount : cashSide === 'credit' ? cur.credit : cur.debit;
    const lessAllowed =
      (partyType === 'customer' && cashSide === 'credit') ||
      (partyType === 'vendor' && cashSide === 'debit');
    const less = lessAllowed ? (patch.less != null ? patch.less : cur.lessAmt) : 0;
    const reasonVal = patch.reason !== undefined ? patch.reason : (tx.reason || '');

    const payload = {
      partyType,
      cashSide,
      paymentType: payType,
      amount,
      less: lessAllowed ? less : 0,
      reason: reasonVal,
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

  const handleDeleteEntry = async (tx) => {
    const partyName = tx.customer?.name || tx.vendor?.name || 'this party';
    const cur = rowAmounts(tx);
    const amountVal = cur.isCredit ? cur.credit : cur.debit;
    const side = tx.cashSide === 'debit' ? 'Debit' : 'Credit';
    const confirmMsg = `Are you sure you want to delete this ${side} entry of ₹${amountVal} for "${partyName}"? This will reverse their balance.`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingRowId(tx._id);
    try {
      await api.delete(`/transactions/cash-entry/${tx._id}`);
      toast.success('Cash entry deleted · Balance updated');
      await refresh();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to delete cash entry');
    } finally {
      setDeletingRowId('');
    }
  };

  const commitIfDirty = (rowIdx, colIdx, el) => {
    if (cancelEditRef.current) return;
    const tx = entries[rowIdx];
    if (!tx) return;
    const cur = rowAmounts(tx);

    if (colIdx === 0) {
      const val = el.value;
      if (val && val !== cur.partyKey) {
        const [kind, id] = val.split(':');
        persistRow(tx, {
          partyType: kind,
          customerId: kind === 'customer' ? id : undefined,
          vendorId: kind === 'vendor' ? id : undefined,
        }).catch(() => {});
      }
    } else if (colIdx === 1) {
      const val = el.value;
      if (val && val !== (tx.paymentType || 'Cash')) {
        persistRow(tx, { paymentType: val }).catch(() => {});
      }
    } else if (colIdx === 2) {
      const val = el.value.trim();
      if (val !== (tx.reason || '')) {
        persistRow(tx, { reason: val }).catch(() => {});
      }
    } else if (colIdx === 3) {
      const n = Number(String(el.value).replace(/[^\d.]/g, '')) || 0;
      if (n !== cur.credit) {
        persistRow(tx, { cashSide: 'credit', amount: n }).catch(() => {});
      }
    } else if (colIdx === 4) {
      const n = Number(String(el.value).replace(/[^\d.]/g, '')) || 0;
      if (n !== cur.debit) {
        persistRow(tx, { cashSide: 'debit', amount: n }).catch(() => {});
      }
    } else if (colIdx === 5) {
      const n = Number(String(el.value).replace(/[^\d.]/g, '')) || 0;
      if (n !== cur.lessAmt) {
        persistRow(tx, { less: n }).catch(() => {});
      }
    }
  };

  const handleGridKeyDown = (e, rowIdx, colIdx) => {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      return;
    }

    const el = e.currentTarget || e.target;
    const isInput = el.tagName === 'INPUT' && !el.readOnly;

    // For text inputs, ArrowLeft/Right should move cursor within the
    // text unless the caret is already at the boundary (start/end).
    if (isInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const pos = el.selectionStart;
      const len = (el.value || '').length;
      const hasSelection = el.selectionStart !== el.selectionEnd;
      if (hasSelection) return; // let browser collapse selection first
      if (e.key === 'ArrowLeft' && pos > 0) return; // cursor not at start
      if (e.key === 'ArrowRight' && pos < len) return; // cursor not at end
    }

    let targetRow = rowIdx;
    let targetCol = colIdx;

    if (e.key === 'ArrowUp') {
      targetRow = Math.max(0, rowIdx - 1);
    } else if (e.key === 'ArrowDown') {
      targetRow = Math.min(entries.length - 1, rowIdx + 1);
    } else if (e.key === 'ArrowLeft') {
      targetCol = Math.max(0, colIdx - 1);
    } else if (e.key === 'ArrowRight') {
      targetCol = Math.min(6, colIdx + 1);
    }

    if (targetRow === rowIdx && targetCol === colIdx) return;

    e.preventDefault();
    e.stopPropagation();

    commitIfDirty(rowIdx, colIdx, el);

    pendingFocusCell.current = { row: targetRow, col: targetCol };

    const focusTarget = () => {
      const selector = `[data-table-row="${targetRow}"][data-table-col="${targetCol}"]`;
      const target = document.querySelector(selector);
      if (target) {
        target.focus();
        if (typeof target.select === 'function' && target.tagName === 'INPUT') {
          target.select();
        }
        return true;
      }
      return false;
    };

    if (focusTarget()) {
      pendingFocusCell.current = null;
    } else {
      requestAnimationFrame(() => {
        if (pendingFocusCell.current) {
          if (focusTarget()) pendingFocusCell.current = null;
        }
      });
      setTimeout(() => {
        if (pendingFocusCell.current) {
          if (focusTarget()) pendingFocusCell.current = null;
        }
      }, 50);
    }
  };

  const totals = useMemo(() => {
    return entries.reduce(
      (acc, tx) => {
        const cur = rowAmounts(tx);
        return {
          credit: acc.credit + (cur.credit || 0),
          debit: acc.debit + (cur.debit || 0),
          less: acc.less + (cur.lessAmt || 0),
        };
      },
      { credit: 0, debit: 0, less: 0 }
    );
  }, [entries]);

  return (
    <div className="space-y-3 max-w-5xl">
      <div>
        <h1 className="page-title text-2xl font-bold text-primary-700">Cash Entry</h1>
        <p className="text-xs text-primary-500 mt-1">
          Customer receipts (Credit) or vendor payments (Debit) — type can still be changed manually
        </p>
      </div>

      <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="card !p-3.5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">
              Date *
            </label>
            <input
              ref={dateRef}
              type="date"
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">
              Type *
            </label>
            <select
              ref={typeRef}
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              value={cashSide}
              onChange={(e) => setCashSide(e.target.value)}
            >
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">
              Type of Payment *
            </label>
            <select
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              value={paymentType}
              onChange={(e) => setPaymentType(e.target.value)}
            >
              <option value="Cash">Cash</option>
              <option value="PhonePe">PhonePe</option>
              <option value="Google Pay">Google Pay</option>
              <option value="Card">Card</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <label className="text-xs font-semibold text-primary-600 mb-1 block">
            Name *
          </label>
          <input
            ref={nameRef}
            className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
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
              className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl border border-primary-200 bg-surface shadow-card"
            >
              {suggestions.map((item, idx) => (
                <li key={`${item.kind}-${item.id}`}>
                  <button
                    type="button"
                    data-idx={idx}
                    className={`w-full text-left px-3 py-2 text-sm ${
                      idx === highlight
                        ? 'bg-primary-100 text-primary-900 font-medium'
                        : 'text-primary-700 hover:bg-primary-50'
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => pickParty(item)}
                  >
                    <span className="font-semibold">{item.name}</span>
                    <span
                      className={`ml-2 text-xs font-semibold uppercase tracking-wide ${
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
          <div className="rounded-xl bg-primary-50/90 border border-primary-100 px-3 py-2 text-sm text-primary-700 flex flex-wrap items-center justify-between gap-2">
            <span>
              Selected:{' '}
              <strong className="text-primary-900 font-bold">
                {selectedParty.name}
              </strong>
              <span className="text-primary-400">
                {' '}
                ({partyType === 'vendor' ? 'Vendor' : 'Customer'})
              </span>
              {' · '}
              Balance <strong className="text-primary-900 font-bold">{formatCurrency(selectedParty.creditBalance || 0)}</strong>
            </span>
            {lessEnabled && remainingAfterAmount > 0 && (
              <button
                type="button"
                className="text-xs font-semibold text-primary-600 hover:text-primary-800 underline underline-offset-2"
                onClick={fillLessWithRemaining}
              >
                Fill Less with remaining ({formatCurrency(remainingAfterAmount)})
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">
              Amount *
            </label>
            <input
              ref={amountRef}
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-bold text-primary-800 text-right focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 tabular-nums transition"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">
              Less
            </label>
            <input
              ref={lessRef}
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-bold text-red-600 text-right focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 tabular-nums transition disabled:opacity-50"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={less}
              onChange={(e) => setLess(e.target.value.replace(/[^\d.]/g, ''))}
              disabled={!lessEnabled}
            />
            <p className="text-xs text-primary-400 mt-0.5">
              Optional. Remaining balance also marked as paid (added with amount).
            </p>
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">
              Reason / Remarks
            </label>
            <input
              ref={reasonRef}
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm text-primary-800 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              type="text"
              autoComplete="off"
              placeholder="e.g. Advance, Old balance..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <p className="text-xs text-primary-400 mt-0.5">
              Optional. Reason / description for entry.
            </p>
          </div>
        </div>

        {lessEnabled && (Number(amount) > 0 || Number(less) > 0) && (
          <div className="inline-flex items-center gap-1.5 rounded-lg bg-accent-100/90 text-accent-800 px-3 py-1.5 text-sm font-semibold">
            <Banknote className="w-4 h-4 shrink-0" />
            Total paid:{' '}
            <strong className="font-bold">
              {formatCurrency((Number(amount) || 0) + (Number(less) || 0))}
            </strong>
          </div>
        )}

        <div>
          <button
            ref={saveRef}
            type="submit"
            className="btn-primary !py-2 !px-6 !text-sm font-semibold shadow-xs"
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      <div className="card !p-0 overflow-hidden border border-primary-200">
        <div className="px-3.5 py-2.5 border-b border-primary-200 bg-surface flex items-center justify-between">
          <span className="font-bold text-sm text-primary-800">
            Entries for {formatDate(entryDate)}
          </span>
          <span className="text-xs text-primary-400 font-medium">
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        </div>
        {entries.length === 0 ? (
          <p className="text-center py-8 text-primary-400 text-sm">No cash entries for this date</p>
        ) : (
          <>
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-xs excel-grid">
                <thead className="sticky top-0 z-20 bg-accent-200">
                  <tr className="bg-accent-200 text-accent-800 text-left">
                    <th className="bg-accent-200 px-2 py-1.5 font-semibold text-left whitespace-nowrap sticky top-0 z-20">
                      Name
                    </th>
                    <th className="bg-accent-200 px-2 py-1.5 font-semibold text-left whitespace-nowrap sticky top-0 z-20 w-32">
                      Type of Payment
                    </th>
                    <th className="bg-accent-200 px-2 py-1.5 font-semibold text-left whitespace-nowrap sticky top-0 z-20 w-36">
                      Reason
                    </th>
                    <th className="bg-accent-200 px-2 py-1.5 font-semibold text-right whitespace-nowrap sticky top-0 z-20 w-28">
                      Credit
                    </th>
                    <th className="bg-accent-200 px-2 py-1.5 font-semibold text-right whitespace-nowrap sticky top-0 z-20 w-28">
                      Debit
                    </th>
                    <th className="bg-accent-200 px-2 py-1.5 font-semibold text-right whitespace-nowrap sticky top-0 z-20 w-28">
                      Less
                    </th>
                    <th className="bg-accent-200 px-1 py-1.5 font-semibold text-center whitespace-nowrap sticky top-0 z-20 w-12">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-surface">
                  {entries.map((tx, i) => {
                    const cur = rowAmounts(tx);
                    const busy = savingRowId === tx._id || deletingRowId === tx._id;
                    const lessAllowed =
                      (!cur.isVendor && cur.isCredit) || (cur.isVendor && !cur.isCredit);

                    return (
                      <tr key={tx._id} className="hover:bg-primary-50/40">
                        <td className="px-2 py-1 min-w-[10rem]">
                          <select
                            data-table-row={i}
                            data-table-col={0}
                            className="grid-input font-medium text-primary-800 text-xs cursor-pointer"
                            value={cur.partyKey}
                            disabled={busy}
                            onFocus={() => {
                              cancelEditRef.current = false;
                              originalCellRef.current = { row: i, col: 0, val: cur.partyKey };
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelEditRef.current = true;
                                const orig = originalCellRef.current?.val ?? cur.partyKey;
                                e.currentTarget.value = orig;
                                pendingFocusCell.current = { row: i, col: 0 };
                                e.currentTarget.focus();
                                return;
                              }
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                cancelEditRef.current = false;
                                const val = e.currentTarget.value;
                                if (val && val !== cur.partyKey) {
                                  const [kind, id] = val.split(':');
                                  persistRow(tx, {
                                    partyType: kind,
                                    customerId: kind === 'customer' ? id : undefined,
                                    vendorId: kind === 'vendor' ? id : undefined,
                                  }).catch(() => {});
                                }
                                pendingFocusCell.current = { row: i, col: 0 };
                                e.currentTarget.focus();
                                return;
                              }
                              handleGridKeyDown(e, i, 0);
                            }}
                            onBlur={(e) => {
                              if (cancelEditRef.current) {
                                cancelEditRef.current = false;
                                return;
                              }
                              const val = e.target.value;
                              if (val && val !== cur.partyKey) {
                                const [kind, id] = val.split(':');
                                persistRow(tx, {
                                  partyType: kind,
                                  customerId: kind === 'customer' ? id : undefined,
                                  vendorId: kind === 'vendor' ? id : undefined,
                                }).catch(() => {});
                              }
                            }}
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
                                {tx.customer?.name || (tx.vendor ? `${tx.vendor.name} (Vendor)` : '—')}
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
                                  {v.name} (Vendor)
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </td>

                        <td className="px-2 py-1 min-w-[7.5rem]">
                          <select
                            data-table-row={i}
                            data-table-col={1}
                            className="grid-input font-medium text-primary-700 text-xs cursor-pointer"
                            value={tx.paymentType || 'Cash'}
                            disabled={busy}
                            onFocus={() => {
                              cancelEditRef.current = false;
                              originalCellRef.current = { row: i, col: 1, val: tx.paymentType || 'Cash' };
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                cancelEditRef.current = true;
                                const orig = originalCellRef.current?.val ?? (tx.paymentType || 'Cash');
                                e.currentTarget.value = orig;
                                pendingFocusCell.current = { row: i, col: 1 };
                                e.currentTarget.focus();
                                return;
                              }
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                cancelEditRef.current = false;
                                const val = e.currentTarget.value;
                                if (val && val !== (tx.paymentType || 'Cash')) {
                                  persistRow(tx, { paymentType: val }).catch(() => {});
                                }
                                pendingFocusCell.current = { row: i, col: 1 };
                                e.currentTarget.focus();
                                return;
                              }
                              handleGridKeyDown(e, i, 1);
                            }}
                            onBlur={(e) => {
                              if (cancelEditRef.current) {
                                cancelEditRef.current = false;
                                return;
                              }
                              const val = e.target.value;
                              if (val && val !== (tx.paymentType || 'Cash')) {
                                persistRow(tx, { paymentType: val }).catch(() => {});
                              }
                            }}
                            onChange={(e) => {
                              persistRow(tx, { paymentType: e.target.value }).catch(() => {});
                            }}
                          >
                            <option value="Cash">Cash</option>
                            <option value="PhonePe">PhonePe</option>
                            <option value="Google Pay">Google Pay</option>
                            <option value="Card">Card</option>
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Other">Other</option>
                          </select>
                        </td>

                        <td className="px-2 py-1 min-w-[8rem]">
                          <input
                            data-table-row={i}
                            data-table-col={2}
                            type="text"
                            autoComplete="off"
                            disabled={busy}
                            defaultValue={tx.reason || ''}
                            key={`${tx._id}-reason-${tx.reason || ''}`}
                            placeholder="—"
                            className="grid-input text-left text-primary-800 text-xs font-medium"
                            onFocus={(e) => {
                              cancelEditRef.current = false;
                              originalCellRef.current = { row: i, col: 2, val: tx.reason || '' };
                              if (typeof e.target.select === 'function') {
                                setTimeout(() => {
                                  try { e.target.select(); } catch (_) {}
                                }, 0);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                cancelEditRef.current = true;
                                const orig = originalCellRef.current?.val ?? (tx.reason || '');
                                e.currentTarget.value = orig;
                                pendingFocusCell.current = { row: i, col: 2 };
                                e.currentTarget.focus();
                                if (typeof e.currentTarget.select === 'function') e.currentTarget.select();
                                return;
                              }
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                cancelEditRef.current = false;
                                const val = e.currentTarget.value.trim();
                                if (val !== (tx.reason || '')) {
                                  persistRow(tx, { reason: val }).catch(() => {});
                                }
                                pendingFocusCell.current = { row: i, col: 2 };
                                e.currentTarget.focus();
                                if (typeof e.currentTarget.select === 'function') e.currentTarget.select();
                                return;
                              }
                              handleGridKeyDown(e, i, 2);
                            }}
                            onBlur={(e) => {
                              if (cancelEditRef.current) {
                                cancelEditRef.current = false;
                                return;
                              }
                              const val = e.target.value.trim();
                              if (val !== (tx.reason || '')) {
                                persistRow(tx, { reason: val }).catch(() => {});
                              }
                            }}
                          />
                        </td>

                        <td className="px-2 py-1 w-28">
                          <input
                            data-table-row={i}
                            data-table-col={3}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            disabled={busy}
                            defaultValue={cur.credit || ''}
                            key={`${tx._id}-credit-${cur.credit}`}
                            className="grid-input text-right tabular-nums text-primary-800 text-xs font-semibold"
                            onFocus={(e) => {
                              cancelEditRef.current = false;
                              originalCellRef.current = { row: i, col: 3, val: cur.credit || '' };
                              if (typeof e.target.select === 'function') {
                                setTimeout(() => {
                                  try { e.target.select(); } catch (_) {}
                                }, 0);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                cancelEditRef.current = true;
                                const orig = originalCellRef.current?.val ?? (cur.credit || '');
                                e.currentTarget.value = orig;
                                pendingFocusCell.current = { row: i, col: 3 };
                                e.currentTarget.focus();
                                if (typeof e.currentTarget.select === 'function') e.currentTarget.select();
                                return;
                              }
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                cancelEditRef.current = false;
                                const n = Number(String(e.currentTarget.value).replace(/[^\d.]/g, '')) || 0;
                                if (n !== cur.credit) {
                                  persistRow(tx, { cashSide: 'credit', amount: n }).catch(() => {});
                                }
                                pendingFocusCell.current = { row: i, col: 3 };
                                e.currentTarget.focus();
                                if (typeof e.currentTarget.select === 'function') e.currentTarget.select();
                                return;
                              }
                              handleGridKeyDown(e, i, 3);
                            }}
                            onBlur={(e) => {
                              if (cancelEditRef.current) {
                                cancelEditRef.current = false;
                                return;
                              }
                              const n = Number(String(e.target.value).replace(/[^\d.]/g, '')) || 0;
                              if (n !== cur.credit) {
                                persistRow(tx, { cashSide: 'credit', amount: n }).catch(() => {});
                              }
                            }}
                          />
                        </td>

                        <td className="px-2 py-1 w-28">
                          <input
                            data-table-row={i}
                            data-table-col={4}
                            type="text"
                            inputMode="decimal"
                            autoComplete="off"
                            disabled={busy}
                            defaultValue={cur.debit || ''}
                            key={`${tx._id}-debit-${cur.debit}`}
                            className="grid-input text-right tabular-nums text-primary-800 text-xs font-semibold"
                            onFocus={(e) => {
                              cancelEditRef.current = false;
                              originalCellRef.current = { row: i, col: 4, val: cur.debit || '' };
                              if (typeof e.target.select === 'function') {
                                setTimeout(() => {
                                  try { e.target.select(); } catch (_) {}
                                }, 0);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                e.stopPropagation();
                                cancelEditRef.current = true;
                                const orig = originalCellRef.current?.val ?? (cur.debit || '');
                                e.currentTarget.value = orig;
                                pendingFocusCell.current = { row: i, col: 4 };
                                e.currentTarget.focus();
                                if (typeof e.currentTarget.select === 'function') e.currentTarget.select();
                                return;
                              }
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                cancelEditRef.current = false;
                                const n = Number(String(e.currentTarget.value).replace(/[^\d.]/g, '')) || 0;
                                if (n !== cur.debit) {
                                  persistRow(tx, { cashSide: 'debit', amount: n }).catch(() => {});
                                }
                                pendingFocusCell.current = { row: i, col: 4 };
                                e.currentTarget.focus();
                                if (typeof e.currentTarget.select === 'function') e.currentTarget.select();
                                return;
                              }
                              handleGridKeyDown(e, i, 4);
                            }}
                            onBlur={(e) => {
                              if (cancelEditRef.current) {
                                cancelEditRef.current = false;
                                return;
                              }
                              const n = Number(String(e.target.value).replace(/[^\d.]/g, '')) || 0;
                              if (n !== cur.debit) {
                                persistRow(tx, { cashSide: 'debit', amount: n }).catch(() => {});
                              }
                            }}
                          />
                        </td>

                        <td className="px-2 py-1 w-28">
                          {lessAllowed ? (
                            <input
                              data-table-row={i}
                              data-table-col={5}
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              disabled={busy}
                              defaultValue={cur.lessAmt || ''}
                              key={`${tx._id}-less-${cur.lessAmt}`}
                              className="grid-input text-right tabular-nums text-red-600 font-bold text-xs"
                              onFocus={(e) => {
                                cancelEditRef.current = false;
                                originalCellRef.current = { row: i, col: 5, val: cur.lessAmt || '' };
                                if (typeof e.target.select === 'function') {
                                  setTimeout(() => {
                                    try { e.target.select(); } catch (_) {}
                                  }, 0);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  cancelEditRef.current = true;
                                  const orig = originalCellRef.current?.val ?? (cur.lessAmt || '');
                                  e.currentTarget.value = orig;
                                  pendingFocusCell.current = { row: i, col: 5 };
                                  e.currentTarget.focus();
                                  if (typeof e.currentTarget.select === 'function') e.currentTarget.select();
                                  return;
                                }
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  cancelEditRef.current = false;
                                  const n = Number(String(e.currentTarget.value).replace(/[^\d.]/g, '')) || 0;
                                  if (n !== cur.lessAmt) {
                                    persistRow(tx, { less: n }).catch(() => {});
                                  }
                                  pendingFocusCell.current = { row: i, col: 5 };
                                  e.currentTarget.focus();
                                  if (typeof e.currentTarget.select === 'function') e.currentTarget.select();
                                  return;
                                }
                                handleGridKeyDown(e, i, 5);
                              }}
                              onBlur={(e) => {
                                if (cancelEditRef.current) {
                                  cancelEditRef.current = false;
                                  return;
                                }
                                const n = Number(String(e.target.value).replace(/[^\d.]/g, '')) || 0;
                                if (n !== cur.lessAmt) {
                                  persistRow(tx, { less: n }).catch(() => {});
                                }
                              }}
                            />
                          ) : (
                            <div
                              tabIndex={0}
                              data-table-row={i}
                              data-table-col={5}
                              onKeyDown={(e) => handleGridKeyDown(e, i, 5)}
                              className="w-full text-right text-primary-300 outline-none cursor-default font-medium text-xs"
                            >
                              —
                            </div>
                          )}
                        </td>

                        <td className="px-1 py-1 text-center w-12">
                          <button
                            type="button"
                            tabIndex={0}
                            data-table-row={i}
                            data-table-col={6}
                            disabled={busy}
                            onClick={() => handleDeleteEntry(tx)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleDeleteEntry(tx);
                                return;
                              }
                              handleGridKeyDown(e, i, 6);
                            }}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition cursor-pointer disabled:opacity-40 outline-none"
                            title="Delete cash entry"
                          >
                            <Trash2 className="w-3.5 h-3.5 mx-auto" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 z-20 bg-accent-200 text-accent-900 font-bold text-xs">
                  <tr className="bg-accent-200 text-accent-900">
                    <td colSpan={3} className="px-2 py-2 text-right font-bold uppercase text-xs tracking-wider">
                      Total
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-xs">
                      {formatCurrency(totals.credit)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-xs">
                      {formatCurrency(totals.debit)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-bold text-red-600 text-xs">
                      {formatCurrency(totals.less)}
                    </td>
                    <td className="px-1 py-2"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-primary-500 px-3 py-2 border-t border-primary-100 bg-surface">
              Edit name, type of payment, reason, credit, debit or less in the table — Enter or click away to save.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
