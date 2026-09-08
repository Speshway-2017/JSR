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
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, vendors]);

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
          const party = tx.customer || tx.vendor;
          const pId = tx.customer?._id || tx.customer || tx.vendor?._id || tx.vendor || '';
          const partyType = tx.customer ? 'Customer' : tx.vendor ? 'Vendor' : '—';
          const dt = new Date(tx.entryDate || tx.createdAt);
          const dateStr = dt.toISOString().slice(0, 10);
          return {
            id: tx._id,
            date: dt,
            dateStr,
            partyId: String(pId),
            partyName: party?.name || '—',
            partyNameTelugu: party?.nameTelugu || '',
            partyType,
            cashSide: tx.cashSide || 'credit',
            paymentType: tx.paymentType || 'Cash',
            amount: Math.max(0, (Number(tx.amount) || 0) - lessAmount),
            lessAmount: lessAmount,
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
    const closingBalance = openingBalance + totalCredit - totalDebit;
    return {
      count: filteredEntries.length,
      openingBalance,
      totalLess,
      totalCredit,
      totalDebit,
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
      'Less (₹)': summary.totalLess,
      'Credit (₹)': summary.totalCredit,
      'Debit (₹)': summary.totalDebit,
    });
    sheetRows.push({
      'Date & Time': 'CLOSING BALANCE',
      Name: '',
      Type: '',
      'Type of Payment': '',
      'Less (₹)': '',
      'Credit (₹)': summary.closingBalance > 0 ? summary.closingBalance : 0,
      'Debit (₹)': summary.closingBalance < 0 ? Math.abs(summary.closingBalance) : 0,
    });

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cash Checklist');
    XLSX.writeFile(wb, `cash_checklist_${startDate}_to_${endDate}.xlsx`);
  };

  const handlePrint = async () => {
    if (!filteredEntries.length && summary.openingBalance === 0) return;
    const previewTab = openBillPreviewTab();

    const openBalRow = `
      <tr style="background: #f0fdf4; font-weight: 600;">
        <td>—</td>
        <td>As of ${formatDateOnly(startDate)}</td>
        <td><strong>Opening Balance</strong></td>
        <td>—</td>
        <td>—</td>
        <td style="text-align: right;">—</td>
        <td style="text-align: right; color: #15803d;">${summary.openingBalance > 0 ? formatCurrency(summary.openingBalance) : '—'}</td>
        <td style="text-align: right; color: #1d4ed8;">${summary.openingBalance < 0 ? formatCurrency(Math.abs(summary.openingBalance)) : '—'}</td>
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
        <td style="text-align: right; color: #b45309;">${e.lessAmount > 0 ? formatCurrency(e.lessAmount) : '—'}</td>
        <td style="text-align: right; font-weight: 700; color: #15803d;">${e.cashSide === 'credit' ? formatCurrency(e.amount) : '—'}</td>
        <td style="text-align: right; font-weight: 700; color: #1d4ed8;">${e.cashSide === 'debit' ? formatCurrency(e.amount) : '—'}</td>
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
    .preview-toolbar button.primary { background: #166534; border-color: #166534; color: #fff; font-weight: 600; }
    .container { max-width: 850px; margin: 20px auto; padding: 0 16px; }
    h2 { margin: 0 0 4px; font-size: 20px; color: #166534; }
    .sub { font-size: 13px; color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
    th, td { border: 1px solid #e4e4e7; padding: 8px 12px; text-align: left; }
    th { background: #f4f4f5; font-weight: 600; }
    .total-row td { background: #f0fdf4; font-weight: 700; font-size: 14px; }
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
          <th style="text-align: right;">Less (₹)</th>
          <th style="text-align: right;">Credit (₹)</th>
          <th style="text-align: right;">Debit (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${openBalRow}
        ${rowsHtml}
        <tr class="total-row">
          <td colspan="5" style="text-align: right;">Period Total (${summary.count} records):</td>
          <td style="text-align: right; color: #b45309;">${formatCurrency(summary.totalLess)}</td>
          <td style="text-align: right; color: #15803d;">${formatCurrency(summary.totalCredit)}</td>
          <td style="text-align: right; color: #1d4ed8;">${formatCurrency(summary.totalDebit)}</td>
        </tr>
        <tr class="total-row" style="background: #e0f2fe; font-size: 15px;">
          <td colspan="6" style="text-align: right; font-weight: 800;">Closing Balance:</td>
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
  const hasRows = !loading && !dateError && filteredEntries.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Cash Checklist</h1>
          <p className="text-primary-400 text-sm mt-0.5">
            Filter by name, date range or side
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            disabled={!filteredEntries.length}
            className="btn-secondary !py-2 !px-4 !text-sm disabled:opacity-50 flex items-center gap-1.5"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={!filteredEntries.length}
            className="btn-primary !py-2 !px-4 !text-sm disabled:opacity-50 flex items-center gap-1.5"
          >
            <Download className="w-4 h-4" /> Export Excel
          </button>
        </div>
      </div>

      <div className="card !p-3 sm:!p-4">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
          <div className="flex items-center gap-2">
            <label className="text-xs text-primary-400 w-9">From</label>
            <input
              type="date"
              className="input-field !py-2 !text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-primary-400 w-9">To</label>
            <input
              type="date"
              className="input-field !py-2 !text-sm"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <select
            className="input-field !py-2 !text-sm min-w-[140px] flex-1 sm:flex-none sm:w-48"
            value={partyId}
            onChange={(e) => setPartyId(e.target.value)}
            title="Name wise"
          >
            <option value="">All names</option>
            {partiesOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.type})
              </option>
            ))}
          </select>
          <select
            className="input-field !py-2 !text-sm min-w-[120px] flex-1 sm:flex-none sm:w-36"
            value={cashSideFilter}
            onChange={(e) => setCashSideFilter(e.target.value)}
            title="Side wise"
          >
            <option value="">All sides</option>
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
          </select>
          <select
            className="input-field !py-2 !text-sm min-w-[140px] flex-1 sm:flex-none sm:w-44"
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
        {dateError && (
          <p className="text-xs text-red-500 mt-2">From date must be on or before To date</p>
        )}
      </div>

      {hasRows && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3">
          <div className="card !py-3 !px-3 sm:!px-4 flex items-center justify-between">
            <span className="text-xs text-primary-400">Opening Balance</span>
            <span className="font-semibold text-sky-700">{formatCurrency(summary.openingBalance)}</span>
          </div>
          <div className="card !py-3 !px-3 sm:!px-4 flex items-center justify-between">
            <span className="text-xs text-primary-400">Total Credit</span>
            <span className="font-semibold text-emerald-700">{formatCurrency(summary.totalCredit)}</span>
          </div>
          <div className="card !py-3 !px-3 sm:!px-4 flex items-center justify-between">
            <span className="text-xs text-primary-400">Total Debit</span>
            <span className="font-semibold text-blue-700">{formatCurrency(summary.totalDebit)}</span>
          </div>
          <div className="card !py-3 !px-3 sm:!px-4 flex items-center justify-between">
            <span className="text-xs text-primary-400">Total Less</span>
            <span className="font-semibold text-amber-700">{formatCurrency(summary.totalLess)}</span>
          </div>
          <div className="card !py-3 !px-3 sm:!px-4 flex items-center justify-between bg-emerald-50/50 border-emerald-200">
            <span className="text-xs text-emerald-800 font-medium">Closing Balance</span>
            <span className="font-bold text-emerald-800 text-sm sm:text-base">{formatCurrency(summary.closingBalance)}</span>
          </div>
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-primary-400 text-sm">Loading cash entries...</div>
        ) : dateError ? (
          <div className="text-center py-12 text-red-500 text-sm">Fix the date range</div>
        ) : !filteredEntries.length && summary.openingBalance === 0 ? (
          <div className="text-center py-12">
            <FileBarChart className="w-10 h-10 text-primary-300 mx-auto mb-2" />
            <p className="text-primary-400 text-sm">No cash entries for this filter</p>
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-primary-100">
              <div className="px-4 py-3 bg-sky-50 flex justify-between text-xs font-semibold text-sky-800">
                <span>Opening Balance (as of {formatDateOnly(startDate)})</span>
                <span>{formatCurrency(summary.openingBalance)}</span>
              </div>
              {filteredEntries.map((row) => (
                <div key={row.id} className="px-4 py-3">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-primary-700">
                        {row.partyName}
                        {row.partyNameTelugu && (
                          <span className="text-xs text-primary-400 font-normal ml-1">
                            ({row.partyNameTelugu})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-primary-400">{formatDate(row.date)}</p>
                      <p className="text-xs text-primary-500 mt-1">
                        {row.partyType} · {row.paymentType || 'Cash'} ({row.cashSide === 'credit' ? 'Credit' : 'Debit'})
                      </p>
                      {row.lessAmount > 0 && (
                        <p className="text-xs text-amber-700 font-medium">
                          Less: {formatCurrency(row.lessAmount)}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {row.cashSide === 'credit' ? (
                        <p className="font-bold text-emerald-700">
                          Credit: {formatCurrency(row.amount)}
                        </p>
                      ) : (
                        <p className="font-bold text-blue-700">
                          Debit: {formatCurrency(row.amount)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 bg-emerald-100 flex justify-between text-sm font-bold text-emerald-900">
                <span>Closing Balance</span>
                <span>{formatCurrency(summary.closingBalance)}</span>
              </div>
            </div>

            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-primary-50/80 border-b border-primary-100">
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide">
                      Date & Time
                    </th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide">
                      Name
                    </th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide">
                      Type
                    </th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide">
                      Type of Payment
                    </th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide text-right">
                      Less
                    </th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide text-right">
                      Credit
                    </th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide text-right">
                      Debit
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-primary-100 text-sm">
                  {/* Opening Balance Row */}
                  <tr className="bg-sky-50/60 font-semibold border-b border-sky-100">
                    <td className="py-2.5 px-4 text-sky-800 whitespace-nowrap text-xs">
                      As of {formatDateOnly(startDate)}
                    </td>
                    <td className="py-2.5 px-4 text-sky-900 font-bold">
                      Opening Balance
                    </td>
                    <td className="py-2.5 px-4 text-sky-700 font-medium">
                      —
                    </td>
                    <td className="py-2.5 px-4 text-sky-700 font-medium">
                      —
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 text-right">
                      —
                    </td>
                    <td className="py-2.5 px-4 text-emerald-700 text-right tabular-nums font-bold">
                      {summary.openingBalance > 0 ? formatCurrency(summary.openingBalance) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-blue-700 text-right tabular-nums font-bold">
                      {summary.openingBalance < 0 ? formatCurrency(Math.abs(summary.openingBalance)) : '—'}
                    </td>
                  </tr>

                  {filteredEntries.map((row) => (
                    <tr key={row.id} className="hover:bg-primary-50/40">
                      <td className="py-2.5 px-4 text-primary-600 whitespace-nowrap">
                        {formatDate(row.date)}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-primary-800">
                        {row.partyName}
                        {row.partyNameTelugu && (
                          <span className="text-xs text-primary-400 font-normal ml-1">
                            ({row.partyNameTelugu})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-primary-600 font-medium">
                        {row.partyType}
                      </td>
                      <td className="py-2.5 px-4 text-primary-600 font-medium">
                        {row.paymentType || 'Cash'}
                      </td>
                      <td className="py-2.5 px-4 text-amber-700 text-right tabular-nums font-medium">
                        {row.lessAmount > 0 ? formatCurrency(row.lessAmount) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-emerald-700 text-right tabular-nums font-bold">
                        {row.cashSide === 'credit' ? formatCurrency(row.amount) : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-blue-700 text-right tabular-nums font-bold">
                        {row.cashSide === 'debit' ? formatCurrency(row.amount) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-primary-50 border-t-2 border-primary-200">
                    <td colSpan={4} className="py-2.5 px-4 text-sm font-bold text-primary-800">
                      Period Total ({summary.count} records)
                    </td>
                    <td className="py-2.5 px-4 text-sm font-bold text-amber-700 text-right">
                      {formatCurrency(summary.totalLess)}
                    </td>
                    <td className="py-2.5 px-4 text-sm font-bold text-emerald-700 text-right">
                      {formatCurrency(summary.totalCredit)}
                    </td>
                    <td className="py-2.5 px-4 text-sm font-bold text-blue-700 text-right">
                      {formatCurrency(summary.totalDebit)}
                    </td>
                  </tr>
                  <tr className="bg-emerald-100/80 border-t-2 border-emerald-300">
                    <td colSpan={5} className="py-3 px-4 text-base font-extrabold text-emerald-950">
                      Closing Balance
                    </td>
                    <td colSpan={2} className="py-3 px-4 text-base font-extrabold text-emerald-900 text-right tabular-nums">
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
