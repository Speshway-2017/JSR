import { useEffect, useState, useCallback } from 'react';
import { FileBarChart, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../api';
import { formatCurrency, formatDate } from '../utils/format';

function formatWeight(kg) {
  return `${Number(kg).toFixed(1)} kg`;
}

export default function SalesReport() {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [customerId, setCustomerId] = useState('');
  const [materialId, setMaterialId] = useState('');
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

  const exportExcel = () => {
    if (!data?.rows?.length) return;

    const sheetRows = data.rows.map((row) => ({
      'Date & Time': formatDate(row.date),
      Customer: row.customerName,
      Material: row.materialName,
      Bags: row.bagCount,
      'Weight (kg)': row.totalWeight,
      'Total Price (₹)': row.totalAmount,
    }));

    sheetRows.push({});
    sheetRows.push({
      'Date & Time': 'TOTAL',
      Customer: '',
      Material: '',
      Bags: data.summary.totalBags,
      'Weight (kg)': data.summary.totalWeight,
      'Total Price (₹)': data.summary.totalAmount,
    });

    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = [{ wch: 20 }, { wch: 18 }, { wch: 14 }, { wch: 8 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
    XLSX.writeFile(wb, `sales_report_${startDate}_to_${endDate}.xlsx`);
  };

  const dateError = startDate > endDate;
  const hasRows = !loading && !dateError && data?.rows?.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Sales Report</h1>
          <p className="text-primary-400 text-sm mt-0.5">Customer sales by material</p>
        </div>
        <button
          type="button"
          onClick={exportExcel}
          disabled={!data?.rows?.length}
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
          >
            <option value="">All customers</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <select
            className="input-field !py-2 !text-sm min-w-[140px] flex-1 sm:flex-none sm:w-40"
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
          >
            <option value="">All materials</option>
            {materials.map((m) => (
              <option key={m._id} value={m._id}>{m.name}</option>
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
            <span className="font-semibold text-primary-700">{data.summary.totalBags}</span>
          </div>
          <div className="card !py-3 !px-3 sm:!px-4 flex items-center justify-between">
            <span className="text-xs text-primary-400">Weight</span>
            <span className="font-semibold text-primary-700">{formatWeight(data.summary.totalWeight)}</span>
          </div>
          <div className="card !py-3 !px-3 sm:!px-4 flex items-center justify-between">
            <span className="text-xs text-primary-400">Amount</span>
            <span className="font-semibold text-accent-600">{formatCurrency(data.summary.totalAmount)}</span>
          </div>
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-primary-400 text-sm">Loading sales...</div>
        ) : dateError ? (
          <div className="text-center py-12 text-red-500 text-sm">Fix the date range</div>
        ) : !data?.rows?.length ? (
          <div className="text-center py-12">
            <FileBarChart className="w-10 h-10 text-primary-300 mx-auto mb-2" />
            <p className="text-primary-400 text-sm">No sales for this filter</p>
          </div>
        ) : (
          <>
            <div className="md:hidden divide-y divide-primary-100">
              {data.rows.map((row) => (
                <div key={row.id} className="px-4 py-3">
                  <div className="flex justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-primary-700">{row.materialName}</p>
                      <p className="text-xs text-primary-400">{row.customerName}</p>
                      <p className="text-xs text-primary-400 mt-0.5">{formatDate(row.date)}</p>
                      <p className="text-xs text-primary-500 mt-1">
                        {row.bagCount} bags · {formatWeight(row.totalWeight)}
                      </p>
                    </div>
                    <p className="font-semibold text-primary-700 shrink-0">{formatCurrency(row.totalAmount)}</p>
                  </div>
                </div>
              ))}
              <div className="px-4 py-3 bg-primary-50 flex justify-between text-sm font-semibold text-primary-700">
                <span>Total</span>
                <span>{formatCurrency(data.summary.totalAmount)}</span>
              </div>
            </div>

            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-primary-50/80 border-b border-primary-100">
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide">Date & Time</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide">Customer</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide">Material</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide text-right">Bags</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide text-right">Weight</th>
                    <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase tracking-wide text-right">Total Price</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <tr key={row.id} className="border-b border-primary-50 hover:bg-primary-50/40">
                      <td className="py-2.5 px-4 text-sm text-primary-600 whitespace-nowrap">{formatDate(row.date)}</td>
                      <td className="py-2.5 px-4 text-sm font-medium text-primary-700">{row.customerName}</td>
                      <td className="py-2.5 px-4 text-sm text-primary-600">{row.materialName}</td>
                      <td className="py-2.5 px-4 text-sm text-primary-600 text-right">{row.bagCount}</td>
                      <td className="py-2.5 px-4 text-sm text-primary-600 text-right">{formatWeight(row.totalWeight)}</td>
                      <td className="py-2.5 px-4 text-sm font-semibold text-primary-700 text-right">
                        {formatCurrency(row.totalAmount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-primary-50 border-t border-primary-200">
                    <td colSpan={3} className="py-2.5 px-4 text-sm font-semibold text-primary-700">Total</td>
                    <td className="py-2.5 px-4 text-sm font-semibold text-primary-700 text-right">{data.summary.totalBags}</td>
                    <td className="py-2.5 px-4 text-sm font-semibold text-primary-700 text-right">
                      {formatWeight(data.summary.totalWeight)}
                    </td>
                    <td className="py-2.5 px-4 text-sm font-semibold text-accent-600 text-right">
                      {formatCurrency(data.summary.totalAmount)}
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
