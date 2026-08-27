import { useEffect, useState, useCallback, useMemo } from 'react';
import { FileBarChart, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../api';
import { formatCurrency, formatDate } from '../utils/format';
import { useDataRestored } from '../utils/useDataRestored';

function formatWeight(kg) {
  return `${Number(kg).toFixed(1)} kg`;
}

export default function SalesReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [customerId, setCustomerId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [rate, setRate] = useState('');
  const [customers, setCustomers] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/customers'), api.get('/materials')]).then(([c, m]) => {
      setCustomers(c.data);
      setMaterials(m.data);
    });
  }, []);

  const fetchReport = useCallback(() => {
    if (startDate > endDate) return;
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate });
    if (customerId) params.set('customerId', customerId);
    if (materialId) params.set('materialId', materialId);

    api
      .get(`/sales/report?${params}`)
      .then((res) => setData(res.data))
      .catch(() => setData({ rows: [], summary: { totalBags: 0, totalWeight: 0, totalAmount: 0 } }))
      .finally(() => setLoading(false));
  }, [startDate, endDate, customerId, materialId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useDataRestored(fetchReport);

  const allRows = data?.rows || [];
  const rateOptions = useMemo(() => {
    const set = new Set();
    for (const row of allRows) {
      if (row.ratePerKg != null && row.ratePerKg !== '') set.add(Number(row.ratePerKg));
    }
    return [...set].sort((a, b) => a - b);
  }, [allRows]);

  useEffect(() => {
    if (rate !== '' && !rateOptions.some((r) => Number(r) === Number(rate))) {
      setRate('');
    }
  }, [rate, rateOptions]);

  const rows = useMemo(() => {
    if (rate === '') return allRows;
    const n = Number(rate);
    return allRows.filter((row) => Number(row.ratePerKg) === n);
  }, [allRows, rate]);

  const summary = useMemo(() => {
    const acc = rows.reduce(
      (sum, row) => ({
        totalBags: sum.totalBags + (Number(row.bagCount) || 0),
        totalWeight: sum.totalWeight + (Number(row.totalWeight) || 0),
        totalAmount: sum.totalAmount + (Number(row.totalAmount) || 0),
      }),
      { totalBags: 0, totalWeight: 0, totalAmount: 0 }
    );
    return {
      totalBags: acc.totalBags,
      totalWeight: Number(acc.totalWeight.toFixed(1)),
      totalAmount: Number(acc.totalAmount.toFixed(2)),
    };
  }, [rows]);

  const exportExcel = () => {
    if (!rows.length) return;

    const sheetRows = rows.map((row) => ({
      'Date & Time': formatDate(row.date),
      Name: row.customerName,
      Item: row.materialName,
      Rate: row.ratePerKg,
      Bags: row.bagCount,
      'Weight (kg)': row.saleType === 'by_bag' || !row.totalWeight ? '—' : row.totalWeight,
      'Total Price (₹)': row.totalAmount,
    }));

    sheetRows.push({});
    sheetRows.push({
      'Date & Time': 'TOTAL',
      Name: '',
      Item: '',
      Rate: '',
      Bags: summary.totalBags,
      'Weight (kg)': summary.totalWeight,
      'Total Price (₹)': summary.totalAmount,
    });

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = [
      { wch: 20 },
      { wch: 18 },
      { wch: 14 },
      { wch: 8 },
      { wch: 8 },
      { wch: 12 },
      { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
    XLSX.writeFile(wb, `sales_report_${startDate}_to_${endDate}.xlsx`);
  };

  const dateError = startDate > endDate;
  const hasRows = !loading && !dateError && rows.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Sales Report</h1>
          <p className="text-primary-400 text-sm mt-0.5">
            Filter by name, item, or rate
          </p>
        </div>
        <button
          type="button"
          onClick={exportExcel}
          disabled={!rows.length}
          className="btn-primary !py-2 !px-4 !text-sm disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> Export Excel
        </button>
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
            className="input-field !py-2 !text-sm min-w-[140px] flex-1 sm:flex-none sm:w-44"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            title="Name wise"
          >
            <option value="">All names</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <select
            className="input-field !py-2 !text-sm min-w-[140px] flex-1 sm:flex-none sm:w-40"
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            title="Item wise"
          >
            <option value="">All items</option>
            {materials.map((m) => (
              <option key={m._id} value={m._id}>{m.name}</option>
            ))}
          </select>
          <select
            className="input-field !py-2 !text-sm min-w-[120px] flex-1 sm:flex-none sm:w-32"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            title="Rate wise"
          >
            <option value="">All rates</option>
            {rateOptions.map((r) => (
              <option key={r} value={String(r)}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {dateError && (
          <p className="text-xs text-red-500 mt-2">From date must be on or before To date</p>
        )}
      </div>

      {hasRows && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="card !py-3 !px-3 sm:!px-4 flex items-center justify-between">
            <span className="text-xs text-primary-400">Bags</span>
            <span className="font-semibold text-primary-700">{summary.totalBags}</span>
          </div>
          <div className="card !py-3 !px-3 sm:!px-4 flex items-center justify-between">
            <span className="text-xs text-primary-400">Weight</span>
            <span className="font-semibold text-primary-700">{formatWeight(summary.totalWeight)}</span>
          </div>
          <div className="card !py-3 !px-3 sm:!px-4 flex items-center justify-between">
            <span className="text-xs text-primary-400">Amount</span>
            <span className="font-semibold text-accent-600">{formatCurrency(summary.totalAmount)}</span>
          </div>
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-primary-400 text-sm">Loading sales...</div>
        ) : dateError ? (
          <div className="text-center py-12 text-red-500 text-sm">Fix the date range</div>
        ) : !rows.length ? (
          <div className="text-center py-12">
            <FileBarChart className="w-10 h-10 text-primary-300 mx-auto mb-2" />
            <p className="text-primary-400 text-sm">No sales for this filter</p>
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-primary-100">
              {rows.map((row) => (
                <div key={row.id} className="px-4 py-3">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-primary-700">{row.materialName}</p>
                      <p className="text-xs text-primary-400">{row.customerName}</p>
                      <p className="text-xs text-primary-400 mt-0.5">{formatDate(row.date)}</p>
                      <p className="text-xs text-primary-500 mt-1">
                        Rate {row.ratePerKg} · {row.bagCount} bags · {formatWeight(row.totalWeight)}
                      </p>
                    </div>
                    <p className="font-semibold text-primary-700 shrink-0">{formatCurrency(row.totalAmount)}</p>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 bg-primary-50 flex justify-between text-sm font-semibold text-primary-700">
                <span>Total</span>
                <span>{formatCurrency(summary.totalAmount)}</span>
              </div>
            </div>

            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-primary-50/80 border-b border-primary-100">
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide">Date & Time</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide">Name</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide">Item</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide text-right">Rate</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide text-right">Bags</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide text-right">Weight</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide text-right">Total Price</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-primary-50 hover:bg-primary-50/40">
                      <td className="py-2.5 px-4 text-sm text-primary-600 whitespace-nowrap">{formatDate(row.date)}</td>
                      <td className="py-2.5 px-4 text-sm font-medium text-primary-700">{row.customerName}</td>
                      <td className="py-2.5 px-4 text-sm text-primary-600">{row.materialName}</td>
                      <td className="py-2.5 px-4 text-sm text-primary-600 text-right tabular-nums">{row.ratePerKg}</td>
                      <td className="py-2.5 px-4 text-sm text-primary-600 text-right">{row.bagCount}</td>
                      <td className="py-2.5 px-4 text-sm text-primary-600 text-right">{row.saleType === 'by_bag' || !row.totalWeight ? '—' : formatWeight(row.totalWeight)}</td>
                      <td className="py-2.5 px-4 text-sm font-semibold text-primary-700 text-right">
                        {formatCurrency(row.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-primary-50 border-t border-primary-200">
                    <td colSpan={4} className="py-2.5 px-4 text-sm font-semibold text-primary-700">Total</td>
                    <td className="py-2.5 px-4 text-sm font-semibold text-primary-700 text-right">{summary.totalBags}</td>
                    <td className="py-2.5 px-4 text-sm font-semibold text-primary-700 text-right">
                      {formatWeight(summary.totalWeight)}
                    </td>
                    <td className="py-2.5 px-4 text-sm font-semibold text-accent-600 text-right">
                      {formatCurrency(summary.totalAmount)}
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
