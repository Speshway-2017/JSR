import { useCallback, useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDateOnly } from '../utils/format';
import { useDataRestored } from '../utils/useDataRestored';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function Outstanding({ path: windowPath }) {
  const today = todayInputValue();
  const [date, setDate] = useState(today);
  const [scheduleId, setScheduleId] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (windowPath && windowPath.includes('?')) {
      const sp = new URLSearchParams(windowPath.split('?')[1]);
      const pDate = sp.get('date');
      const pSched = sp.get('scheduleId');
      if (pDate) setDate(pDate);
      if (pSched) setScheduleId(pSched);
    }
  }, [windowPath]);

  useEffect(() => {
    api
      .get('/schedules')
      .then((res) => setSchedules(res.data))
      .catch(() => toast.error('Failed to load schedules'));
  }, []);

  const loadReport = useCallback(async (e) => {
    e?.preventDefault?.();
    setLoading(true);
    try {
      const res = await api.get('/reports/outstanding', {
        params: { date, scheduleId: scheduleId || undefined },
      });
      if (res.data?.rows) {
        const sortedRows = [...res.data.rows].sort((a, b) => {
          const schedA = (a.schedule || '').trim();
          const schedB = (b.schedule || '').trim();
          if (!schedA && schedB) return 1;
          if (schedA && !schedB) return -1;
          const schedCmp = schedA.localeCompare(schedB, undefined, { sensitivity: 'base', numeric: true });
          if (schedCmp !== 0) return schedCmp;
          return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true });
        });
        setData({ ...res.data, rows: sortedRows });
      } else {
        setData(res.data);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load outstanding');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date, scheduleId]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  useDataRestored(loadReport);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Outstanding</h1>
        <p className="text-primary-400 text-sm mt-0.5">
          Customer credit as of a date — opening on that day and closing up to that day
        </p>
      </div>

      <form onSubmit={loadReport} className="card space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="label">Date *</label>
            <input
              type="date"
              className="input-field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Schedule</label>
            <select
              className="input-field"
              value={scheduleId}
              onChange={(e) => setScheduleId(e.target.value)}
            >
              <option value="">All schedules</option>
              {schedules.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              <Scale className="w-4 h-4" />
              {loading ? 'Loading…' : 'Show outstanding'}
            </button>
          </div>
        </div>
      </form>

      {data && (
        <div className="card !p-0 overflow-hidden">
          <div className="px-4 py-3 border-b border-primary-100">
            <p className="font-bold text-primary-800">As of {formatDateOnly(data.date)}</p>
            <p className="text-xs text-primary-400">{data.rows.length} customers</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-50 text-left text-primary-600">
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold">Schedule</th>
                  <th className="px-3 py-2 font-semibold text-right">Opening</th>
                  <th className="px-3 py-2 font-semibold text-right">Sales</th>
                  <th className="px-3 py-2 font-semibold text-right">Paid</th>
                  <th className="px-3 py-2 font-semibold text-right">Less</th>
                  <th className="px-3 py-2 font-semibold text-right">Closing</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-primary-400">
                      No outstanding for this date / schedule
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row) => (
                    <tr key={row.customerId} className="border-t border-primary-50">
                      <td className="px-3 py-2 font-medium text-primary-800">{row.name}</td>
                      <td className="px-3 py-2 text-primary-500">{row.schedule || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(row.opening)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(row.sales)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(row.paid)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-primary-400">
                        {formatCurrency(row.less)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {formatCurrency(row.closing)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {data.rows.length > 0 && (
                <tfoot>
                  <tr className="bg-accent-50 border-t border-primary-100 font-semibold">
                    <td className="px-3 py-3" colSpan={2}>
                      Total
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrency(data.totals.opening)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrency(data.totals.sales)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrency(data.totals.paid)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrency(data.totals.less)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatCurrency(data.totals.closing)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
