import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Printer,
  Send,
  FileText,
  CheckSquare,
  Square,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  RefreshCw,
  Search,
  Eye,
  Calendar,
  Users,
  X,
} from 'lucide-react';
import { openPurchaseBillPreview } from '../utils/reportPrint';
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
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDate(date) {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
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
  const [billType, setBillType] = useState(() => (effectiveSearchParams.get('type') === 'purchase' ? 'purchase' : 'customer'));

  /* Track whether the windowPath change was triggered internally by our own
     updateWindowPath call (i.e. the user changed the From date), vs externally
     (e.g. navigating from another page). We skip re-syncing endDate on internal updates. */
  const isInternalPathUpdate = useRef(false);

  useEffect(() => {
    if (startDate && typeof updateWindowPath === 'function') {
      isInternalPathUpdate.current = true;
      updateWindowPath('/bill-print', `/bill-print?date=${startDate}&type=${billType}`);
    }
  }, [startDate, billType, updateWindowPath]);

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
    const pType = effectiveSearchParams.get('type');
    const pCust = effectiveSearchParams.get('customer');
    const pVend = effectiveSearchParams.get('vendor');
    const pItem = effectiveSearchParams.get('item');
    const pSched = effectiveSearchParams.get('schedule');
    if (pDate) {
      setStartDate(pDate);
      setEndDate(pDate);
    }
    if (pType === 'purchase' || pType === 'customer') setBillType(pType);
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
  const [viewColumns, setViewColumns] = useState(1);
  const [showCustomerList, setShowCustomerList] = useState(true);

  const [selectedCids, setSelectedCids] = useState(new Set());
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    api
      .get('/materials')
      .then((res) => {
        setMaterials(res.data || []);
        const tMap = {};
        (res.data || []).forEach((m) => {
          if (m.name && m.nameTelugu) {
            tMap[m.name.trim().toLowerCase()] = m.nameTelugu;
          }
        });
        setTeluguMap(tMap);
      })
      .catch(() => {});
  }, []);

  const fetchBills = useCallback(async () => {
    if (startDate > endDate) {
      toast.error('Start date must be before end date');
      return;
    }
    setLoading(true);
    try {
      if (billType === 'purchase') {
        const res = await api.get('/reports/purchase-bills', {
          params: { startDate, endDate },
        });
        setData(res.data);
        if (res.data?.statements) {
          setSelectedCids(new Set(res.data.statements.map((s) => String(s.customerId))));
        }
      } else {
        const res = await api.get('/reports/bills', {
          params: { startDate, endDate },
        });
        setData(res.data);
        if (res.data?.statements) {
          setSelectedCids(new Set(res.data.statements.map((s) => String(s.customerId))));
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load bills');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, billType]);

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
      if (st.isPurchase) {
        const vId = st.vendor?._id ? String(st.vendor._id) : String(st.vendorId || '');
        const vName = st.vendor?.name || st.name || '';
        if (vId && !map.has(vId)) {
          map.set(vId, {
            _id: vId,
            name: vName || 'Vendor',
          });
        }
      } else {
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
      if (filterCustomer && !st.isPurchase) {
        const scid = String(st.customerId || '');
        if (scid !== filterCustomer && st.name !== filterCustomer) return false;
      }
      if (filterVendor) {
        if (st.isPurchase) {
          const vId = String(st.vendor?._id || st.vendorId || '');
          if (vId !== filterVendor && st.name !== filterVendor) return false;
        } else {
          const hasVendor = (st.sales || []).some(
            (s) => String(s.vendorId || '') === filterVendor || s.vendorName === filterVendor
          );
          if (!hasVendor) return false;
        }
      }
      if (filterItem) {
        const hasItem = (st.sales || []).some(
          (s) =>
            String(s.materialId || '') === filterItem ||
            (s.material || '').toLowerCase() === filterItem.toLowerCase()
        );
        if (!hasItem) return false;
      }
      if (filterSchedule && !st.isPurchase) {
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
        return matchesPrefix(st.name, q) || matchesPrefix(st.nameTelugu, q);
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
        if (st.isPurchase) {
          let phone = st.mobile || st.vendor?.mobile || '';
          if (!phone) {
            phone = window.prompt(`Please enter 10-digit WhatsApp phone number for vendor "${st.name}":`, '');
            if (!phone) {
              toast.error(`Skipped ${st.name} (no phone number provided)`);
              continue;
            }
          }
          const cleanPhone = phone.replace(/\D/g, '');
          const periodStr = startDate === endDate ? formatDateOnly(startDate) : `${formatDateOnly(startDate)} to ${formatDateOnly(endDate)}`;
          const text = `*JSR AGRI TRADES - Purchase Bill*\nVendor: ${st.name}\nPeriod: ${periodStr}\nTotal Bags: ${st.totalBags || '—'}\nTotal Weight: ${Number(st.totalWeight || 0).toFixed(1)} kg\n*Total Amount: ${formatCurrency(st.totalAmount || st.totalSale)}*\nClosing Balance: ${formatCurrency(st.closing)}\nThank you! 🙏`;
          window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`, '_blank');
          continue;
        }

        const cid = String(st.customerId);
        let phone = st.mobile || '';

        if (!phone) {
          phone = window.prompt(`Please enter 10-digit WhatsApp phone number for customer "${st.name}":`, '');
          if (!phone) {
            toast.error(`Skipped ${st.name} (no phone number provided)`);
            continue;
          }
        }

        const saleObj = {
          customer: { _id: st.customerId, name: st.name, nameTelugu: st.nameTelugu },
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

  const SortHeader = ({ column, label, align = 'left' }) => {
    const active = sortKey === column;
    const Icon = active ? (sortDir === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1 font-semibold text-xs uppercase tracking-tight hover:text-primary-800 cursor-pointer ${
          align === 'right' ? 'w-full justify-end text-right' : 'text-left'
        }`}
        onClick={() => toggleSort(column)}
      >
        <span>{label}</span>
        <Icon className={`w-3 h-3 shrink-0 ${active ? 'text-primary-800' : 'text-primary-400'}`} />
      </button>
    );
  };

  const hasFilters = !!(filterCustomer || filterVendor || filterItem || filterSchedule || searchQuery.trim());

  return (
    <div className="space-y-3 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div>
          <h1 className="page-title">Bill Print</h1>
          <p className="text-xs text-primary-500 mt-0.5">
            {billType === 'purchase'
              ? 'Filter, preview, and print vendor purchase bills in 2, 4, or 6 per page layout'
              : 'Filter, preview, and print full customer ledger statements in 2, 4, or 6 per page layout'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap shrink-0">
          {/* Bill Type Switcher */}
          <div className="flex items-center gap-1 bg-primary-100/80 p-1 rounded-xl border border-primary-200">
            <button
              type="button"
              onClick={() => {
                setBillType('customer');
                setFilterCustomer('');
                setFilterVendor('');
                setFilterItem('');
                setFilterSchedule('');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                billType === 'customer'
                  ? 'bg-primary-800 text-white shadow-xs'
                  : 'text-primary-600 hover:text-primary-900 hover:bg-primary-200/50'
              }`}
            >
              Customer Bills
            </button>
            <button
              type="button"
              onClick={() => {
                setBillType('purchase');
                setFilterCustomer('');
                setFilterVendor('');
                setFilterItem('');
                setFilterSchedule('');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                billType === 'purchase'
                  ? 'bg-primary-800 text-white shadow-xs'
                  : 'text-primary-600 hover:text-primary-900 hover:bg-primary-200/50'
              }`}
            >
              Purchase Bills
            </button>
          </div>

          {isOnline && (
            <button
              type="button"
              className="btn-secondary !py-1.5 !px-3 !text-sm font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
              onClick={handleSendWhatsApp}
              disabled={!selectedStatements.length}
            >
              <Send className="w-4 h-4 text-emerald-600" /> Send WhatsApp
            </button>
          )}
          <button
            type="button"
            className="btn-primary !py-1.5 !px-3.5 !text-sm font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer"
            onClick={handlePrintPDF}
            disabled={!selectedStatements.length || printing}
          >
            <Printer className="w-4 h-4" /> {printing ? 'Opening PDF...' : 'Print / Save PDF'}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card !p-2.5 shrink-0 space-y-2">
        {/* Row 1: Date Range, Search & Actions */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-semibold text-primary-600">From:</span>
            <input
              type="date"
              className="h-9 w-36 rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-semibold text-primary-600">To:</span>
            <input
              type="date"
              className="h-9 w-36 rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="relative flex-1 min-w-[130px]">
            <Search className="w-3.5 h-3.5 text-primary-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder={billType === 'purchase' ? 'Search vendor name...' : 'Search customer name...'}
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface pl-8 pr-6 text-sm font-medium text-primary-700 placeholder:text-primary-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600 text-xs font-bold cursor-pointer"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>

          {hasFilters && (
            <button
              type="button"
              className="text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg px-2.5 h-9 flex items-center gap-1 transition cursor-pointer shrink-0"
              onClick={() => {
                setFilterCustomer('');
                setFilterVendor('');
                setFilterItem('');
                setFilterSchedule('');
                setSearchQuery('');
              }}
              title="Clear active filters"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}

          <button
            type="button"
            className="btn-secondary !h-9 !py-1 !px-3 !text-sm font-semibold rounded-lg flex items-center gap-1.5 shrink-0 cursor-pointer"
            onClick={fetchBills}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Row 2: Filter Select Dropdowns */}
        <div className="flex items-center gap-2">
          {billType === 'customer' && (
            <select
              className="h-9 flex-1 min-w-[120px] rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition truncate"
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
          )}

          <select
            className="h-9 flex-1 min-w-[110px] rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition truncate"
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
            className="h-9 flex-1 min-w-[110px] rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition truncate"
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

          {billType === 'customer' && (
            <select
              className="h-9 flex-1 min-w-[110px] rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition truncate"
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
          )}
        </div>
      </div>

      {/* Main Workspace (Split View) */}
      <div className="flex flex-col md:flex-row gap-2.5 flex-1 min-h-0 overflow-hidden">
        {/* Left Column: Records Table (Collapsible) */}
        {showCustomerList && (
          <div className="w-full md:w-64 lg:w-72 min-w-[250px] max-w-[280px] flex flex-col card !p-0 overflow-hidden min-h-[160px] max-h-[240px] md:max-h-none shrink-0 border border-primary-200">
            <div className="px-2.5 py-2 border-b border-primary-100 bg-primary-50/70 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={toggleSelectAll} className="text-primary-600 cursor-pointer">
                  {selectedCids.size === filteredStatements.length && filteredStatements.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-primary-700" />
                  ) : (
                    <Square className="w-4 h-4 text-primary-400" />
                  )}
                </button>
                <span className="font-bold text-primary-800 text-xs">
                  Selected {selectedStatements.length} / {filteredStatements.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomerList(false)}
                className="text-xs font-semibold text-primary-500 hover:text-primary-800 px-1.5 py-0.5 rounded hover:bg-primary-100 transition cursor-pointer"
                title="Hide list to expand bill preview"
              >
                Hide
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {loading ? (
                <div className="text-center py-12 text-primary-400 text-xs">Loading bills...</div>
              ) : filteredStatements.length === 0 ? (
                <div className="text-center py-12 text-primary-400 text-xs">No bills match filter</div>
              ) : (
                <table className="w-full text-xs table-fixed">
                  <thead className="sticky top-0 bg-primary-50 border-b border-primary-100 z-10 text-xs">
                    <tr className="text-left text-primary-600">
                      <th className="w-7 px-1 py-1.5 text-center"></th>
                      <th className="px-2 py-1.5 font-semibold">
                        <SortHeader column="name" label={billType === 'purchase' ? 'Vendor' : 'Customer'} />
                      </th>
                      <th className="px-1.5 py-1.5 font-semibold text-right w-16">
                        <SortHeader
                          column="totalSale"
                          label={billType === 'purchase' ? 'Amount' : 'Sale'}
                          align="right"
                        />
                      </th>
                      <th className="px-2 py-1.5 font-semibold text-right w-18">
                        <SortHeader
                          column="closing"
                          label={billType === 'purchase' ? 'Balance' : 'Closing'}
                          align="right"
                        />
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
                          className={`border-b border-primary-100 cursor-pointer transition ${
                            selected ? 'bg-primary-100/60 font-medium' : 'hover:bg-primary-50/40'
                          }`}
                        >
                          <td className="px-1 py-1 text-center w-7" onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => toggleSelectOne(cid)} className="cursor-pointer">
                              {selected ? (
                                <CheckSquare className="w-4 h-4 text-primary-600" />
                              ) : (
                                <Square className="w-4 h-4 text-primary-300" />
                              )}
                            </button>
                          </td>
                          <td className="px-2 py-1 text-primary-800 min-w-0">
                            <div className="font-semibold text-xs leading-snug truncate" title={st.name}>
                              {st.name}
                            </div>
                            {st.isPurchase ? (
                              <span className="text-xs text-primary-400 truncate block">
                                {[st.nameTelugu, st.city, st.totalBags ? `${st.totalBags} bags` : ''].filter(Boolean).join(' · ')}
                              </span>
                            ) : st.nameTelugu || st.scheduleName ? (
                              <span className="text-xs text-primary-400 truncate block">
                                {[st.nameTelugu, st.scheduleName ? `(${st.scheduleName})` : ''].filter(Boolean).join(' ')}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-1.5 py-1 text-right text-primary-700 font-semibold tabular-nums text-xs whitespace-nowrap w-16">
                            {formatCurrency(st.totalSale)}
                          </td>
                          <td className="px-2 py-1 text-right text-primary-800 font-bold tabular-nums text-xs whitespace-nowrap w-18">
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
        )}

        {/* Right Column: Live Bill Preview */}
        <div className="flex-1 min-w-0 flex flex-col card !p-0 overflow-hidden border border-primary-200">
          <div className="px-3 py-2 border-b border-primary-100 bg-primary-50/70 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {!showCustomerList && (
                <button
                  type="button"
                  onClick={() => setShowCustomerList(true)}
                  className="px-2.5 py-1 rounded-lg border border-primary-200 bg-white text-primary-700 hover:bg-primary-100 text-xs font-semibold flex items-center gap-1 transition cursor-pointer shadow-2xs"
                  title="Show list"
                >
                  <Users className="w-3.5 h-3.5 text-primary-500" /> Show List
                </button>
              )}
              <span className="font-bold text-primary-800 text-sm">
                Live Preview ({selectedStatements.length} {billType === 'purchase' ? 'Purchase Bills' : 'Bills'})
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* View Layout Toggle: 1 Column vs 2 Columns */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-primary-500 font-semibold uppercase tracking-wide">View:</span>
                <button
                  type="button"
                  onClick={() => setViewColumns(1)}
                  className={`px-2.5 py-1 text-xs rounded-md font-semibold transition cursor-pointer ${
                    viewColumns === 1
                      ? 'bg-primary-800 text-white shadow-xs'
                      : 'bg-white text-primary-700 hover:bg-primary-100 border border-primary-200'
                  }`}
                  title="1 Column (Full Width - Zero Scrolling)"
                >
                  1 Col
                </button>
                <button
                  type="button"
                  onClick={() => setViewColumns(2)}
                  className={`px-2.5 py-1 text-xs rounded-md font-semibold transition cursor-pointer ${
                    viewColumns === 2
                      ? 'bg-primary-800 text-white shadow-xs'
                      : 'bg-white text-primary-700 hover:bg-primary-100 border border-primary-200'
                  }`}
                  title="2 Columns Side by Side"
                >
                  2 Cols
                </button>
              </div>

              {/* PDF Print N-Up Toggle */}
              <div className="flex items-center gap-1.5 border-l border-primary-200 pl-3">
                <span className="text-xs text-primary-500 font-semibold uppercase tracking-wide">Print:</span>
                {[2, 4, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPerPage(n)}
                    className={`px-2 py-1 text-xs rounded-md font-semibold transition cursor-pointer ${
                      perPage === n
                        ? 'bg-primary-800 text-white shadow-xs'
                        : 'bg-white text-primary-700 hover:bg-primary-100 border border-primary-200'
                    }`}
                  >
                    {n}/page
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-3 bg-primary-50/30">
            {selectedStatements.length === 0 ? (
              <div className="text-center py-20 text-primary-400">
                <FileText className="w-10 h-10 text-primary-300 mx-auto mb-2" />
                <p className="font-medium text-primary-600 text-sm">No bills selected for preview</p>
                <p className="text-xs mt-1 text-primary-400">
                  Select {billType === 'purchase' ? 'vendors' : 'customers'} on the left to see live preview
                </p>
              </div>
            ) : (
              <div className={`grid gap-3 ${viewColumns === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
                {selectedStatements.slice(0, 12).map((st) => (
                  <div
                    key={st.customerId}
                    className="card !p-0 border border-primary-200 shadow-sm bg-white overflow-hidden flex flex-col"
                  >
                    <div className="bg-primary-50/90 px-3 py-1.5 border-b border-primary-200 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-bold text-primary-900 text-sm truncate">{st.name}</span>
                        {st.isPurchase ? (
                          <span className="text-xs text-primary-600 font-medium truncate">
                            ({[st.nameTelugu, st.city].filter(Boolean).join(' · ') || 'Vendor'})
                          </span>
                        ) : st.nameTelugu || st.scheduleName ? (
                          <span className="text-xs text-primary-600 font-medium truncate">
                            ({[st.nameTelugu, st.scheduleName ? `· ${st.scheduleName}` : ''].filter(Boolean).join(' ')})
                          </span>
                        ) : null}
                      </div>

                      {st.isPurchase && (
                        <button
                          type="button"
                          onClick={() => openPurchaseBillPreview(st.rawPurchase || st)}
                          className="btn-secondary !py-1 !px-2.5 !text-xs flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                          title="Open full page purchase bill"
                        >
                          <Eye className="w-3.5 h-3.5 text-primary-500" /> Full View
                        </button>
                      )}
                    </div>

                    <div className="overflow-x-auto flex-1">
                      <table className="w-full text-xs excel-grid border border-primary-200">
                        <thead>
                          <tr className="bg-accent-200 text-accent-900 text-left whitespace-nowrap">
                            <th className="bg-accent-200 px-2 py-1.5 font-bold text-center w-20 text-xs">తేదీ</th>
                            <th className="bg-accent-200 px-2 py-1.5 font-bold min-w-[6rem] text-xs">వస్తువు</th>
                            <th className="bg-accent-200 px-1.5 py-1.5 text-right font-bold w-12 text-xs">బ్యాగ్</th>
                            <th className="bg-accent-200 px-2 py-1.5 text-right font-bold w-16 text-xs">బరువు (kg)</th>
                            <th className="bg-accent-200 px-2 py-1.5 text-right font-bold w-16 text-xs">ధర</th>
                            <th className="bg-accent-200 px-2 py-1.5 text-right font-bold w-20 text-xs">మొత్తం</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-surface hover:bg-primary-50/40 text-xs">
                            <td className="px-2 py-1 text-center text-primary-400 text-xs">—</td>
                            <td className="px-2 py-1 font-semibold text-primary-700">Opening</td>
                            <td className="px-1.5 py-1 text-center text-primary-400 text-xs">—</td>
                            <td className="px-2 py-1 text-center text-primary-400 text-xs">—</td>
                            <td className="px-2 py-1 text-center text-primary-400 text-xs">—</td>
                            <td className="px-2 py-1 text-right font-semibold tabular-nums text-primary-800">
                              {formatCurrency(st.opening || 0)}
                            </td>
                          </tr>
                          {(() => {
                            const rawEntries = (st.entries && st.entries.length)
                              ? st.entries
                              : [
                                  ...(st.sales || []).map((s) => ({ ...s, isPayment: false })),
                                  ...(st.payments || []).map((p) => ({
                                    ...p,
                                    isPayment: true,
                                    material: p.description || 'Paid',
                                  })),
                                ].sort(
                                  (a, b) =>
                                    new Date(a.date || a.createdAt || 0).getTime() -
                                    new Date(b.date || b.createdAt || 0).getTime()
                                );

                            const validEntries = rawEntries.filter(
                              (entry) => String(entry.material || '').toLowerCase() !== 'cooly' && !entry.isCoolyLine
                            );

                            const renderedRows = [];
                            let runningBalance = Number(st.opening || 0);

                            for (let i = 0; i < validEntries.length; i++) {
                              const entry = validEntries[i];

                              if (entry.isPayment || entry.type === 'payment') {
                                const payGroup = [entry];
                                while (
                                  i + 1 < validEntries.length &&
                                  (validEntries[i + 1].isPayment || validEntries[i + 1].type === 'payment')
                                ) {
                                  i++;
                                  payGroup.push(validEntries[i]);
                                }

                                // 1. Intermediate Subtotal before payment group
                                renderedRows.push(
                                  <tr
                                    key={`subtotal-${i}`}
                                    className="bg-primary-100/70 font-semibold text-xs border-t border-primary-200"
                                  >
                                    <td className="px-2 py-1 text-center text-primary-400 text-xs">—</td>
                                    <td className="px-2 py-1 font-bold text-primary-800" colSpan={4}>
                                      మొత్తం (Subtotal)
                                    </td>
                                    <td className="px-2 py-1 text-right font-bold tabular-nums text-primary-900">
                                      {formatCurrency(runningBalance)}
                                    </td>
                                  </tr>
                                );

                                // 2. Payment rows
                                payGroup.forEach((p, pIdx) => {
                                  const pAmt = Number(p.amount) || 0;
                                  runningBalance -= pAmt;
                                  renderedRows.push(
                                    <tr
                                      key={`pay-${i}-${pIdx}`}
                                      className="text-emerald-800 bg-emerald-50/60 text-xs font-medium"
                                    >
                                      <td className="px-2 py-1 text-center whitespace-nowrap tabular-nums text-xs">
                                        {formatShortDate(p.date)}
                                      </td>
                                      <td className="px-2 py-1 font-semibold text-emerald-800" colSpan={4}>
                                        <div className="flex items-center gap-1">
                                          <span>Paid</span>
                                          <span className="text-xs text-emerald-600 font-normal">(చెల్లింపు)</span>
                                        </div>
                                      </td>
                                      <td className="px-2 py-1 text-right font-bold text-emerald-800 whitespace-nowrap tabular-nums text-xs">
                                        - {formatCurrency(pAmt)}
                                      </td>
                                    </tr>
                                  );
                                });

                                // 3. Intermediate Balance Tally row
                                renderedRows.push(
                                  <tr
                                    key={`tally-${i}`}
                                    className="bg-amber-50/80 font-bold text-xs text-primary-900 border-t border-b border-dashed border-amber-300"
                                  >
                                    <td className="px-2 py-1 text-center text-primary-400 text-xs">—</td>
                                    <td className="px-2 py-1 font-bold text-primary-900" colSpan={4}>
                                      <div className="flex items-center gap-1">
                                        <span>బాకీ</span>
                                        <span className="text-xs text-primary-600 font-normal">(Balance)</span>
                                      </div>
                                    </td>
                                    <td className="px-2 py-1 text-right font-bold tabular-nums text-primary-900">
                                      {formatCurrency(runningBalance)}
                                    </td>
                                  </tr>
                                );

                                continue;
                              }

                              const baseAmount = Number(entry.amount) || 0;
                              const coolyAmt = Number(entry.cooly) || Number(entry.handlingCharges) || 0;
                              const lineTotal = baseAmount + coolyAmt;
                              runningBalance += lineTotal;

                              renderedRows.push(
                                <tr
                                  key={`sale-${i}`}
                                  className={
                                    renderedRows.length % 2 === 0
                                      ? 'bg-surface hover:bg-primary-50/40 text-xs'
                                      : 'bg-primary-50/20 hover:bg-primary-50/50 text-xs'
                                  }
                                >
                                  <td className="px-2 py-1 text-primary-600 text-center whitespace-nowrap tabular-nums text-xs">
                                    {formatShortDate(entry.date)}
                                  </td>
                                  <td className="px-2 py-1 min-w-[6rem] font-semibold text-primary-800">
                                    <span title={entry.material || 'Sale'}>{entry.material || 'Sale'}</span>
                                    {teluguMap[String(entry.material || '').trim().toLowerCase()] &&
                                    teluguMap[String(entry.material || '').trim().toLowerCase()] !== String(entry.material || '').trim() ? (
                                      <span className="text-xs text-primary-400 font-normal block">
                                        {teluguMap[String(entry.material || '').trim().toLowerCase()]}
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="px-1.5 py-1 text-right tabular-nums text-primary-800 font-semibold w-12">
                                    {entry.bags || '—'}
                                  </td>
                                  <td className="px-2 py-1 text-right text-primary-700 font-medium tabular-nums w-16">
                                    {entry.weight ? `${entry.weight}` : '—'}
                                  </td>
                                  <td className="px-2 py-1 text-right text-primary-700 font-medium tabular-nums w-16">
                                    {entry.ratePerKg ? `₹${entry.ratePerKg}` : '—'}
                                  </td>
                                  <td className="px-2 py-1 text-right font-bold text-primary-900 whitespace-nowrap tabular-nums text-xs w-20">
                                    {formatCurrency(lineTotal)}
                                    {coolyAmt > 0 ? (
                                      <span className="text-[10px] text-emerald-700 block font-normal leading-tight">
                                        (incl. ₹{coolyAmt} cooly)
                                      </span>
                                    ) : null}
                                  </td>
                                </tr>
                              );
                            }

                            return renderedRows;
                          })()}
                        </tbody>
                        <tfoot className="border-t-2 border-primary-300 bg-accent-200">
                          <tr className="bg-accent-200 text-accent-900 font-bold whitespace-nowrap text-xs">
                            <td className="bg-accent-200 px-2 py-1.5 font-bold text-xs uppercase tracking-wide text-accent-900" colSpan={5}>
                              Total
                            </td>
                            <td className="bg-accent-200 px-2 py-1.5 text-right font-bold text-sm tabular-nums text-accent-900">
                              {formatCurrency(st.totalSale)}
                            </td>
                          </tr>
                          <tr className="bg-accent-100/70 text-accent-900 font-bold whitespace-nowrap text-xs">
                            <td className="bg-accent-100/70 px-2 py-1.5 font-bold text-xs uppercase tracking-wide text-accent-900" colSpan={5}>
                              Closing
                            </td>
                            <td className="bg-accent-100/70 px-2 py-1.5 text-right font-bold text-sm tabular-nums text-accent-900">
                              {formatCurrency(st.closing)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                    <div className="flex items-center justify-between px-3 py-1 bg-primary-50/40 border-t border-primary-100 text-xs text-primary-400 font-medium shrink-0">
                      <span>Live Bill Preview</span>
                      <span>{(st.entries || st.sales || []).length} items</span>
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
