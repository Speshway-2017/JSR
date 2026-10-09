import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Send, Share2, Printer } from 'lucide-react';
import { openLedgerPreview } from '../utils/reportPrint';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDateOnly } from '../utils/format';
import { matchesSearchFields } from '../utils/search';
import { useDataRestored } from '../utils/useDataRestored';
import { useMDI } from '../context/MDIContext';
import { generateLedgerReportHtml } from '../utils/statementPdf';
import { sendWhatsAppBillPdf } from '../utils/whatsappSender';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function Ledger() {
  const isOnline = useOnlineStatus();
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
  const [sendingWa, setSendingWa] = useState(false);

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
      .filter((p) => matchesSearchFields(p, ['name', 'nameTelugu'], nameQuery))
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

  const openSale = (row) => {
    if (!row.saleId) return;
    const d = new Date(row.date).toISOString().slice(0, 10);
    const params = new URLSearchParams({
      date: d,
      saleId: row.saleId,
      highlightSaleId: row.saleId,
      t: Date.now().toString(),
    });
    openWindow({ path: `/sell?${params.toString()}`, title: 'Sales Entry' });
  };

  const openCashEntry = (row) => {
    const d = new Date(row.date).toISOString().slice(0, 10);
    const txId = row.transactionId || row.id;
    const params = new URLSearchParams({
      date: d,
      highlightId: txId || '',
      txId: txId || '',
      partyType,
      partyId,
      t: Date.now().toString(),
    });
    openWindow({ path: `/cash-entry?${params.toString()}`, title: 'Cash Entry' });
  };

  const openEntry = (row) => {
    if (row.saleId) {
      openSale(row);
    } else if (row.kind === 'payment' || row.paid > 0 || row.less > 0 || row.transactionId) {
      openCashEntry(row);
    }
  };

  const handlePrint = () => {
    if (!data) return;
    openLedgerPreview(data, selected?.mobile);
  };

  const handleSendWhatsApp = async () => {
    if (!data) return;
    const phoneToUse = selected?.mobile || data.customer?.mobile || '';

    setSendingWa(true);
    try {
      const htmlString = generateLedgerReportHtml({ data, partyPhone: phoneToUse });
      const partyName = data.customer?.name || 'Party';
      const rangeStr = `${formatDateOnly(data.startDate)} to ${formatDateOnly(data.endDate)}`;

      await sendWhatsAppBillPdf({
        recipientPhone: phoneToUse,
        recipientName: partyName,
        htmlString,
        filename: `Ledger_${partyName.replace(/\s+/g, '_')}_${formatDateOnly(data.startDate)}.pdf`,
        caption: `Dear ${partyName}, your Ledger Statement (${rangeStr}) from JSR AGRI TRADES is attached. Opening: ${formatCurrency(data.openingBalance)}, Closing: ${formatCurrency(data.closingBalance)}. Thank you!`,
        templateName: 'ledger_statement',
        templateParams: [partyName, rangeStr],
      });
    } catch (err) {
      toast.error(err.message || 'Failed to send WhatsApp ledger statement');
    } finally {
      setSendingWa(false);
    }
  };

  return (
    <div className="space-y-3 max-w-3xl">
      <div>
        <h1 className="page-title text-2xl font-bold text-primary-700">Ledger</h1>
        <p className="text-xs text-primary-500 mt-1">
          Customer & Vendor transactions — sales, cash received/paid, running balance
        </p>
      </div>

      <form onSubmit={loadLedger} className="card !p-3.5 space-y-3">
        <div className="flex items-center gap-2.5 bg-primary-50/70 px-3 py-1.5 rounded-lg border border-primary-100 flex-wrap text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-600 shrink-0">Party Type:</span>
          <button
            type="button"
            onClick={() => setPartyType('customer')}
            className={`px-3 py-1 text-sm rounded-md font-semibold transition cursor-pointer ${
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
            className={`px-3 py-1 text-sm rounded-md font-semibold transition cursor-pointer ${
              partyType === 'vendor'
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-primary-600 hover:bg-primary-100'
            }`}
          >
            Vendor
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2 relative">
            <label className="text-xs font-semibold text-primary-600 mb-1 block">{partyType === 'vendor' ? 'Vendor *' : 'Customer *'}</label>
            <input
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
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
                className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-primary-200 bg-surface shadow-card"
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
                      <span className="font-semibold">{p.name}</span>
                      {p.city ? (
                        <span className="text-xs text-primary-400 ml-1.5">({p.city})</span>
                      ) : p.schedule?.name ? (
                        <span className="text-xs text-primary-400 ml-1.5">({p.schedule.name})</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selected ? (
              <p className="text-xs text-primary-500 mt-1 font-medium">
                {selected.city || selected.schedule?.name || 'Party selected'} · Balance{' '}
                <strong className="text-primary-800">{formatCurrency(selected.creditBalance)}</strong>
              </p>
            ) : null}
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">From *</label>
            <input
              type="date"
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">To *</label>
            <input
              type="date"
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>
        <button type="submit" className="btn-primary !py-2 !px-4 !text-sm font-semibold flex items-center gap-1.5" disabled={loading}>
          <BookOpen className="w-4 h-4" />
          {loading ? 'Loading…' : 'Show ledger'}
        </button>
      </form>

      {data && (
        <div className="card !p-0 overflow-hidden border border-primary-200">
          <div className="px-3.5 py-2.5 border-b border-primary-200 bg-surface flex items-center justify-between gap-2">
            <div>
              <p className="font-bold text-primary-800 text-sm sm:text-base">{data.customer.name}</p>
              <p className="text-xs text-primary-500">
                {formatDateOnly(data.startDate)} — {formatDateOnly(data.endDate)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="btn-primary !py-1.5 !px-3 !text-sm font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
              {isOnline && (
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  disabled={sendingWa}
                  className="btn-secondary !py-1.5 !px-3 !text-sm font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                  title="Share Statement (Windows Apps, WhatsApp, Teams, Mail)"
                >
                  <Share2 className="w-4 h-4 text-primary-600" />
                  {sendingWa ? 'Sharing...' : 'Share'}
                </button>
              )}
            </div>
          </div>
          <div className="px-3.5 py-2 bg-primary-50/80 border-b border-primary-200 flex items-center justify-between gap-2 text-sm">
            <span className="text-primary-600 font-medium">Opening</span>
            <span className="font-bold text-primary-800 tabular-nums">
              {formatCurrency(data.openingBalance)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs table-fixed">
              <thead>
                <tr className="bg-primary-50/80 text-left border-b border-primary-200">
                  <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide w-[105px]">Date</th>
                  <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide">Particulars</th>
                  <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-right w-[95px]">Sale</th>
                  <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-right w-[95px]">Paid</th>
                  <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-right w-[85px]">Less</th>
                  <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-right w-[105px]">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-primary-400 text-sm">
                      No transactions in this range
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-b border-primary-100 hover:bg-primary-50/40 cursor-pointer transition"
                      onClick={() => openEntry(row)}
                      onDoubleClick={() => openEntry(row)}
                      title={row.saleId ? 'Click to open sale details' : 'Click to open cash entry details'}
                    >
                      <td className="px-3 py-2 whitespace-nowrap text-primary-600 font-medium">{formatDateOnly(row.date)}</td>
                      <td className="px-3 py-2 text-primary-700 font-medium truncate">{row.particulars}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-semibold ${
                          row.saleId || row.sale
                            ? 'text-primary-800 hover:text-accent-700 underline underline-offset-2 decoration-primary-200 cursor-pointer'
                            : 'text-primary-400'
                        }`}
                        onClick={(e) => {
                          if (row.saleId) {
                            e.stopPropagation();
                            openSale(row);
                          }
                        }}
                        onDoubleClick={(e) => {
                          if (row.saleId) {
                            e.stopPropagation();
                            openSale(row);
                          }
                        }}
                        title={row.saleId ? 'Click sale to view/edit in Sales Entry' : undefined}
                      >
                        {row.sale ? formatCurrency(row.sale) : '—'}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-semibold ${
                          row.paid > 0 || row.kind === 'payment' || (row.transactionId && !row.saleId)
                            ? 'text-primary-800 hover:text-primary-950 underline underline-offset-2 decoration-primary-300 cursor-pointer'
                            : 'text-primary-400'
                        }`}
                        onClick={(e) => {
                          if (row.paid > 0 || row.kind === 'payment' || row.transactionId) {
                            e.stopPropagation();
                            openCashEntry(row);
                          }
                        }}
                        onDoubleClick={(e) => {
                          if (row.paid > 0 || row.kind === 'payment' || row.transactionId) {
                            e.stopPropagation();
                            openCashEntry(row);
                          }
                        }}
                        title={
                          row.paid > 0 || row.kind === 'payment' || row.transactionId
                            ? 'Click paid amount to edit in Cash Entry'
                            : undefined
                        }
                      >
                        {row.paid ? formatCurrency(row.paid) : '—'}
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-medium ${
                          row.less > 0
                            ? 'text-red-600 hover:text-red-800 underline underline-offset-2 decoration-red-300 cursor-pointer'
                            : 'text-primary-400'
                        }`}
                        onClick={(e) => {
                          if (row.less > 0 || row.kind === 'payment' || row.transactionId) {
                            e.stopPropagation();
                            openCashEntry(row);
                          }
                        }}
                        onDoubleClick={(e) => {
                          if (row.less > 0 || row.kind === 'payment' || row.transactionId) {
                            e.stopPropagation();
                            openCashEntry(row);
                          }
                        }}
                        title={row.less > 0 ? 'Click less amount to edit in Cash Entry' : undefined}
                      >
                        {row.less ? formatCurrency(row.less) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-bold text-primary-800">
                        {formatCurrency(row.balance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-accent-50 border-t border-primary-200 font-semibold text-sm">
                  <td className="px-3 py-2.5 font-bold text-primary-800" colSpan={2}>
                    Total
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-primary-800">
                    {formatCurrency(data.totals.sale)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-primary-800">
                    {formatCurrency(data.totals.paid)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-primary-600">
                    {formatCurrency(data.totals.less)}
                    <span className="block text-[11px] font-normal text-primary-400">
                      record only
                    </span>
                  </td>
                  <td className="px-3 py-2.5" />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="px-3.5 py-2.5 bg-accent-50 border-t border-primary-200 flex items-center justify-between gap-2 text-sm">
            <span className="text-primary-600 font-semibold">Closing</span>
            <span className="font-bold text-accent-700 text-base tabular-nums">
              {formatCurrency(data.closingBalance)}
            </span>
          </div>
          <p className="px-3.5 py-2 text-xs text-primary-400">
            Less is shown as a record and is not included in total paid. Click a row to open that
            day's sales bill.
          </p>
        </div>
      )}
    </div>
  );
}
