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

export default function CashSalesReport() {
  const [date, setDate] = useState(todayInputValue());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const load = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    try {
      const res = await api.get('/sales/report-2', { params: { date, cashOnly: true } });
      setData(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load cash sales report');
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

  useEffect(() => {
    const handleUpdate = () => {
      load();
    };
    window.addEventListener('jsr_data_updated', handleUpdate);
    return () => window.removeEventListener('jsr_data_updated', handleUpdate);
  }, [load]);

  const printReport = async () => {
    if (!data?.columns?.length) {
      toast.error('No cash sales to print');
      return;
    }
    setPrinting(true);
    const previewTab = openBillPreviewTab();
    try {
      await openSaleReport2Print(data, previewTab, 'Day wise cash sale report');
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
          <h1 className="text-sm font-bold text-primary-800">Day wise cash sale report</h1>
          <p className="text-primary-400 text-[11px] mt-0.5">
            Vendor columns — vegetable sections with cash customer bag weights & rates
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            className="btn-primary !py-1 !px-2.5 !text-xs flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs disabled:opacity-50"
            disabled={!hasCols || printing}
            onClick={printReport}
          >
            <Printer className="w-3 h-3" />
            Print
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <div className="card !p-2.5">
        <div className="flex items-center gap-2 max-w-xs">
          <div className="w-full">
            <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">
              Date *
            </label>
            <input
              type="date"
              className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
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
              No cash sales for {date ? formatDateOnly(date) : 'this date'}
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
