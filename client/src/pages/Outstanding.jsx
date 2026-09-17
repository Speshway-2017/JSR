import { useCallback, useEffect, useState } from 'react';
import { Scale, Send } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDateOnly } from '../utils/format';
import { useDataRestored } from '../utils/useDataRestored';
import { sendWhatsAppBillPdf } from '../utils/whatsappSender';
import { generateAccountStatementHtml } from '../utils/statementPdf';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

import { useMDI } from '../context/MDIContext';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function Outstanding({ path: windowPath }) {
  const { updateWindowPath } = useMDI();
  const isOnline = useOnlineStatus();

  const today = todayInputValue();
  const [date, setDate] = useState(today);
  const [scheduleId, setScheduleId] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (date && typeof updateWindowPath === 'function') {
      updateWindowPath('/outstanding', `/outstanding?date=${date}`);
    }
  }, [date, updateWindowPath]);

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

  const handleSendWhatsAppRow = async (row) => {
    if (!row.mobile) {
      toast.error(`No mobile number registered for ${row.name}`);
      return;
    }
    try {
      const htmlString = generateAccountStatementHtml({
        partyName: row.name,
        partyPhone: row.mobile || '',
        partyType: 'Customer',
        balanceLabel: 'Outstanding Balance',
        balanceAmount: row.closing,
        asOfDate: date,
      });
      await sendWhatsAppBillPdf({
        recipientPhone: row.mobile,
        recipientName: row.name,
        htmlString,
        filename: `Outstanding_Statement_${row.name}.pdf`,
        caption: `Dear ${row.name}, your outstanding balance as of ${formatDateOnly(date)} is ${formatCurrency(row.closing)} from JSR Traders. Thank you!`,
      });
    } catch (err) {
      toast.error(err.message || 'Failed to send WhatsApp statement');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Outstanding</h1>
        <p className="text-primary-400 text-sm mt-0.5">
          Customer credit balance as of a date
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
          <div className="px-4 py-3 border-b border-primary-100 flex items-center justify-between">
            <div>
              <p className="font-bold text-primary-800">As of {formatDateOnly(data.date)}</p>
              <p className="text-xs text-primary-400">{data.rows.length} customers</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-primary-50 text-left text-primary-600">
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold">Schedule</th>
                  <th className="px-3 py-2 font-semibold text-right">Closing</th>
                  <th className="px-3 py-2 font-semibold text-center">WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-primary-400">
                      No outstanding for this date / schedule
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row) => (
                    <tr key={row.customerId} className="border-t border-primary-50 hover:bg-primary-50/50">
                      <td className="px-3 py-2 font-medium text-primary-800">{row.name}</td>
                      <td className="px-3 py-2 text-primary-500">{row.schedule || '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {formatCurrency(row.closing)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {isOnline && (
                          <button
                            type="button"
                            onClick={() => handleSendWhatsAppRow(row)}
                            className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md text-xs font-medium inline-flex items-center gap-1"
                            title="Send Outstanding Statement via WhatsApp"
                          >
                            <Send className="w-3 h-3 text-emerald-600" /> Send
                          </button>
                        )}
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
                      {formatCurrency(data.totals.closing)}
                    </td>
                    <td></td>
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
