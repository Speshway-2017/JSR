import { useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDateOnly } from '../utils/format';
import { openBillPreviewTab, openRangeBillsNUp } from '../utils/rangeBillPrint';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function BillPrint() {
  const today = todayInputValue();
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  const fetchBills = async () => {
    if (startDate > endDate) {
      toast.error('Start date must be before end date');
      return null;
    }
    setLoading(true);
    try {
      const res = await api.get('/reports/bills', {
        params: { startDate, endDate },
      });
      setData(res.data);
      return res.data;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load bills');
      setData(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const loadBills = async (e) => {
    e?.preventDefault?.();
    await fetchBills();
  };

  const openPrintChoices = async () => {
    const next = await fetchBills();
    if (!next?.statements?.length) {
      if (next) toast.error('No bills to print');
      return;
    }
    setPrintOpen(true);
  };

  const printNUp = async (perPage) => {
    if (!data?.statements?.length) {
      toast.error('No bills to print');
      return;
    }
    setPrinting(true);
    const previewTab = openBillPreviewTab();
    try {
      await openRangeBillsNUp(data.statements, perPage, previewTab);
      setPrintOpen(false);
    } catch (err) {
      if (previewTab) previewTab.close();
      toast.error(err.message || 'Failed to print');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Bill Print</h1>
        <p className="text-primary-400 text-sm mt-0.5">
          All customers in a date range — print 2, 4 or 6 per page
        </p>
      </div>

      <form onSubmit={loadBills} className="card space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl">
          <div>
            <label className="label">From *</label>
            <input
              type="date"
              className="input-field"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">To *</label>
            <input
              type="date"
              className="input-field"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-secondary" disabled={loading}>
            <FileText className="w-4 h-4" />
            {loading ? 'Loading…' : 'Show bills'}
          </button>
          <button type="button" className="btn-primary" disabled={loading || printing} onClick={openPrintChoices}>
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </form>

      {data && (
        <div className="card !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-primary-100">
            <p className="font-bold text-primary-800">
              {formatDateOnly(data.startDate)} — {formatDateOnly(data.endDate)}
            </p>
            <p className="text-xs text-primary-400">
              {data.statements.length} customer{data.statements.length === 1 ? '' : 's'}
            </p>
          </div>
          {data.statements.length === 0 ? (
            <p className="px-4 py-10 text-center text-primary-400 text-sm">No bills in this range</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-primary-100 bg-primary-50/50 text-left">
                    <th className="px-4 py-2.5 font-semibold text-primary-500">Date</th>
                    <th className="px-4 py-2.5 font-semibold text-primary-500">Name</th>
                    <th className="px-4 py-2.5 font-semibold text-primary-500 text-right">Opening</th>
                    <th className="px-4 py-2.5 font-semibold text-primary-500 text-right">Sale</th>
                    <th className="px-4 py-2.5 font-semibold text-primary-500 text-right">Paid</th>
                    <th className="px-4 py-2.5 font-semibold text-primary-500 text-right">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {data.statements.map((st) => (
                    <tr key={st.customerId} className="border-b border-primary-50">
                      <td className="px-4 py-2.5 text-primary-600 whitespace-nowrap">
                        {formatDateOnly(data.startDate)} – {formatDateOnly(data.endDate)}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-primary-800">{st.name}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-primary-700">
                        {formatCurrency(st.opening)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-primary-700">
                        {formatCurrency(st.totalSale)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-primary-700">
                        {formatCurrency(st.totalPaid)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-primary-800">
                        {formatCurrency(st.closing)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {printOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="card w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-primary-800">Print bills</h2>
            <p className="text-sm text-primary-500">
              Split each page into parts. A bill that does not fit continues in the next part.
            </p>
            <div className="grid grid-cols-1 gap-2">
              {[2, 4, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n === 6 ? 'btn-primary !py-3 justify-center' : 'btn-secondary !py-3 justify-center'}
                  disabled={printing}
                  onClick={() => printNUp(n)}
                >
                  {n} per page
                </button>
              ))}
            </div>
            <button
              type="button"
              className="text-sm font-medium text-primary-500"
              onClick={() => setPrintOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
