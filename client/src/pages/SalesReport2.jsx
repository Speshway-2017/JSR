import { useCallback, useEffect, useState } from 'react';
import { FileBarChart, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatDateOnly } from '../utils/format';
import { RAMABHADRA, ensureRamabhadraInDocument } from '../utils/pdfFont';
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
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Day wise sale report</h1>
          <p className="text-primary-400 text-sm mt-0.5">
            Product columns — customer and bag weights, grouped by rate
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label">Date</label>
            <input
              type="date"
              className="input-field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <button type="button" className="btn-primary" disabled={!hasCols || printing} onClick={printReport}>
            <Printer className="w-4 h-4" />
            Print
          </button>
        </div>
      </div>

      <div className="card overflow-auto">
        {loading ? (
          <p className="py-12 text-center text-sm text-primary-400">Loading…</p>
        ) : !hasCols ? (
          <div className="py-12 text-center">
            <FileBarChart className="w-10 h-10 text-primary-300 mx-auto mb-2" />
            <p className="text-primary-400 text-sm">No sales for {date ? formatDateOnly(date) : 'this date'}</p>
          </div>
        ) : (
          <div
            className="sale-report-2 min-w-[720px]"
            style={{ fontFamily: `'${RAMABHADRA}', 'Noto Sans Telugu', sans-serif` }}
            dangerouslySetInnerHTML={{ __html: saleReport2InnerHtml(data) }}
          />
        )}
      </div>

      <style>{SALE_REPORT_2_CSS}</style>
    </div>
  );
}
