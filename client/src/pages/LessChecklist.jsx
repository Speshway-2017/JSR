import { useEffect, useState, useCallback, useMemo } from 'react';
import { FileBarChart, Download, Printer } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../api';
import { formatCurrency, formatDate } from '../utils/format';
import { useDataRestored } from '../utils/useDataRestored';
import { openBillPreviewTab, writeToPrintWindow } from '../utils/raituBillShared';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function LessChecklist() {
  const today = todayInputValue();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [partyId, setPartyId] = useState('');
  const [cashSideFilter, setCashSideFilter] = useState('');
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
        params: { startDate, endDate },
      });
      const raw = res.data || [];
      const parsed = raw
        .map((tx) => {
          const lessAmount = Number(tx.lessAmount) || 0;
          const party = tx.customer || tx.vendor;
          const pId = tx.customer?._id || tx.customer || tx.vendor?._id || tx.vendor || '';
          const partyType = tx.customer ? 'Customer' : tx.vendor ? 'Vendor' : '—';
          return {
            id: tx._id,
            date: tx.entryDate || tx.createdAt,
            partyId: String(pId),
            partyName: party?.name || '—',
            partyNameTelugu: party?.nameTelugu || '',
            partyType,
            cashSide: tx.cashSide || 'credit',
            lessAmount,
          };
        })
        .filter((item) => item.lessAmount > 0);
      setAllEntries(parsed);
    } catch {
      setAllEntries([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  useDataRestored(fetchEntries);

  const filteredEntries = useMemo(() => {
    return allEntries.filter((item) => {
      if (partyId && item.partyId !== partyId) return false;
      if (cashSideFilter && item.cashSide !== cashSideFilter) return false;
      return true;
    });
  }, [allEntries, partyId, cashSideFilter]);

  const summary = useMemo(() => {
    const totalLess = filteredEntries.reduce((sum, item) => sum + item.lessAmount, 0);
    return {
      count: filteredEntries.length,
      totalLess,
    };
  }, [filteredEntries]);

  const exportExcel = () => {
    if (!filteredEntries.length) return;

    const sheetRows = filteredEntries.map((item) => ({
      'Date & Time': formatDate(item.date),
      Name: item.partyName,
      Type: `${item.partyType} (${item.cashSide === 'credit' ? 'Credit' : 'Debit'})`,
      'Less Amount (₹)': item.lessAmount,
    }));

    sheetRows.push({});
    sheetRows.push({
      'Date & Time': 'TOTAL',
      Name: '',
      Type: `Records: ${summary.count}`,
      'Less Amount (₹)': summary.totalLess,
    });

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = [{ wch: 22 }, { wch: 24 }, { wch: 20 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Less Checklist');
    XLSX.writeFile(wb, `less_checklist_${startDate}_to_${endDate}.xlsx`);
  };

  const handlePrint = async () => {
    if (!filteredEntries.length) return;
    const previewTab = openBillPreviewTab();
    const rowsHtml = filteredEntries
      .map(
        (e, i) => `<tr>
        <td>${i + 1}</td>
        <td>${formatDate(e.date)}</td>
        <td><strong>${e.partyName}</strong>${e.partyNameTelugu ? ` (${e.partyNameTelugu})` : ''}</td>
        <td>${e.partyType} (${e.cashSide === 'credit' ? 'Credit' : 'Debit'})</td>
        <td style="text-align: right; font-weight: 700; color: #c2410c;">${formatCurrency(e.lessAmount)}</td>
      </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="te">
<head>
  <meta charset="utf-8" />
  <title>Less Checklist</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; background: #fff; color: #111; }
    .preview-toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 10px; padding: 10px 16px; background: #f4f4f5; border-bottom: 1px solid #e4e4e7; }
    .preview-toolbar button { font: inherit; padding: 8px 16px; cursor: pointer; border-radius: 6px; border: 1px solid #d4d4d8; background: #fff; }
    .preview-toolbar button.primary { background: #166534; border-color: #166534; color: #fff; font-weight: 600; }
    .container { max-width: 800px; margin: 20px auto; padding: 0 16px; }
    h2 { margin: 0 0 4px; font-size: 20px; color: #c2410c; }
    .sub { font-size: 13px; color: #666; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 12px; }
    th, td { border: 1px solid #e4e4e7; padding: 8px 12px; text-align: left; }
    th { background: #f4f4f5; font-weight: 600; }
    .total-row td { background: #fff7ed; font-weight: 700; font-size: 14px; }
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
    <h2>Less Checklist</h2>
    <div class="sub">Period: ${startDate} to ${endDate} | Total Records: ${summary.count}</div>
    <table>
      <thead>
        <tr>
          <th style="width: 50px;">S No</th>
          <th>Date & Time</th>
          <th>Name</th>
          <th>Type</th>
          <th style="text-align: right;">Less Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
        <tr class="total-row">
          <td colspan="4" style="text-align: right;">Total Less Amount:</td>
          <td style="text-align: right; color: #c2410c;">${formatCurrency(summary.totalLess)}</td>
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
    <div className="space-y-3 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="page-title text-2xl font-bold text-primary-700">Less Checklist</h1>
          <p className="text-xs text-primary-500 mt-1">
            Filter discount & less entries by party, date range or side
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            disabled={!filteredEntries.length}
            className="btn-primary !py-1.5 !px-3 !text-sm font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs disabled:opacity-50"
          >
            <Printer className="w-4 h-4" /> Print
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={!filteredEntries.length}
            className="btn-secondary !py-1.5 !px-3 !text-sm font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-primary-600" /> Export Excel
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card !p-3.5 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
        </div>
        {dateError && (
          <p className="text-xs text-red-500 mt-1">From date must be on or before To date</p>
        )}
      </div>

      {/* Summary KPI Strip */}
      {hasRows && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card !py-2.5 !px-3.5 flex items-center justify-between border border-primary-200">
            <span className="text-xs font-semibold text-primary-600">Total Entries</span>
            <span className="font-bold text-primary-800 text-sm tabular-nums">{summary.count}</span>
          </div>
          <div className="card !py-2.5 !px-3.5 flex items-center justify-between border border-primary-200">
            <span className="text-xs font-semibold text-primary-600">Total Less Amount</span>
            <span className="font-bold text-amber-700 text-base tabular-nums">
              {formatCurrency(summary.totalLess)}
            </span>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="card !p-0 overflow-hidden border border-primary-200">
        {loading ? (
          <div className="text-center py-12 text-primary-400 text-sm">Loading less entries...</div>
        ) : dateError ? (
          <div className="text-center py-12 text-red-500 text-sm">Fix the date range</div>
        ) : !filteredEntries.length ? (
          <div className="text-center py-12">
            <FileBarChart className="w-8 h-8 text-primary-300 mx-auto mb-1.5" />
            <p className="text-primary-400 text-sm">No less entries for this filter</p>
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-primary-100 text-sm">
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
                        {row.partyType} · {row.cashSide === 'credit' ? 'Credit' : 'Debit'}
                      </p>
                    </div>
                    <p className="font-bold text-amber-700 text-sm shrink-0 tabular-nums">
                      {formatCurrency(row.lessAmount)}
                    </p>
                  </div>
                </div>
              ))}
              <div className="px-3.5 py-2.5 bg-accent-50 border-t border-primary-200 flex justify-between text-sm font-semibold text-primary-800">
                <span>Total</span>
                <span className="font-bold tabular-nums text-amber-700">
                  {formatCurrency(summary.totalLess)}
                </span>
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
                    <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide w-40">
                      Type / Side
                    </th>
                    <th className="px-3 py-2 text-xs font-semibold text-primary-700 uppercase tracking-wide text-right w-36">
                      Less Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
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
                      <td className="px-3 py-2 text-primary-600 text-xs font-medium">
                        {row.partyType} · {row.cashSide === 'credit' ? 'Credit' : 'Debit'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-700 font-bold text-xs">
                        {formatCurrency(row.lessAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-accent-50 border-t border-primary-200 font-semibold text-sm">
                    <td colSpan={3} className="px-3 py-2.5 text-primary-800 font-bold">
                      Total ({summary.count} records)
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-bold text-amber-700 text-sm">
                      {formatCurrency(summary.totalLess)}
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
