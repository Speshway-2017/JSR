import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Scale, Send, Printer } from 'lucide-react';
import { openOutstandingPreview } from '../utils/reportPrint';
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
  const [collapsedSchedules, setCollapsedSchedules] = useState({});

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

  const groupedSchedules = useMemo(() => {
    if (!data?.rows || data.rows.length === 0) return [];
    const groupsMap = new Map();
    data.rows.forEach((row) => {
      const schedName = (row.schedule || 'Unassigned Schedule').trim();
      if (!groupsMap.has(schedName)) {
        groupsMap.set(schedName, {
          scheduleName: schedName,
          rows: [],
          totalClosing: 0,
        });
      }
      const group = groupsMap.get(schedName);
      group.rows.push(row);
      group.totalClosing += Number(row.closing || 0);
    });
    return Array.from(groupsMap.values());
  }, [data]);

  const toggleSchedule = (schedName) => {
    setCollapsedSchedules((prev) => ({
      ...prev,
      [schedName]: !prev[schedName],
    }));
  };

  const expandAll = () => setCollapsedSchedules({});

  const collapseAll = () => {
    const nextMap = {};
    groupedSchedules.forEach((g) => {
      nextMap[g.scheduleName] = true;
    });
    setCollapsedSchedules(nextMap);
  };

  const handlePrint = () => {
    if (!data) return;
    const scheduleObj = schedules.find((s) => s._id === scheduleId);
    openOutstandingPreview(data, groupedSchedules, date, scheduleObj ? scheduleObj.name : '');
  };

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
        <div className="space-y-4">
          <div className="card flex flex-wrap items-center justify-between gap-4 py-3 px-4 bg-primary-50/50">
            <div>
              <p className="font-bold text-primary-900 text-base">As of {formatDateOnly(data.date)}</p>
              <p className="text-xs text-primary-500 font-medium">
                {data.rows.length} total {data.rows.length === 1 ? 'customer' : 'customers'} {groupedSchedules.length > 0 && `across ${groupedSchedules.length} ${groupedSchedules.length === 1 ? 'schedule' : 'schedules'}`}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handlePrint}
                className="btn-primary !py-1.5 !px-3 !text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
              {groupedSchedules.length > 1 && (
                <div className="flex items-center gap-2 text-xs font-medium">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="text-primary-700 hover:text-primary-900 hover:underline"
                  >
                    Expand All
                  </button>
                  <span className="text-primary-300">•</span>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="text-primary-700 hover:text-primary-900 hover:underline"
                  >
                    Collapse All
                  </button>
                </div>
              )}
              <div className="text-right">
                <p className="text-xs text-primary-500 font-medium uppercase tracking-wider">Total Outstanding</p>
                <p className="text-lg font-extrabold text-primary-900 tabular-nums">
                  {formatCurrency(data.totals.closing)}
                </p>
              </div>
            </div>
          </div>

          {groupedSchedules.length === 0 ? (
            <div className="card p-8 text-center text-primary-400">
              No outstanding for this date / schedule
            </div>
          ) : (
            groupedSchedules.map((group) => {
              const isCollapsed = !!collapsedSchedules[group.scheduleName];
              return (
                <div key={group.scheduleName} className="card !p-0 overflow-hidden shadow-sm border border-primary-200/60">
                  <button
                    type="button"
                    onClick={() => toggleSchedule(group.scheduleName)}
                    className="w-full px-4 py-3 bg-gradient-to-r from-primary-800 to-primary-700 hover:from-primary-900 hover:to-primary-800 text-white flex flex-wrap items-center justify-between gap-2 text-left cursor-pointer transition-colors focus:outline-none"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="w-5 h-5 text-primary-200" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-primary-200" />
                      )}
                      <span className="font-bold text-base tracking-wide">{group.scheduleName}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white font-medium">
                        {group.rows.length} {group.rows.length === 1 ? 'customer' : 'customers'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-primary-200">Subtotal:</span>
                      <span className="font-bold text-white tabular-nums text-base">
                        {formatCurrency(group.totalClosing)}
                      </span>
                    </div>
                  </button>
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-primary-50/80 text-left text-primary-700 border-b border-primary-100">
                            <th className="px-4 py-2.5 font-semibold">Customer</th>
                            <th className="px-4 py-2.5 font-semibold text-right">Closing Balance</th>
                            <th className="px-4 py-2.5 font-semibold text-center w-32">WhatsApp</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-primary-50">
                          {group.rows.map((row) => (
                            <tr key={row.customerId} className="hover:bg-primary-50/40 transition-colors">
                              <td className="px-4 py-2.5 font-medium text-primary-900">{row.name}</td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-primary-800">
                                {formatCurrency(row.closing)}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {isOnline && (
                                  <button
                                    type="button"
                                    onClick={() => handleSendWhatsAppRow(row)}
                                    className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md text-xs font-medium inline-flex items-center gap-1 transition-colors"
                                    title="Send Outstanding Statement via WhatsApp"
                                  >
                                    <Send className="w-3 h-3 text-emerald-600" /> Send
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-primary-50/50 border-t border-primary-100 font-semibold text-primary-800">
                            <td className="px-4 py-2.5">Schedule Subtotal</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-primary-900 font-bold">
                              {formatCurrency(group.totalClosing)}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}


