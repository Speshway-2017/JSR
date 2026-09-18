import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, Send, FileText, CheckSquare, Square, ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDateOnly } from '../utils/format';
import { openRangeBillsNUp } from '../utils/rangeBillPrint';
import { generateSingleCustomerBillHtml } from '../utils/customerSaleBillPdf';
import { sendWhatsAppBillPdf } from '../utils/whatsappSender';
import { matchesPrefix } from '../utils/search';
import { useDataRestored } from '../utils/useDataRestored';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

import { useMDI } from '../context/MDIContext';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function BillPrint({ path: windowPath }) {
  const { updateWindowPath } = useMDI();
  const isOnline = useOnlineStatus();

  const [searchParams] = useSearchParams();
  const effectiveSearchParams = useMemo(() => {
    if (windowPath && windowPath.includes('?')) {
      return new URLSearchParams(windowPath.split('?')[1]);
    }
    return searchParams;
  }, [windowPath, searchParams]);

  const dateParam = effectiveSearchParams.get('date') || todayInputValue();

  const [startDate, setStartDate] = useState(dateParam);
  const [endDate, setEndDate] = useState(dateParam);

  /* Track whether the windowPath change was triggered internally by our own
     updateWindowPath call (i.e. the user changed the From date), vs externally
     (e.g. navigating from another page). We skip re-syncing endDate on internal updates. */
  const isInternalPathUpdate = useRef(false);

  useEffect(() => {
    if (startDate && typeof updateWindowPath === 'function') {
      isInternalPathUpdate.current = true;
      updateWindowPath('/bill-print', `/bill-print?date=${startDate}`);
    }
  }, [startDate, updateWindowPath]);

  const [filterCustomer, setFilterCustomer] = useState(effectiveSearchParams.get('customer') || '');
  const [filterVendor, setFilterVendor] = useState(effectiveSearchParams.get('vendor') || '');
  const [filterItem, setFilterItem] = useState(effectiveSearchParams.get('item') || '');
  const [filterSchedule, setFilterSchedule] = useState(effectiveSearchParams.get('schedule') || '');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    /* If this effect was triggered by our own startDate → updateWindowPath call,
       skip re-syncing so the user's endDate is preserved. */
    if (isInternalPathUpdate.current) {
      isInternalPathUpdate.current = false;
      return;
    }

    const pDate = effectiveSearchParams.get('date');
    const pCust = effectiveSearchParams.get('customer');
    const pVend = effectiveSearchParams.get('vendor');
    const pItem = effectiveSearchParams.get('item');
    const pSched = effectiveSearchParams.get('schedule');
    if (pDate) {
      setStartDate(pDate);
      setEndDate(pDate);
    }
    if (pCust !== null && pCust !== undefined) setFilterCustomer(pCust);
    if (pVend !== null && pVend !== undefined) setFilterVendor(pVend);
    if (pItem !== null && pItem !== undefined) setFilterItem(pItem);
    if (pSched !== null && pSched !== undefined) setFilterSchedule(pSched);
  }, [windowPath, effectiveSearchParams]);

  const [materials, setMaterials] = useState([]);
  const [teluguMap, setTeluguMap] = useState({});

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [perPage, setPerPage] = useState(6);

  const [selectedCids, setSelectedCids] = useState(new Set());
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    api.get('/materials').then((res) => {
      setMaterials(res.data || []);
      const tMap = {};
      (res.data || []).forEach((m) => {
        if (m.name && m.nameTelugu) {
          tMap[m.name.trim().toLowerCase()] = m.nameTelugu;
        }
      });
      setTeluguMap(tMap);
    }).catch(() => {});
  }, []);

  const fetchBills = useCallback(async () => {
    if (startDate > endDate) {
      toast.error('Start date must be before end date');
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/reports/bills', {
        params: { startDate, endDate },
      });
      setData(res.data);
      if (res.data?.statements) {
        setSelectedCids(new Set(res.data.statements.map((s) => String(s.customerId))));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load bills');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills, windowPath]);

  useDataRestored(fetchBills);

  useEffect(() => {
    const handleUpdate = () => {
      fetchBills();
    };
    window.addEventListener('jsr_data_updated', handleUpdate);
    return () => window.removeEventListener('jsr_data_updated', handleUpdate);
  }, [fetchBills]);

  // Dynamically derive available dropdown options based on the active screen / date range data
  const availableCustomers = useMemo(() => {
    if (!data?.statements) return [];
    const map = new Map();
    for (const st of data.statements) {
      const cid = String(st.customerId || '');
      if (cid && !map.has(cid)) {
        map.set(cid, {
          _id: cid,
          name: st.name || '—',
          nameTelugu: st.nameTelugu || '',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  }, [data]);

  const availableVendors = useMemo(() => {
    if (!data?.statements) return [];
    const map = new Map();
    for (const st of data.statements) {
      for (const s of st.sales || []) {
        const vId = s.vendorId ? String(s.vendorId) : '';
        const vName = s.vendorName || '';
        if (vId && !map.has(vId)) {
          map.set(vId, {
            _id: vId,
            name: vName || 'Vendor',
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  }, [data]);

  const availableItems = useMemo(() => {
    if (!data?.statements) return [];
    const map = new Map();
    for (const st of data.statements) {
      for (const s of st.sales || []) {
        const matId = s.materialId ? String(s.materialId) : '';
        const matName = String(s.material || '').trim();
        if (matName && matName !== 'Sale' && matName !== 'Cooly' && matName !== 'Credit') {
          const key = matId || matName.toLowerCase();
          if (!map.has(key)) {
            map.set(key, {
              _id: key,
              name: matName,
            });
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  }, [data]);

  const availableSchedules = useMemo(() => {
    if (!data?.statements) return [];
    const map = new Map();
    for (const st of data.statements) {
      const sId = st.scheduleId ? String(st.scheduleId) : '';
      const sName = st.scheduleName ? String(st.scheduleName).trim() : '';
      if (sId || sName) {
        const key = sId || sName;
        if (!map.has(key)) {
          map.set(key, {
            _id: key,
            id: sId,
            name: sName || 'Schedule',
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  }, [data]);

  // Reset filter selection if it's no longer present in available options for current date range
  useEffect(() => {
    if (filterCustomer && !availableCustomers.some((c) => c._id === filterCustomer || c.name === filterCustomer)) {
      setFilterCustomer('');
    }
    if (filterVendor && !availableVendors.some((v) => v._id === filterVendor || v.name === filterVendor)) {
      setFilterVendor('');
    }
    if (filterItem && !availableItems.some((i) => i._id === filterItem || i.name.toLowerCase() === filterItem.toLowerCase())) {
      setFilterItem('');
    }
    if (
      filterSchedule &&
      !availableSchedules.some(
        (s) => s._id === filterSchedule || s.id === filterSchedule || s.name.toLowerCase() === filterSchedule.toLowerCase()
      )
    ) {
      setFilterSchedule('');
    }
  }, [availableCustomers, availableVendors, availableItems, availableSchedules, filterCustomer, filterVendor, filterItem, filterSchedule]);

  const filteredStatements = useMemo(() => {
    if (!data?.statements) return [];

    let list = data.statements.filter((st) => {
      if (filterCustomer) {
        const scid = String(st.customerId || '');
        if (scid !== filterCustomer && st.name !== filterCustomer) return false;
      }
      if (filterVendor) {
        const hasVendor = (st.sales || []).some(
          (s) => String(s.vendorId || '') === filterVendor || s.vendorName === filterVendor
        );
        if (!hasVendor) return false;
      }
      if (filterItem) {
        const hasItem = (st.sales || []).some(
          (s) =>
            String(s.materialId || '') === filterItem ||
            (s.material || '').toLowerCase() === filterItem.toLowerCase()
        );
        if (!hasItem) return false;
      }
      if (filterSchedule) {
        const stSchedId = String(st.scheduleId || '');
        const stSchedName = String(st.scheduleName || '').trim().toLowerCase();
        const target = String(filterSchedule || '').trim().toLowerCase();
        const matchId = stSchedId && stSchedId === filterSchedule;
        const matchName = stSchedName && stSchedName === target;
        if (!matchId && !matchName) return false;
      }
      return true;
    });

    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      list = list.filter((st) => {
        const custMatch =
          matchesPrefix(st.name, q) ||
          matchesPrefix(st.nameTelugu, q) ||
          matchesPrefix(st.scheduleName, q);
        const salesMatch = (st.sales || []).some(
          (s) =>
            matchesPrefix(s.material, q) ||
            matchesPrefix(s.vendorName, q)
        );
        return custMatch || salesMatch;
      });
    }

    if (sortKey) {
      const dir = sortDir === 'desc' ? -1 : 1;
      list = [...list].sort((a, b) => {
        if (sortKey === 'name') {
          return String(a.name || '').localeCompare(String(b.name || ''), 'en', { numeric: true }) * dir;
        }
        if (sortKey === 'totalSale') {
          return ((Number(a.totalSale) || 0) - (Number(b.totalSale) || 0)) * dir;
        }
        if (sortKey === 'closing') {
          return ((Number(a.closing) || 0) - (Number(b.closing) || 0)) * dir;
        }
        return 0;
      });
    }

    return list;
  }, [data, filterCustomer, filterVendor, filterItem, filterSchedule, searchQuery, sortKey, sortDir]);

  // Keep selection synchronized with active filtered statements
  useEffect(() => {
    if (data?.statements) {
      setSelectedCids(new Set(filteredStatements.map((st) => String(st.customerId))));
    }
  }, [filteredStatements, data]);

  const selectedStatements = useMemo(() => {
    return filteredStatements.filter((st) => selectedCids.has(String(st.customerId)));
  }, [filteredStatements, selectedCids]);

  const toggleSelectAll = () => {
    if (selectedCids.size === filteredStatements.length) {
      setSelectedCids(new Set());
    } else {
      setSelectedCids(new Set(filteredStatements.map((st) => String(st.customerId))));
    }
  };

  const toggleSelectOne = (cid) => {
    setSelectedCids((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  };

  const toggleSort = (key) => {
    if (sortKey === key) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortKey('');
        setSortDir('asc');
      }
      return;
    }
    setSortKey(key);
    setSortDir('asc');
  };

  const handlePrintPDF = async () => {
    if (!selectedStatements.length) {
      toast.error('No bills selected to print');
      return;
    }
    setPrinting(true);
    try {
      await openRangeBillsNUp(selectedStatements, perPage);
    } catch (err) {
      toast.error(err.message || 'Failed to print');
    } finally {
      setPrinting(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (!selectedStatements.length) {
      toast.error('No bills selected');
      return;
    }

    setPrinting(true);
    try {
      for (const st of selectedStatements) {
        const cid = String(st.customerId);
        const matchedCust = customers.find(
          (c) => String(c._id) === cid || c.name.toLowerCase() === String(st.name || '').trim().toLowerCase()
        );
        let phone = matchedCust?.mobile || st.mobile || '';

        if (!phone) {
          phone = window.prompt(`Please enter 10-digit WhatsApp phone number for customer "${st.name}":`, '');
          if (!phone) {
            toast.error(`Skipped ${st.name} (no phone number provided)`);
            continue;
          }
        }

        const saleObj = {
          customer: matchedCust || { _id: st.customerId, name: st.name, nameTelugu: st.nameTelugu },
          createdAt: startDate,
          lines: st.sales || [],
          handlingCharges: st.sales?.reduce((acc, s) => acc + (Number(s.cooly) || (s.isCoolyLine ? Number(s.amount) || 0 : 0)), 0) || 0,
          totalAmount: st.totalSale,
        };

        const html = await generateSingleCustomerBillHtml(saleObj);
        const filename = `Customer_Bill_${st.name.replace(/[^a-zA-Z0-9]/g, '_')}_${startDate}.pdf`;

        await sendWhatsAppBillPdf({
          recipientPhone: phone,
          recipientName: st.name,
          htmlString: html,
          filename,
          caption: `Dear ${st.name}, your bill statement for date ${formatDateOnly(startDate)} total ₹${st.totalSale} is generated. Please find your bill attached below. Thank you, JSR Traders.`,
          templateName: 'customer_sales_bill',
          templateParams: [st.name, formatDateOnly(startDate), String(st.totalSale)],
        });
      }
    } catch (err) {
      toast.error(err.message || 'Failed to send WhatsApp');
    } finally {
      setPrinting(false);
    }
  };

  const SortHeader = ({ column, label }) => {
    const active = sortKey === column;
    const Icon = active ? (sortDir === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1 font-semibold hover:text-primary-800"
        onClick={() => toggleSort(column)}
      >
        {label}
        <Icon className={`w-3.5 h-3.5 ${active ? 'text-primary-800' : 'text-primary-400'}`} />
      </button>
    );
  };

  const hasFilters = !!(filterCustomer || filterVendor || filterItem);

  return (
    <div className="space-y-4 flex flex-col h-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
        <div>
          <h1 className="page-title">Bill Print</h1>
          <p className="text-primary-400 text-sm mt-0.5">
            Filter, preview, and print full customer ledger statements in 2, 4, or 6 per page layout
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isOnline && (
            <button
              type="button"
              className="btn-secondary !py-2 !px-3 text-xs"
              onClick={handleSendWhatsApp}
              disabled={!selectedStatements.length}
            >
              <Send className="w-4 h-4 text-emerald-600" /> Send WhatsApp
            </button>
          )}
          <button
            type="button"
            className="btn-primary !py-2 !px-4 text-xs"
            onClick={handlePrintPDF}
            disabled={!selectedStatements.length || printing}
          >
            <Printer className="w-4 h-4" /> {printing ? 'Opening PDF...' : 'Print / Save PDF'}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card !p-3 sm:!p-4 shrink-0 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-primary-500">From:</label>
            <input
              type="date"
              className="input-field !h-10 !py-1 text-sm !w-36"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-primary-500">To:</label>
            <input
              type="date"
              className="input-field !h-10 !py-1 text-sm !w-36"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <select
            className="input-field !h-10 !py-0 w-full sm:w-auto min-w-[140px] text-sm flex-1 sm:flex-initial"
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
          >
            <option value="">All customers ({availableCustomers.length})</option>
            {availableCustomers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            className="input-field !h-10 !py-0 w-full sm:w-auto min-w-[130px] text-sm flex-1 sm:flex-initial"
            value={filterVendor}
            onChange={(e) => setFilterVendor(e.target.value)}
          >
            <option value="">All vendors ({availableVendors.length})</option>
            {availableVendors.map((v) => (
              <option key={v._id} value={v._id}>
                {v.name}
              </option>
            ))}
          </select>

          <select
            className="input-field !h-10 !py-0 w-full sm:w-44 text-sm"
            value={filterItem}
            onChange={(e) => setFilterItem(e.target.value)}
          >
            <option value="">All items ({availableItems.length})</option>
            {availableItems.map((m) => (
              <option key={m._id} value={m._id}>
                {m.name}
              </option>
            ))}
          </select>

          <select
            className="input-field !h-10 !py-0 w-full sm:w-44 text-sm"
            value={filterSchedule}
            onChange={(e) => setFilterSchedule(e.target.value)}
          >
            <option value="">All schedules ({availableSchedules.length})</option>
            {availableSchedules.map((s) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-primary-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search customer, vendor, item, schedule..."
              className="input-field !h-10 !py-1 pl-9 pr-7 text-sm w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600 text-xs font-bold"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>

          {(filterCustomer || filterVendor || filterItem || filterSchedule || searchQuery.trim()) && (
            <button
              type="button"
              className="text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2"
              onClick={() => {
                setFilterCustomer('');
                setFilterVendor('');
                setFilterItem('');
                setFilterSchedule('');
                setSearchQuery('');
              }}
            >
              Clear filters
            </button>
          )}

          <button
            type="button"
            className="btn-secondary !h-10 !py-1 !px-3 text-xs ml-auto"
            onClick={fetchBills}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Main Workspace (Split View) */}
      <div className="flex flex-col xl:grid xl:grid-cols-12 gap-4 flex-1 min-h-0 overflow-y-auto xl:overflow-hidden">
        {/* Left Column: Records Table */}
        <div className="xl:col-span-3 flex flex-col card !p-0 overflow-hidden min-h-[220px] max-h-[300px] xl:max-h-none shrink-0 xl:shrink">
          <div className="px-3 py-2.5 border-b border-primary-100 bg-primary-50/50 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={toggleSelectAll} className="text-primary-600">
                {selectedCids.size === filteredStatements.length && filteredStatements.length > 0 ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4 text-primary-400" />
                )}
              </button>
              <span className="font-bold text-primary-800 text-xs">
                Selected {selectedStatements.length} / {filteredStatements.length}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="text-center py-16 text-primary-400 text-xs">Loading bills...</div>
            ) : filteredStatements.length === 0 ? (
              <div className="text-center py-16 text-primary-400 text-xs">No bills match filter</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-primary-50 border-b border-primary-100 z-10">
                  <tr className="text-left text-primary-600">
                    <th className="w-7 px-2 py-2"></th>
                    <th className="px-2 py-2 font-semibold">
                      <SortHeader column="name" label="Customer" />
                    </th>
                    <th className="px-2 py-2 font-semibold text-right">
                      <SortHeader column="totalSale" label="Sale" />
                    </th>
                    <th className="px-2 py-2 font-semibold text-right">
                      <SortHeader column="closing" label="Closing" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStatements.map((st) => {
                    const cid = String(st.customerId);
                    const selected = selectedCids.has(cid);
                    return (
                      <tr
                        key={cid}
                        onClick={() => toggleSelectOne(cid)}
                        className={`border-b border-primary-50 cursor-pointer transition ${
                          selected ? 'bg-primary-50/70 font-medium' : 'hover:bg-primary-50/30'
                        }`}
                      >
                        <td className="px-1.5 py-1.5 text-center" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => toggleSelectOne(cid)}>
                            {selected ? (
                              <CheckSquare className="w-3.5 h-3.5 text-primary-600" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-primary-300" />
                            )}
                          </button>
                        </td>
                        <td className="px-2 py-1.5 text-primary-800">
                          <div className="font-semibold text-xs leading-snug truncate max-w-[110px]">{st.name}</div>
                          {st.nameTelugu || st.scheduleName ? (
                            <span className="text-[11px] text-primary-400 truncate block">
                              {[st.nameTelugu, st.scheduleName ? `(${st.scheduleName})` : ''].filter(Boolean).join(' ')}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 text-right text-primary-700 font-semibold tabular-nums text-xs">
                          {formatCurrency(st.totalSale)}
                        </td>
                        <td className="px-2 py-1.5 text-right text-primary-800 font-bold tabular-nums text-xs">
                          {formatCurrency(st.closing)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Column: Live Bill Preview */}
        <div className="xl:col-span-9 flex flex-col card !p-0 overflow-hidden min-h-[300px] flex-1">
          <div className="px-4 py-2.5 border-b border-primary-100 bg-primary-50/50 flex items-center justify-between flex-wrap gap-2">
            <span className="font-bold text-primary-800 text-sm">
              Live Preview ({selectedStatements.length} Bills · {perPage} per page layout)
            </span>

            {/* Prominent Layout Toggle Buttons */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-primary-600 font-semibold">Layout:</span>
              {[2, 4, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPerPage(n)}
                  className={`px-3 py-1 text-xs rounded-md font-bold transition shadow-sm ${
                    perPage === n
                      ? 'bg-primary-800 text-white ring-2 ring-primary-400'
                      : 'bg-white text-primary-700 hover:bg-primary-100 border border-primary-200'
                  }`}
                >
                  {n} Per Page
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 bg-primary-100/50">
            {selectedStatements.length === 0 ? (
              <div className="text-center py-24 text-primary-400">
                <FileText className="w-12 h-12 text-primary-300 mx-auto mb-2" />
                <p className="font-medium text-primary-600">No bills selected for preview</p>
                <p className="text-xs mt-1 text-primary-400">Select customers on the left to see live preview</p>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
                {selectedStatements.slice(0, 12).map((st) => (
                  <div
                    key={st.customerId}
                    className="card !p-3.5 border border-primary-200 shadow-sm bg-white text-xs space-y-2.5 overflow-hidden"
                  >
                    <div className="text-center border-b border-primary-100 pb-2">
                      <p className="font-bold text-primary-900 text-base">{st.name}</p>
                      {st.nameTelugu || st.scheduleName ? (
                        <p className="text-xs text-primary-500 font-medium">
                          {[st.nameTelugu, st.scheduleName ? `· ${st.scheduleName}` : ''].filter(Boolean).join(' ')}
                        </p>
                      ) : null}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[340px]">
                        <thead>
                          <tr className="border-b border-primary-200 text-primary-600 font-semibold text-left bg-primary-50/70 whitespace-nowrap">
                            <th className="py-1.5 px-1 font-bold">తేదీ</th>
                            <th className="py-1.5 px-1 font-bold">వస్తువు</th>
                            <th className="py-1.5 px-1 text-right font-bold">బ్యాగ్</th>
                            <th className="py-1.5 px-1 text-right font-bold">బరువు (kg)</th>
                            <th className="py-1.5 px-1 text-right font-bold">ధర</th>
                            <th className="py-1.5 px-1 text-right font-bold">మొత్తం</th>
                          </tr>
                        </thead>
                      <tbody className="divide-y divide-primary-100">
                        <tr>
                          <td className="py-1 px-1"></td>
                          <td className="py-1 px-1 font-medium text-primary-700">Opening</td>
                          <td className="py-1 px-1"></td>
                          <td className="py-1 px-1"></td>
                          <td className="py-1 px-1"></td>
                          <td className="py-1 px-1 text-right font-semibold">{formatCurrency(st.opening)}</td>
                        </tr>
                        {(st.sales || [])
                          .filter((s) => String(s.material || '').toLowerCase() !== 'cooly' && !s.isCoolyLine)
                          .map((s, idx) => {
                          const baseAmount = Number(s.amount) || 0;
                          const coolyAmt = Number(s.cooly) || Number(s.handlingCharges) || 0;
                          const lineTotal = baseAmount + coolyAmt;

                          return (
                            <tr key={idx} className="hover:bg-primary-50/40 transition">
                              <td className="py-1.5 px-1 text-primary-500">{formatDateOnly(s.date)}</td>
                              <td className="py-1.5 px-1 font-medium text-primary-800">
                                <div>{s.material || 'Sale'}</div>
                                {teluguMap[String(s.material || '').trim().toLowerCase()] &&
                                teluguMap[String(s.material || '').trim().toLowerCase()] !== String(s.material || '').trim() ? (
                                  <span className="text-[10px] text-primary-400 font-normal block">
                                    {teluguMap[String(s.material || '').trim().toLowerCase()]}
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-1.5 px-1 text-right">{s.bags || '—'}</td>
                              <td className="py-1.5 px-1 text-right text-primary-600">
                                {s.weight ? `${s.weight}` : '—'}
                              </td>
                              <td className="py-1.5 px-1 text-right text-primary-600">
                                {s.ratePerKg ? `₹${s.ratePerKg}` : '—'}
                              </td>
                              <td className="py-1.5 px-1 text-right font-bold text-primary-800">
                                {formatCurrency(lineTotal)}
                                {coolyAmt > 0 ? (
                                  <span className="text-[10px] text-emerald-700 block font-normal">
                                    (incl. ₹{coolyAmt} cooly)
                                  </span>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="font-bold border-t border-primary-200 bg-primary-50/30">
                          <td className="py-1.5 px-1 font-bold" colSpan={5}>
                            Total
                          </td>
                          <td className="py-1.5 px-1 text-right font-bold text-primary-900">{formatCurrency(st.totalSale)}</td>
                        </tr>
                        <tr className="font-bold text-primary-900 border-t border-primary-200 bg-primary-50/60">
                          <td className="py-1.5 px-1 font-bold text-xs" colSpan={5}>
                            Closing
                          </td>
                          <td className="py-1.5 px-1 text-right font-bold text-sm text-primary-900">
                            {formatCurrency(st.closing)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
