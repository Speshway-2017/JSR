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

function todayInputValue() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function Outstanding({ path: windowPath }) {
  const isOnline = useOnlineStatus();

  const today = todayInputValue();
  const [date, setDate] = useState(today);
  const [scheduleId, setScheduleId] = useState('');
  const [schedules, setSchedules] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [collapsedSchedules, setCollapsedSchedules] = useState({});

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
    <div className="space-y-2.5 max-w-3xl">
      <div>
        <h1 className="text-sm font-bold text-primary-800">Outstanding</h1>
        <p className="text-primary-400 text-[11px] mt-0.5">
          Customer credit balance as of a date
        </p>
      </div>

      <form onSubmit={loadReport} className="card !p-3 space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
          <div>
            <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">
              Date *
            </label>
            <input
              type="date"
              className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">
              Schedule
            </label>
            <select
              className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition truncate"
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
          <div>
            <button
              type="submit"
              className="btn-primary !py-1.5 !px-3 !text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 w-full h-8 cursor-pointer"
              disabled={loading}
            >
              <Scale className="w-3.5 h-3.5" />
              {loading ? 'Loading…' : 'Show outstanding'}
            </button>
          </div>
        </div>
      </form>

      {data && (
        <div className="space-y-2.5">
          <div className="card !p-2.5 flex flex-wrap items-center justify-between gap-2.5 bg-primary-50/40 border border-primary-200/60">
            <div>
              <p className="font-bold text-primary-900 text-xs">As of {formatDateOnly(data.date)}</p>
              <p className="text-[10px] text-primary-500 font-medium mt-0.5">
                {data.rows.length} total {data.rows.length === 1 ? 'customer' : 'customers'}
                {groupedSchedules.length > 0 &&
                  ` across ${groupedSchedules.length} ${groupedSchedules.length === 1 ? 'schedule' : 'schedules'}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePrint}
                className="btn-primary !py-1 !px-2.5 !text-xs rounded-lg flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                <Printer className="w-3 h-3" />
                Print
              </button>
              {groupedSchedules.length > 1 && (
                <div className="flex items-center gap-1.5 text-[11px] font-medium">
                  <button
                    type="button"
                    onClick={expandAll}
                    className="text-primary-700 hover:text-primary-900 hover:underline cursor-pointer"
                  >
                    Expand All
                  </button>
                  <span className="text-primary-300">•</span>
                  <button
                    type="button"
                    onClick={collapseAll}
                    className="text-primary-700 hover:text-primary-900 hover:underline cursor-pointer"
                  >
                    Collapse All
                  </button>
                </div>
              )}
              <div className="text-right border-l border-primary-200/80 pl-3">
                <p className="text-[9px] text-primary-500 font-semibold uppercase tracking-wider">Total Outstanding</p>
                <p className="text-sm font-extrabold text-primary-900 tabular-nums">
                  {formatCurrency(data.totals.closing)}
                </p>
              </div>
            </div>
          </div>

          {groupedSchedules.length === 0 ? (
            <div className="card !p-6 text-center text-xs text-primary-400">
              No outstanding for this date / schedule
            </div>
          ) : (
            groupedSchedules.map((group) => {
              const isCollapsed = !!collapsedSchedules[group.scheduleName];
              return (
                <div key={group.scheduleName} className="card !p-0 overflow-hidden shadow-none border border-primary-200">
                  <button
                    type="button"
                    onClick={() => toggleSchedule(group.scheduleName)}
                    className="w-full px-3 py-1.5 bg-gradient-to-r from-primary-800 to-primary-700 hover:from-primary-900 hover:to-primary-800 text-white flex flex-wrap items-center justify-between gap-2 text-left cursor-pointer transition-colors focus:outline-none"
                  >
                    <div className="flex items-center gap-1.5">
                      {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5 text-primary-200 shrink-0" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-primary-200 shrink-0" />
                      )}
                      <span className="font-bold text-xs tracking-wide">{group.scheduleName}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/20 text-white font-medium">
                        {group.rows.length} {group.rows.length === 1 ? 'customer' : 'customers'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-primary-200 text-[11px]">Subtotal:</span>
                      <span className="font-bold text-white tabular-nums text-xs">
                        {formatCurrency(group.totalClosing)}
                      </span>
                    </div>
                  </button>
                  {!isCollapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs table-fixed">
                        <thead>
                          <tr className="bg-primary-50/80 text-left border-b border-primary-100">
                            <th className="px-3 py-1.5 text-[10px] font-semibold text-primary-500 uppercase tracking-wide">
                              Customer
                            </th>
                            <th className="px-3 py-1.5 text-[10px] font-semibold text-primary-500 uppercase tracking-wide text-right w-[140px]">
                              Closing Balance
                            </th>
                            <th className="px-3 py-1.5 text-[10px] font-semibold text-primary-500 uppercase tracking-wide text-center w-[85px]">
                              WhatsApp
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => (
                            <tr key={row.customerId} className="border-b border-primary-100 hover:bg-primary-50/40 transition-colors">
                              <td className="px-3 py-1.5 font-medium text-primary-900 truncate">{row.name}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-semibold text-primary-800">
                                {formatCurrency(row.closing)}
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                {isOnline && (
                                  <button
                                    type="button"
                                    onClick={() => handleSendWhatsAppRow(row)}
                                    className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                                    title="Send Outstanding Statement via WhatsApp"
                                  >
                                    <Send className="w-2.5 h-2.5 text-emerald-600" /> Send
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="bg-primary-50/50 border-t border-primary-100 font-semibold text-primary-800">
                            <td className="px-3 py-1.5 text-xs text-primary-600">Schedule Subtotal</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-primary-900 font-bold text-xs">
                              {formatCurrency(group.totalClosing)}
                            </td>
                            <td className="px-3 py-1.5"></td>
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


