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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Less Checklist</h1>
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
        </div>
        {dateError && (
          <p className="text-xs text-red-500 mt-2">From date must be on or before To date</p>
        )}
      </div>

      {hasRows && (
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="card !py-3 !px-3 sm:!px-4 flex items-center justify-between">
            <span className="text-xs text-primary-400">Total Entries</span>
            <span className="font-semibold text-primary-700">{summary.count}</span>
          </div>
          <div className="card !py-3 !px-3 sm:!px-4 flex items-center justify-between">
            <span className="text-xs text-primary-400">Total Less Amount</span>
            <span className="font-semibold text-amber-600">{formatCurrency(summary.totalLess)}</span>
          </div>
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-primary-400 text-sm">Loading less entries...</div>
        ) : dateError ? (
          <div className="text-center py-12 text-red-500 text-sm">Fix the date range</div>
        ) : !filteredEntries.length ? (
          <div className="text-center py-12">
            <FileBarChart className="w-10 h-10 text-primary-300 mx-auto mb-2" />
            <p className="text-primary-400 text-sm">No less entries for this filter</p>
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-primary-100">
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
                        {row.partyType} · {row.cashSide === 'credit' ? 'Credit' : 'Debit'}
                      </p>
                    </div>
                    <p className="font-semibold text-amber-700 shrink-0">
                      {formatCurrency(row.lessAmount)}
                    </p>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 bg-primary-50 flex justify-between text-sm font-semibold text-primary-700">
                <span>Total</span>
                <span>{formatCurrency(summary.totalLess)}</span>
              </div>
            </div>

            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-primary-50/80 border-b border-primary-100">
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide">
                      Date & Time
                    </th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide">
                      Name
                    </th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide">
                      Type / Side
                    </th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide text-right">
                      Less Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEntries.map((row) => (
                    <tr key={row.id} className="border-b border-primary-50 hover:bg-primary-50/40">
                      <td className="py-2.5 px-4 text-sm text-primary-600 whitespace-nowrap">
                        {formatDate(row.date)}
                      </td>
                      <td className="py-2.5 px-4 text-sm font-medium text-primary-700">
                        {row.partyName}
                        {row.partyNameTelugu && (
                          <span className="text-xs text-primary-400 font-normal ml-1">
                            ({row.partyNameTelugu})
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-sm text-primary-600">
                        {row.partyType} · {row.cashSide === 'credit' ? 'Credit' : 'Debit'}
                      </td>
                      <td className="py-2.5 px-4 text-sm font-semibold text-amber-700 text-right tabular-nums">
                        {formatCurrency(row.lessAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-primary-50 border-t border-primary-200">
                    <td colSpan={3} className="py-2.5 px-4 text-sm font-semibold text-primary-700">
                      Total ({summary.count} records)
                    </td>
                    <td className="py-2.5 px-4 text-sm font-semibold text-amber-600 text-right">
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
