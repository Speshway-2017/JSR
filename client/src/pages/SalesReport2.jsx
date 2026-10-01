import { useCallback, useEffect, useState } from 'react';
import { FileBarChart, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatDateOnly } from '../utils/format';
import { RAMABHADRA, ensureRamabhadraInDocument } from '../utils/pdfFont';
import { useDataRestored } from '../utils/useDataRestored';
import {
  openBillPreviewTab,
  openSaleReport2Print,
  saleReport2InnerHtml,
  SALE_REPORT_2_CSS,
} from '../utils/saleReport2Print';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function SalesReport2() {
  const [date, setDate] = useState(todayInputValue());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    try {
      const res = await api.get('/sales/report-2', { params: { date } });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load report');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    ensureRamabhadraInDocument().catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useDataRestored(load);

  const printReport = async () => {
    if (!data?.columns?.length) {
      toast.error('No sales to print');
      return;
    }
    setPrinting(true);
    const previewTab = openBillPreviewTab();
    try {
      await openSaleReport2Print(data, previewTab);
    } catch (err) {
      previewTab?.close();
      toast.error(err.message || 'Failed to print');
    } finally {
      setPrinting(false);
    }
  };

  const hasCols = !!data?.columns?.length;

  return (
    <div className="space-y-2.5 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="page-title text-2xl font-bold text-primary-700">Day wise sale report</h1>
          <p className="text-xs text-primary-500 mt-1">
            Vendor columns — vegetable sections with customer bag weights & rates
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            className="btn-primary !py-1.5 !px-3 !text-sm font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs disabled:opacity-50"
            disabled={!hasCols || printing}
            onClick={printReport}
          >
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card !p-3">
        <div className="flex items-center gap-2 max-w-xs">
          <div className="w-full">
            <label className="text-xs font-semibold text-primary-600 mb-1 block">
              Date *
            </label>
            <input
              type="date"
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="card !p-0 overflow-auto border border-primary-200">
        {loading ? (
          <p className="py-12 text-center text-xs text-primary-400">Loading…</p>
        ) : !hasCols ? (
          <div className="py-12 text-center">
            <FileBarChart className="w-8 h-8 text-primary-300 mx-auto mb-1.5" />
            <p className="text-primary-400 text-xs">
              No sales for {date ? formatDateOnly(date) : 'this date'}
            </p>
          </div>
        ) : (
          <div className="p-3 bg-primary-50/20 overflow-x-auto">
            <div
              className="sale-report-2 min-w-[720px]"
              style={{ fontFamily: `'${RAMABHADRA}', 'Noto Sans Telugu', sans-serif` }}
              dangerouslySetInnerHTML={{ __html: saleReport2InnerHtml(data) }}
            />
          </div>
        )}
      </div>

      <style>{SALE_REPORT_2_CSS}</style>
    </div>
  );
}
