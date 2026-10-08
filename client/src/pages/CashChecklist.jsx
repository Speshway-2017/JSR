import { useEffect, useState, useCallback, useMemo } from 'react';
import { FileBarChart, Download, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../api';
import { formatCurrency, formatDate, formatDateOnly } from '../utils/format';
import { useDataRestored } from '../utils/useDataRestored';
import { openBillPreviewTab, writeToPrintWindow } from '../utils/raituBillShared';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function CashChecklist() {
  const today = todayInputValue();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [partyId, setPartyId] = useState('');
  const [cashSideFilter, setCashSideFilter] = useState('');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState('');
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [allEntries, setAllEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/customers'), api.get('/vendors')]).then(([c, v]) => {
      setCustomers(c.data || []);
      setVendors(v.data || []);
    });
  }, []);

  const partiesOptions = useMemo(() => {
    const list = [
      ...customers.map((c) => ({ id: c._id, name: c.name, type: 'Customer' })),
      ...vendors.map((v) => ({ id: v._id, name: v.name, type: 'Vendor' })),
    ];
    const hasCash = allEntries.some((e) => e.partyId === 'cash' || e.partyType === 'Cash Sale');
    if (hasCash) {
      list.unshift({ id: 'cash', name: 'Cash', type: 'Cash Sale' });
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, vendors, allEntries]);

  const fetchEntries = useCallback(async () => {
    if (startDate > endDate) return;
    setLoading(true);
    try {
      const res = await api.get('/transactions/cash-entries', {
        params: { endDate },
      });
      const raw = res.data || [];
      const parsed = raw
        .map((tx) => {
          const lessAmount = Number(tx.lessAmount) || 0;
          const isCashSale = !tx.customer && !tx.vendor;
          const party = tx.customer || tx.vendor;
          const pId = tx.customer?._id || tx.customer || tx.vendor?._id || tx.vendor || (isCashSale ? 'cash' : '');
          const partyName = party?.name || (isCashSale || tx.description?.toLowerCase().includes('cash') ? 'Cash' : '—');
          const partyNameTelugu = party?.nameTelugu || (isCashSale ? 'నగదు' : '');
          const partyType = tx.customer ? 'Customer' : tx.vendor ? 'Vendor' : 'Cash Sale';
          const dt = new Date(tx.entryDate || tx.createdAt);
          const dateStr = dt.toISOString().slice(0, 10);
          return {
            id: tx._id,
            date: dt,
            dateStr,
            partyId: String(pId),
            partyName,
            partyNameTelugu,
            partyType,
            cashSide: tx.cashSide || 'credit',
            paymentType: tx.paymentType || 'Cash',
            amount: Math.max(0, (Number(tx.amount) || 0) - lessAmount),
            lessAmount: lessAmount,
            reason: tx.reason || (isCashSale ? 'Direct Cash Sale' : ''),
          };
        })
        .filter((item) => item.amount > 0 || item.lessAmount > 0);
      setAllEntries(parsed);
    } catch {
      setAllEntries([]);
    } finally {
      setLoading(false);
    }
  }, [endDate]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useDataRestored(fetchEntries);

  const { filteredEntries, openingBalance } = useMemo(() => {
    let openBal = 0;
    const periodList = [];

    allEntries.forEach((item) => {
      if (partyId && item.partyId !== partyId) return;
      if (cashSideFilter && item.cashSide !== cashSideFilter) return;
      if (paymentTypeFilter && item.paymentType !== paymentTypeFilter) return;

      if (item.dateStr < startDate) {
        if (item.cashSide === 'credit') {
          openBal += item.amount;
        } else if (item.cashSide === 'debit') {
          openBal -= item.amount;
        }
      } else if (item.dateStr <= endDate) {
        periodList.push(item);
      }
    });

    return { filteredEntries: periodList, openingBalance: openBal };
  }, [allEntries, startDate, endDate, partyId, cashSideFilter, paymentTypeFilter]);

  const summary = useMemo(() => {
    let totalLess = 0;
    let totalCredit = 0;
    let totalDebit = 0;
    filteredEntries.forEach((item) => {
      totalLess += item.lessAmount || 0;
      if (item.cashSide === 'credit') {
        totalCredit += item.amount;
      } else if (item.cashSide === 'debit') {
        totalDebit += item.amount;
      }
    });
    const totalCashCollected = totalCredit;
    const closingBalance = openingBalance + totalCredit - totalDebit;
    return {
      count: filteredEntries.length,
      openingBalance,
      totalLess,
      totalCredit,
      totalDebit,
      totalCashCollected,
      closingBalance,
    };
  }, [filteredEntries, openingBalance]);

  const exportExcel = () => {
    if (!filteredEntries.length && summary.openingBalance === 0) return;

    const sheetRows = [];

    // Opening balance row
    sheetRows.push({
      'Date & Time': `As of ${formatDateOnly(startDate)}`,
      Name: 'Opening Balance',
      Type: '—',
      'Type of Payment': '—',
      Reason: '—',
      'Less (₹)': 0,
      'Credit (₹)': summary.openingBalance > 0 ? summary.openingBalance : 0,
      'Debit (₹)': summary.openingBalance < 0 ? Math.abs(summary.openingBalance) : 0,
    });

    filteredEntries.forEach((item) => {
      sheetRows.push({
        'Date & Time': formatDate(item.date),
        Name: item.partyName,
        Type: item.partyType,
        'Type of Payment': item.paymentType || 'Cash',
        Reason: item.reason || '—',
        'Less (₹)': item.lessAmount > 0 ? item.lessAmount : 0,
        'Credit (₹)': item.cashSide === 'credit' ? item.amount : 0,
        'Debit (₹)': item.cashSide === 'debit' ? item.amount : 0,
      });
    });

    sheetRows.push({});
    sheetRows.push({
      'Date & Time': 'PERIOD TOTAL',
      Name: '',
      Type: `Records: ${summary.count}`,
      'Type of Payment': '',
      Reason: '',
      'Less (₹)': summary.totalLess,
      'Credit (₹)': summary.totalCredit,
      'Debit (₹)': summary.totalDebit,
    });
    sheetRows.push({
      'Date & Time': 'TOTAL CASH COLLECTED',
      Name: '',
      Type: '',
      'Type of Payment': '',
      Reason: '',
      'Less (₹)': '',
      'Credit (₹)': summary.totalCashCollected,
      'Debit (₹)': '',
    });
    sheetRows.push({
      'Date & Time': 'CLOSING BALANCE',
      Name: '',
      Type: '',
      'Type of Payment': '',
      Reason: '',
      'Less (₹)': '',
      'Credit (₹)': summary.closingBalance > 0 ? summary.closingBalance : 0,
      'Debit (₹)': summary.closingBalance < 0 ? Math.abs(summary.closingBalance) : 0,
    });

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cash Checklist');
    XLSX.writeFile(wb, `cash_checklist_${startDate}_to_${endDate}.xlsx`);
  };

  const handlePrint = async () => {
    if (!filteredEntries.length && summary.openingBalance === 0) return;
    const previewTab = openBillPreviewTab();

    const openBalRow = `
      <tr style="background: #f4f7f5; font-weight: 600;">
        <td>—</td>
        <td>As of ${formatDateOnly(startDate)}</td>
        <td><strong>Opening Balance</strong></td>
        <td>—</td>
        <td>—</td>
        <td>—</td>
        <td style="text-align: right;">—</td>
        <td style="text-align: right; color: #2f3b33;">${summary.openingBalance > 0 ? formatCurrency(summary.openingBalance) : '—'}</td>
        <td style="text-align: right; color: #6d5c47;">${summary.openingBalance < 0 ? formatCurrency(Math.abs(summary.openingBalance)) : '—'}</td>
      </tr>
    `;

    const rowsHtml = filteredEntries
      .map(
        (e, i) => `<tr>
        <td>${i + 1}</td>
        <td>${formatDate(e.date)}</td>
        <td><strong>${e.partyName}</strong>${e.partyNameTelugu ? ` (${e.partyNameTelugu})` : ''}</td>
        <td>${e.partyType}</td>
        <td>${e.paymentType || 'Cash'}</td>
        <td>${e.reason || '—'}</td>
        <td style="text-align: right; color: #b45309;">${e.lessAmount > 0 ? formatCurrency(e.lessAmount) : '—'}</td>
        <td style="text-align: right; font-weight: 700; color: #2f3b33;">${e.cashSide === 'credit' ? formatCurrency(e.amount) : '—'}</td>
        <td style="text-align: right; font-weight: 700; color: #6d5c47;">${e.cashSide === 'debit' ? formatCurrency(e.amount) : '—'}</td>
      </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="te">
<head>
  <meta charset="utf-8" />
  <title>Cash Checklist</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; background: #fff; color: #111; }
    .preview-toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 10px; padding: 10px 16px; background: #f4f4f5; border-bottom: 1px solid #e4e4e7; }
    .preview-toolbar button { font: inherit; padding: 8px 16px; cursor: pointer; border-radius: 6px; border: 1px solid #d4d4d8; background: #fff; }
    .preview-toolbar button.primary { background: #3d4d42; border-color: #3d4d42; color: #fff; font-weight: 600; }
    .container { max-width: 850px; margin: 20px auto; padding: 0 16px; }
    h2 { margin: 0 0 4px; font-size: 20px; color: #2f3b33; }
    .sub { font-size: 13px; color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
    th, td { border: 1px solid #e4e4e7; padding: 8px 12px; text-align: left; }
    th { background: #f4f7f5; font-weight: 600; }
    .total-row td { background: #f4f7f5; font-weight: 700; font-size: 14px; }
    @media print {
      .preview-toolbar { display: none !important; }
      .container { margin: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="preview-toolbar">
    <button type="button" onclick="window.close()">Close</button>
    <button type="button" class="primary" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="container">
    <h2>Cash Checklist</h2>
    <div class="sub">Period: ${startDate} to ${endDate} | Total Records: ${summary.count}</div>
    <table>
      <thead>
        <tr>
          <th style="width: 40px;">S No</th>
          <th>Date & Time</th>
          <th>Name</th>
          <th>Type</th>
          <th>Type of Payment</th>
          <th>Reason</th>
          <th style="text-align: right;">Less (₹)</th>
          <th style="text-align: right;">Credit (₹)</th>
          <th style="text-align: right;">Debit (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${openBalRow}
        ${rowsHtml}
        <tr class="total-row">
          <td colspan="6" style="text-align: right;">Period Total (${summary.count} records):</td>
          <td style="text-align: right; color: #b45309;">${formatCurrency(summary.totalLess)}</td>
          <td style="text-align: right; color: #15803d;">${formatCurrency(summary.totalCredit)}</td>
          <td style="text-align: right; color: #1d4ed8;">${formatCurrency(summary.totalDebit)}</td>
        </tr>
        <tr class="total-row" style="background: #f0fdf4; font-size: 14px;">
          <td colspan="7" style="text-align: right; font-weight: 700; color: #15803d;">Total Cash Collected:</td>
          <td colspan="2" style="text-align: right; font-weight: 800; color: #15803d;">${formatCurrency(summary.totalCashCollected)}</td>
        </tr>
        <tr class="total-row" style="background: #e0f2fe; font-size: 15px;">
          <td colspan="7" style="text-align: right; font-weight: 800;">Closing Balance:</td>
          <td colspan="2" style="text-align: right; font-weight: 800; color: #0369a1;">${formatCurrency(summary.closingBalance)}</td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`;
    writeToPrintWindow(html, previewTab);
  };

  const dateError = startDate > endDate;
  const hasRows = !loading && !dateError && (filteredEntries.length > 0 || summary.openingBalance !== 0);

  return (
    <div className="space-y-3 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="page-title text-2xl font-bold text-primary-700">Cash Checklist</h1>
          <p className="text-xs text-primary-500 mt-1">
            Filter cash received / paid transactions by party, date range or side
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            disabled={!filteredEntries.length && summary.openingBalance === 0}
            className="btn-primary !py-1.5 !px-3 !text-sm font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs disabled:opacity-50"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={!filteredEntries.length && summary.openingBalance === 0}
            className="btn-secondary !py-1.5 !px-3 !text-sm font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-primary-600" /> Export Excel
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card !p-3.5 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">
              From *
            </label>
            <input
              type="date"
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">
              To *
            </label>
            <input
              type="date"
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">
              Party
            </label>
            <select
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition truncate"
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              title="Name wise"
            >
              <option value="">All names ({partiesOptions.length})</option>
              {partiesOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.type})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">
              Side
            </label>
            <select
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition truncate"
              value={cashSideFilter}
              onChange={(e) => setCashSideFilter(e.target.value)}
              title="Side wise"
            >
              <option value="">All sides</option>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">
              Payment Type
            </label>
            <select
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition truncate"
              value={paymentTypeFilter}
              onChange={(e) => setPaymentTypeFilter(e.target.value)}
              title="Type of Payment"
            >
              <option value="">All payment types</option>
              <option value="Cash">Cash</option>
              <option value="PhonePe">PhonePe</option>
              <option value="Google Pay">Google Pay</option>
              <option value="Card">Card</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Other">Other</option>
            </select>
          </div>
        </div>
        {dateError && (
          <p className="text-xs text-red-500 mt-1">From date must be on or before To date</p>
        )}
      </div>

      {/* Summary KPI Strip */}
      {hasRows && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          <div className="card !py-2.5 !px-3.5 flex flex-col justify-between border border-primary-200 bg-surface shadow-2xs">
            <span className="text-[11px] font-semibold text-primary-500 uppercase tracking-wider truncate">
              Opening
            </span>
            <span className="text-sm md:text-base font-bold text-primary-800 tabular-nums whitespace-nowrap mt-1">
              {formatCurrency(summary.openingBalance)}
            </span>
          </div>
          <div className="card !py-2.5 !px-3.5 flex flex-col justify-between border border-primary-300 bg-primary-50/70 shadow-2xs">
            <span className="text-[11px] font-bold text-primary-800 uppercase tracking-wider truncate">
              Total Collected
            </span>
            <span className="text-sm md:text-base font-bold text-primary-900 tabular-nums whitespace-nowrap mt-1">
              {formatCurrency(summary.totalCashCollected)}
            </span>
          </div>
          <div className="card !py-2.5 !px-3.5 flex flex-col justify-between border border-primary-200 bg-surface shadow-2xs">
            <span className="text-[11px] font-semibold text-primary-500 uppercase tracking-wider truncate">
              Credit
            </span>
            <span className="text-sm md:text-base font-bold text-primary-800 tabular-nums whitespace-nowrap mt-1">
              {formatCurrency(summary.totalCredit)}
            </span>
          </div>
          <div className="card !py-2.5 !px-3.5 flex flex-col justify-between border border-primary-200 bg-surface shadow-2xs">
            <span className="text-[11px] font-semibold text-primary-500 uppercase tracking-wider truncate">
              Debit
            </span>
            <span className="text-sm md:text-base font-bold text-primary-800 tabular-nums whitespace-nowrap mt-1">
              {formatCurrency(summary.totalDebit)}
            </span>
          </div>
          <div className="card !py-2.5 !px-3.5 flex flex-col justify-between border border-primary-200 bg-surface shadow-2xs">
            <span className="text-[11px] font-semibold text-primary-500 uppercase tracking-wider truncate">
              Less
            </span>
            <span className="text-sm md:text-base font-bold text-accent-700 tabular-nums whitespace-nowrap mt-1">
              {formatCurrency(summary.totalLess)}
            </span>
          </div>
          <div className="card !py-2.5 !px-3.5 flex flex-col justify-between border border-accent-300 bg-accent-100/70 shadow-2xs">
            <span className="text-[11px] font-bold text-accent-800 uppercase tracking-wider truncate">
              Closing
            </span>
            <span className="text-sm md:text-base font-bold text-accent-950 tabular-nums whitespace-nowrap mt-1">
              {formatCurrency(summary.closingBalance)}
            </span>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="card !p-0 overflow-hidden border border-primary-200">
        {loading ? (
          <div className="text-center py-12 text-primary-400 text-sm">Loading cash entries...</div>
        ) : dateError ? (
          <div className="text-center py-12 text-red-500 text-sm">Fix the date range</div>
        ) : !filteredEntries.length && summary.openingBalance === 0 ? (
          <div className="text-center py-12">
            <FileBarChart className="w-8 h-8 text-primary-300 mx-auto mb-1.5" />
            <p className="text-primary-400 text-sm">No cash entries for this filter</p>
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-primary-100 text-sm">
              <div className="px-3.5 py-2.5 bg-primary-50 flex justify-between text-sm font-semibold text-primary-800">
                <span>Opening Balance (as of {formatDateOnly(startDate)})</span>
                <span className="tabular-nums font-bold whitespace-nowrap">{formatCurrency(summary.openingBalance)}</span>
              </div>
              {filteredEntries.map((row) => (
                <div key={row.id} className="px-3.5 py-3 hover:bg-primary-50/40 transition">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-primary-800 text-sm">
                        {row.partyName}
                        {row.partyNameTelugu && (
                          <span className="text-xs text-primary-400 font-normal ml-1">
                            ({row.partyNameTelugu})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-primary-400 mt-0.5">{formatDate(row.date)}</p>
                      <p className="text-xs text-primary-500 mt-1">
                        {row.partyType} · {row.paymentType || 'Cash'} ({row.cashSide === 'credit' ? 'Credit' : 'Debit'})
                      </p>
                      {row.reason && (
                        <p className="text-xs text-primary-600 italic mt-0.5">
                          Reason: {row.reason}
                        </p>
                      )}
                      {row.lessAmount > 0 && (
                        <p className="text-xs text-accent-700 font-medium">
                          Less: {formatCurrency(row.lessAmount)}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {row.cashSide === 'credit' ? (
                        <p className="font-bold text-primary-800 text-sm tabular-nums whitespace-nowrap">
                          Credit: {formatCurrency(row.amount)}
                        </p>
                      ) : (
                        <p className="font-bold text-primary-700 text-sm tabular-nums whitespace-nowrap">
                          Debit: {formatCurrency(row.amount)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div className="px-3.5 py-2 bg-primary-50/80 border-t border-primary-200 flex justify-between text-sm font-semibold text-primary-800">
                <span>Total Cash Collected</span>
                <span className="tabular-nums font-bold whitespace-nowrap">{formatCurrency(summary.totalCashCollected)}</span>
              </div>
              <div className="px-3.5 py-2.5 bg-accent-100 border-t border-primary-200 flex justify-between text-sm font-bold text-accent-950">
                <span>Closing Balance</span>
                <span className="tabular-nums whitespace-nowrap">{formatCurrency(summary.closingBalance)}</span>
              </div>
            </div>

            {/* Desktop Table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-primary-50/80 text-left border-b border-primary-200">
                    <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide whitespace-nowrap">
                      Date & Time
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide">
                      Name
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide w-24">
                      Type
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide w-32">
                      Payment Type
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide min-w-[110px]">
                      Reason
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-right w-24">
                      Less
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-right w-28">
                      Credit
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-right w-28">
                      Debit
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Opening Balance Row */}
                  <tr className="bg-primary-50/70 font-semibold border-b border-primary-100">
                    <td className="px-3 py-2 text-primary-700 whitespace-nowrap text-xs font-medium">
                      As of {formatDateOnly(startDate)}
                    </td>
                    <td className="px-3 py-2 text-primary-900 font-bold text-xs">Opening Balance</td>
                    <td className="px-3 py-2 text-primary-600 font-medium text-xs">—</td>
                    <td className="px-3 py-2 text-primary-600 font-medium text-xs">—</td>
                    <td className="px-3 py-2 text-primary-600 font-medium text-xs">—</td>
                    <td className="px-3 py-2 text-primary-400 text-right text-xs">—</td>
                    <td className="px-3 py-2 text-primary-800 text-right tabular-nums font-bold text-xs whitespace-nowrap">
                      {summary.openingBalance > 0 ? formatCurrency(summary.openingBalance) : '—'}
                    </td>
                    <td className="px-3 py-2 text-primary-800 text-right tabular-nums font-bold text-xs whitespace-nowrap">
                      {summary.openingBalance < 0 ? formatCurrency(Math.abs(summary.openingBalance)) : '—'}
                    </td>
                  </tr>

                  {filteredEntries.map((row) => (
                    <tr key={row.id} className="border-b border-primary-100 hover:bg-primary-50/40 transition">
                      <td className="px-3 py-2 text-primary-600 whitespace-nowrap text-xs font-medium">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-3 py-2 font-semibold text-primary-800 text-xs">
                        {row.partyName}
                        {row.partyNameTelugu && (
                          <span className="text-xs text-primary-400 font-normal ml-1">
                            ({row.partyNameTelugu})
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-primary-600 text-xs font-medium">{row.partyType}</td>
                      <td className="px-3 py-2 text-primary-600 text-xs font-medium">{row.paymentType || 'Cash'}</td>
                      <td className="px-3 py-2 text-primary-600 text-xs max-w-[160px] truncate" title={row.reason}>
                        {row.reason || '—'}
                      </td>
                      <td className="px-3 py-2 text-accent-700 text-right tabular-nums text-xs font-semibold whitespace-nowrap">
                        {row.lessAmount > 0 ? formatCurrency(row.lessAmount) : '—'}
                      </td>
                      <td className="px-3 py-2 text-primary-800 text-right tabular-nums font-bold text-xs whitespace-nowrap">
                        {row.cashSide === 'credit' ? formatCurrency(row.amount) : '—'}
                      </td>
                      <td className="px-3 py-2 text-primary-700 text-right tabular-nums font-bold text-xs whitespace-nowrap">
                        {row.cashSide === 'debit' ? formatCurrency(row.amount) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-accent-50 border-t border-primary-200 font-semibold text-sm">
                    <td colSpan={5} className="px-3 py-2.5 font-bold text-primary-800">
                      Period Total ({summary.count} records)
                    </td>
                    <td className="px-3 py-2.5 text-accent-700 text-right tabular-nums font-bold text-sm whitespace-nowrap">
                      {formatCurrency(summary.totalLess)}
                    </td>
                    <td className="px-3 py-2.5 text-primary-800 text-right tabular-nums font-bold text-sm whitespace-nowrap">
                      {formatCurrency(summary.totalCredit)}
                    </td>
                    <td className="px-3 py-2.5 text-primary-700 text-right tabular-nums font-bold text-sm whitespace-nowrap">
                      {formatCurrency(summary.totalDebit)}
                    </td>
                  </tr>
                  <tr className="bg-primary-50/70 border-t border-primary-200 font-bold text-sm text-primary-900">
                    <td colSpan={6} className="px-3 py-2.5 font-bold uppercase tracking-wide">
                      Total Cash Collected
                    </td>
                    <td colSpan={2} className="px-3 py-2.5 text-right font-bold tabular-nums text-base text-primary-800 whitespace-nowrap">
                      {formatCurrency(summary.totalCashCollected)}
                    </td>
                  </tr>
                  <tr className="bg-accent-100/70 border-t border-primary-200 font-bold text-sm text-accent-900">
                    <td colSpan={6} className="px-3 py-2.5 font-bold uppercase tracking-wide">
                      Closing Balance
                    </td>
                    <td colSpan={2} className="px-3 py-2.5 text-right font-bold tabular-nums text-base text-accent-900 whitespace-nowrap">
                      {formatCurrency(summary.closingBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
