import { useEffect, useState, useCallback } from 'react';
import { ClipboardList, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../api';
import { formatCurrency, formatDate } from '../utils/format';

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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Inventory History</h1>
          <p className="text-primary-400 text-sm mt-0.5">
            Purchases + vendor loads from sales (same as Sale Patty)
          </p>
        </div>
        <button
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
            className="input-field !py-2 !text-sm w-40"
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
          <select
            className="input-field !py-2 !text-sm w-40"
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

      {hasRows && (
        <div className="card !py-3 !px-4 flex flex-wrap gap-4 justify-between text-sm">
          <div className="flex gap-6">
            <span>
              <span className="text-primary-400">Total Weight </span>
              <span className="font-semibold text-primary-700">
                {formatWeight(data.summary.totalWeight)}
              </span>
            </span>
            <span>
              <span className="text-primary-400">Total Amount </span>
              <span className="font-semibold text-primary-700">
                {formatCurrency(data.summary.totalAmount || 0)}
              </span>
            </span>
          </div>
        </div>
      )}

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="text-center py-12 text-primary-400 text-sm">Loading...</div>
        ) : dateError ? (
          <div className="text-center py-12 text-red-500 text-sm">Fix the date range</div>
        ) : !data?.rows?.length ? (
          <div className="text-center py-12">
            <ClipboardList className="w-10 h-10 text-primary-300 mx-auto mb-2" />
            <p className="text-primary-400 text-sm">No purchase or load (sales) records for this range</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-primary-50/80 border-b border-primary-100">
                  <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase">Date</th>
                  <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase">Source</th>
                  <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase">Material</th>
                  <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase">Vendor</th>
                  <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase text-right">
                    Weight
                  </th>
                  <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase text-right">
                    Rate
                  </th>
                  <th className="py-2.5 px-4 text-xs font-semibold text-primary-500 uppercase text-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id} className="border-b border-primary-50">
                    <td className="py-2.5 px-4 text-sm text-primary-600 whitespace-nowrap">
                      {formatDate(row.date)}
                    </td>
                    <td className="py-2.5 px-4 text-sm text-primary-600">{sourceLabel(row.source)}</td>
                    <td className="py-2.5 px-4 text-sm font-medium text-primary-700">
                      {row.materialName}
                    </td>
                    <td className="py-2.5 px-4 text-sm text-primary-600">{row.vendorName}</td>
                    <td className="py-2.5 px-4 text-sm text-primary-600 text-right">
                      {formatWeight(row.totalWeight)}
                    </td>
                    <td className="py-2.5 px-4 text-sm text-primary-600 text-right">
                      {row.ratePerKg ? formatCurrency(row.ratePerKg) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-sm text-primary-600 text-right">
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
