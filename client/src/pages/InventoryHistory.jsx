import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../api';
import { formatCurrency, formatDate } from '../utils/format';
import { useDataRestored } from '../utils/useDataRestored';

function formatWeight(kg) {
  return `${Number(kg || 0).toFixed(1)} kg`;
}

function sourceLabel(source) {
  if (source === 'purchase') return 'Purchase';
  if (source === 'load') return 'Load';
  return source || '—';
}

export default function InventoryHistory() {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [vendorId, setVendorId] = useState('');
  const [materialId, setMaterialId] = useState('');
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/vendors'), api.get('/materials')]).then(([v, m]) => {
      setVendors(v.data);
      setMaterials(m.data);
    });
  }, []);

  const fetchHistory = useCallback(() => {
    if (startDate > endDate) return;
    setLoading(true);
    const params = new URLSearchParams({ startDate, endDate });
    if (vendorId) params.set('vendorId', vendorId);
    if (materialId) params.set('materialId', materialId);

    api
      .get(`/inventory/history?${params}`)
      .then((res) => setData(res.data))
      .catch(() => setData({ rows: [], summary: { totalWeight: 0, totalAmount: 0 } }))
      .finally(() => setLoading(false));
  }, [startDate, endDate, vendorId, materialId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useDataRestored(fetchHistory);

  const exportExcel = () => {
    if (!data?.rows?.length) return;
    const sheetRows = data.rows.map((row) => ({
      Date: formatDate(row.date),
      Source: sourceLabel(row.source),
      Material: row.materialName,
      Vendor: row.vendorName,
      'Weight (kg)': row.totalWeight,
      'Rate / kg': row.ratePerKg || 0,
      Amount: row.amount || 0,
      'Handling (₹)': row.handlingCharges || 0,
    }));
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory');
    XLSX.writeFile(wb, `inventory_${startDate}_to_${endDate}.xlsx`);
  };

  const dateError = startDate > endDate;
  const hasRows = !loading && !dateError && data?.rows?.length > 0;

  return (
    <div className="space-y-3 max-w-4xl">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="page-title text-2xl font-bold text-primary-700">Inventory History</h1>
          <p className="text-xs text-primary-500 mt-1">
            Purchases + vendor loads from sales (same as Sale Patty)
          </p>
        </div>
        <button
          onClick={exportExcel}
          disabled={!data?.rows?.length}
          className="btn-primary !py-1.5 !px-3 !text-sm font-semibold disabled:opacity-50 shrink-0 flex items-center gap-1.5"
        >
          <Download className="w-4 h-4" /> Export Excel
        </button>
      </div>

      <div className="card !p-3.5 space-y-2.5">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">From</label>
            <input
              type="date"
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">To</label>
            <input
              type="date"
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">Material</label>
            <select
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
            >
              <option value="">All materials</option>
              {materials.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">Vendor</label>
            <select
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
            >
              <option value="">All vendors</option>
              {vendors.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {hasRows && (
        <div className="card !p-3 flex flex-wrap gap-6 text-sm">
          <span>
            <span className="text-primary-500 font-medium">Total Weight: </span>
            <span className="font-bold text-primary-800 tabular-nums">
              {formatWeight(data.summary.totalWeight)}
            </span>
          </span>
          <span>
            <span className="text-primary-500 font-medium">Total Amount: </span>
            <span className="font-bold text-primary-800 tabular-nums">
              {formatCurrency(data.summary.totalAmount || 0)}
            </span>
          </span>
        </div>
      )}

      <div className="card !p-0 overflow-hidden border border-primary-200">
        {loading ? (
          <div className="text-center py-8 text-primary-400 text-xs">Loading...</div>
        ) : dateError ? (
          <div className="text-center py-8 text-red-500 text-xs">Fix the date range</div>
        ) : !data?.rows?.length ? (
          <div className="text-center py-8">
            <ClipboardList className="w-8 h-8 text-primary-300 mx-auto mb-1.5" />
            <p className="text-primary-400 text-xs">No purchase or load (sales) records for this range</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="bg-primary-50/80 border-b border-primary-200">
                  <th className="py-2.5 px-3 text-xs font-semibold text-primary-700 w-[130px]">Date</th>
                  <th className="py-2.5 px-3 text-xs font-semibold text-primary-700 w-[75px]">Source</th>
                  <th className="py-2.5 px-3 text-xs font-semibold text-primary-700">Material</th>
                  <th className="py-2.5 px-3 text-xs font-semibold text-primary-700">Vendor</th>
                  <th className="py-2.5 px-3 text-xs font-semibold text-primary-700 text-right w-[90px]">
                    Weight
                  </th>
                  <th className="py-2.5 px-3 text-xs font-semibold text-primary-700 text-right w-[80px]">
                    Rate
                  </th>
                  <th className="py-2.5 px-3 text-xs font-semibold text-primary-700 text-right w-[95px]">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b border-primary-100 hover:bg-primary-50/40 transition">
                    <td className="py-2.5 px-3 text-xs font-medium text-primary-600 whitespace-nowrap">
                      {formatDate(row.date)}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-medium text-primary-600">{sourceLabel(row.source)}</td>
                    <td className="py-2.5 px-3 text-xs font-bold text-primary-800 truncate">
                      {row.materialName}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-medium text-primary-700 truncate">{row.vendorName}</td>
                    <td className="py-2.5 px-3 text-xs font-semibold text-primary-700 text-right whitespace-nowrap tabular-nums">
                      {formatWeight(row.totalWeight)}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-medium text-primary-600 text-right whitespace-nowrap tabular-nums">
                      {row.ratePerKg ? formatCurrency(row.ratePerKg) : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-xs font-bold text-primary-800 text-right whitespace-nowrap tabular-nums">
                      {row.amount ? formatCurrency(row.amount) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
