import { useEffect, useState, useCallback, useMemo } from 'react';
import { FileBarChart, Download, Eye, Scale, Printer } from 'lucide-react';
import { openSalesChecklistPreview } from '../utils/reportPrint';
import * as XLSX from 'xlsx';
import api from '../api';
import { formatCurrency, formatDate } from '../utils/format';
import { useDataRestored } from '../utils/useDataRestored';
import { useMDI } from '../context/MDIContext';
import MDIModalWindow from '../components/mdi/MDIModalWindow';

function formatWeight(kg) {
  return `${Number(kg).toFixed(1)} kg`;
}

export default function SalesReport() {
  const { openWindow } = useMDI();
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
  const [selectedBagRecord, setSelectedBagRecord] = useState(null);

  useEffect(() => {
    Promise.all([api.get('/customers'), api.get('/materials')]).then(([c, m]) => {
      setCustomers(c.data || []);
      setMaterials(m.data || []);
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
      Bags: row.bagCount,
      Rate: row.ratePerKg,
      'Weight (kg)': row.saleType === 'by_bag' || !row.totalWeight ? '—' : row.totalWeight,
      'Individual Bag Weights (kg)': row.bags && row.bags.length ? row.bags.join(', ') : '—',
      'Total Price (₹)': row.totalAmount,
    }));

    sheetRows.push({});
    sheetRows.push({
      'Date & Time': 'TOTAL',
      Name: '',
      Item: '',
      Bags: summary.totalBags,
      Rate: '',
      'Weight (kg)': summary.totalWeight,
      'Individual Bag Weights (kg)': '',
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
      { wch: 28 },
      { wch: 14 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Checklist');
    XLSX.writeFile(wb, `sales_checklist_${startDate}_to_${endDate}.xlsx`);
  };

  const handlePrint = () => {
    if (!rows.length) return;
    const custObj = customers.find((c) => c._id === customerId);
    const matObj = materials.find((m) => m._id === materialId);
    openSalesChecklistPreview({
      rows,
      totals: summary,
      startDate,
      endDate,
      filterCustomer: custObj?.name || '',
      filterItem: matObj?.name || '',
      filterRate: rate || '',
    });
  };

  const openSaleEntry = (row) => {
    if (!row?.date) return;
    const d = new Date(row.date).toISOString().slice(0, 10);
    const params = new URLSearchParams({ date: d });
    if (row.customerId) params.set('customer', row.customerId);
    openWindow({ path: `/sell?${params.toString()}`, title: 'Sales Entry' });
  };

  const dateError = startDate > endDate;
  const hasRows = !loading && !dateError && rows.length > 0;

  return (
    <div className="space-y-2.5 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-sm font-bold text-primary-800">Sales Checklist</h1>
          <p className="text-primary-400 text-[11px] mt-0.5">
            Filter sales by name, item, or rate
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            disabled={!rows.length}
            className="btn-primary !py-1 !px-2.5 !text-xs flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs disabled:opacity-50"
          >
            <Printer className="w-3 h-3" /> Print
          </button>
          <button
            type="button"
            onClick={exportExcel}
            disabled={!rows.length}
            className="btn-secondary !py-1 !px-2.5 !text-xs flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs disabled:opacity-50"
          >
            <Download className="w-3 h-3 text-primary-600" /> Export Excel
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card !p-2.5 space-y-2">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">
              From *
            </label>
            <input
              type="date"
              className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">
              To *
            </label>
            <input
              type="date"
              className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">
              Customer
            </label>
            <select
              className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition truncate"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              title="Name wise"
            >
              <option value="">All names ({customers.length})</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">
              Item
            </label>
            <select
              className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition truncate"
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              title="Item wise"
            >
              <option value="">All items ({materials.length})</option>
              {materials.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">
              Rate
            </label>
            <select
              className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition truncate"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              title="Rate wise"
            >
              <option value="">All rates ({rateOptions.length})</option>
              {rateOptions.map((r) => (
                <option key={r} value={String(r)}>
                  ₹{r}
                </option>
              ))}
            </select>
          </div>
        </div>
        {dateError && (
          <p className="text-xs text-red-500 mt-1">From date must be on or before To date</p>
        )}
      </div>

      {/* Summary KPI Strip */}
      {hasRows && (
        <div className="grid grid-cols-3 gap-2">
          <div className="card !py-2 !px-3 flex items-center justify-between border border-primary-200">
            <span className="text-[11px] font-medium text-primary-500">Bags</span>
            <span className="font-bold text-primary-800 text-xs tabular-nums">{summary.totalBags}</span>
          </div>
          <div className="card !py-2 !px-3 flex items-center justify-between border border-primary-200">
            <span className="text-[11px] font-medium text-primary-500">Weight</span>
            <span className="font-bold text-primary-800 text-xs tabular-nums">
              {formatWeight(summary.totalWeight)}
            </span>
          </div>
          <div className="card !py-2 !px-3 flex items-center justify-between border border-primary-200">
            <span className="text-[11px] font-medium text-primary-500">Amount</span>
            <span className="font-bold text-accent-700 text-xs tabular-nums">
              {formatCurrency(summary.totalAmount)}
            </span>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="card !p-0 overflow-hidden border border-primary-200">
        {loading ? (
          <div className="text-center py-12 text-primary-400 text-xs">Loading sales...</div>
        ) : dateError ? (
          <div className="text-center py-12 text-red-500 text-xs">Fix the date range</div>
        ) : !rows.length ? (
          <div className="text-center py-12">
            <FileBarChart className="w-8 h-8 text-primary-300 mx-auto mb-1.5" />
            <p className="text-primary-400 text-xs">No sales for this filter</p>
          </div>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-primary-100 text-xs">
              {rows.map((row) => {
                const hasBags = row.bags && row.bags.length > 0;
                return (
                  <div
                    key={row.id}
                    className="px-3 py-2.5 hover:bg-primary-50/40 cursor-pointer transition"
                    onClick={() => openSaleEntry(row)}
                  >
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-primary-800 text-xs">{row.materialName}</p>
                        <p className="text-[11px] text-primary-500">{row.customerName}</p>
                        <p className="text-[10.5px] text-primary-400 mt-0.5">{formatDate(row.date)}</p>
                        <div className="flex items-center gap-1.5 text-[11px] text-primary-600 mt-1 flex-wrap">
                          <span>
                            {row.bagCount} bags · Rate ₹{row.ratePerKg} · {formatWeight(row.totalWeight)}
                          </span>
                          {hasBags && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedBagRecord(row);
                              }}
                              title="View individual bag weights"
                              className="p-0.5 rounded border border-primary-200 bg-surface hover:bg-primary-100 text-primary-600 cursor-pointer"
                            >
                              <Eye className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="font-bold text-primary-800 text-xs shrink-0 tabular-nums">
                        {formatCurrency(row.totalAmount)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div className="px-3 py-2 bg-accent-50 border-t border-primary-200 flex justify-between text-xs font-semibold text-primary-800">
                <span>Total</span>
                <span className="font-bold tabular-nums text-accent-700">
                  {formatCurrency(summary.totalAmount)}
                </span>
              </div>
            </div>

            {/* Desktop Table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-primary-50/80 text-left border-b border-primary-200">
                    <th className="px-3 py-2 text-[10px] font-semibold text-primary-500 uppercase tracking-wide whitespace-nowrap">
                      Date & Time
                    </th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-primary-500 uppercase tracking-wide">
                      Name
                    </th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-primary-500 uppercase tracking-wide">
                      Item
                    </th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-primary-500 uppercase tracking-wide text-right w-16">
                      Bags
                    </th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-primary-500 uppercase tracking-wide text-right w-16">
                      Rate
                    </th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-primary-500 uppercase tracking-wide text-right w-28">
                      Weight
                    </th>
                    <th className="px-3 py-2 text-[10px] font-semibold text-primary-500 uppercase tracking-wide text-right w-24">
                      Total Price
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const hasBags = row.bags && row.bags.length > 0;
                    return (
                      <tr
                        key={row.id}
                        className="border-b border-primary-100 hover:bg-primary-50/40 cursor-pointer transition"
                        onClick={() => openSaleEntry(row)}
                        title="Click to view sales entry"
                      >
                        <td className="px-3 py-2 whitespace-nowrap text-primary-600 text-xs">
                          {formatDate(row.date)}
                        </td>
                        <td className="px-3 py-2 text-primary-800 font-semibold text-xs truncate max-w-[140px]">
                          {row.customerName}
                        </td>
                        <td className="px-3 py-2 text-primary-700 text-xs">{row.materialName}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-primary-600 text-xs">
                          {row.bagCount}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-primary-600 text-xs">
                          {row.ratePerKg != null ? `₹${row.ratePerKg}` : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-primary-700 text-xs">
                          {row.saleType === 'by_bag' || !row.totalWeight ? (
                            <span className="text-primary-400">—</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1.5">
                              <span>{formatWeight(row.totalWeight)}</span>
                              {hasBags && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedBagRecord(row);
                                  }}
                                  title="View individual bag weights"
                                  className="p-0.5 rounded border border-primary-200 bg-surface hover:bg-primary-100 text-primary-600 cursor-pointer"
                                >
                                  <Eye className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-primary-800 text-xs">
                          {formatCurrency(row.totalAmount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-accent-50 border-t border-primary-200 font-semibold text-xs">
                    <td colSpan={3} className="px-3 py-2 text-primary-800 font-bold">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-primary-800">
                      {summary.totalBags}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-primary-500"></td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-primary-800">
                      {formatWeight(summary.totalWeight)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-accent-700">
                      {formatCurrency(summary.totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Bag Weights Modal */}
      <MDIModalWindow
        open={!!selectedBagRecord}
        title="Individual Bag Weights"
        iconName="Scale"
        onClose={() => setSelectedBagRecord(null)}
      >
        {selectedBagRecord && (
          <div className="space-y-2.5">
            <p className="text-xs text-primary-500">
              {selectedBagRecord.customerName} ·{' '}
              <span className="font-semibold text-primary-700">{selectedBagRecord.materialName}</span>
            </p>

            <div className="grid grid-cols-3 gap-2 bg-primary-50/70 p-2 rounded-lg border border-primary-100 text-center text-xs">
              <div>
                <span className="block text-primary-400 text-[10px] uppercase font-semibold">Bags</span>
                <span className="font-bold text-primary-800 text-xs">{selectedBagRecord.bagCount}</span>
              </div>
              <div>
                <span className="block text-primary-400 text-[10px] uppercase font-semibold">Total Weight</span>
                <span className="font-bold text-primary-800 text-xs">
                  {formatWeight(selectedBagRecord.totalWeight)}
                </span>
              </div>
              <div>
                <span className="block text-primary-400 text-[10px] uppercase font-semibold">Rate</span>
                <span className="font-bold text-primary-800 text-xs">₹{selectedBagRecord.ratePerKg}</span>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-primary-600 mb-1">
                Bag Weight Breakdown ({selectedBagRecord.bags?.length || 0} bags)
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-44 overflow-y-auto p-1 bg-primary-50/30 rounded-lg border border-primary-100">
                {selectedBagRecord.bags?.map((w, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-2 py-1 bg-surface border border-primary-100 rounded-md shadow-2xs text-xs"
                  >
                    <span className="text-primary-400 font-medium text-[10.5px]">Bag #{idx + 1}</span>
                    <span className="font-bold text-primary-800 tabular-nums">{w} kg</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="sticky bottom-0 bg-surface/95 backdrop-blur-xs pt-2 pb-0.5 border-t border-primary-100 flex justify-end mt-2 z-10">
              <button
                type="button"
                onClick={() => setSelectedBagRecord(null)}
                className="btn-secondary !py-1 !px-4 text-xs font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </MDIModalWindow>
    </div>
  );
}
