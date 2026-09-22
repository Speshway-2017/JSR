import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, Send, FileText, CheckSquare, Square, ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, Edit2, Calendar, CheckCircle2, DollarSign, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDateOnly } from '../utils/format';
import { openRangeBillsNUp } from '../utils/rangeBillPrint';
import { generateSingleCustomerBillHtml } from '../utils/customerSaleBillPdf';
import { sendWhatsAppBillPdf } from '../utils/whatsappSender';
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

export default function SalesPrint({ path: windowPath }) {
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

  useEffect(() => {
    if (startDate && typeof updateWindowPath === 'function') {
      updateWindowPath('/sales-print', `/sales-print?date=${startDate}`);
    }
  }, [startDate, updateWindowPath]);

  const [filterCustomer, setFilterCustomer] = useState(effectiveSearchParams.get('customer') || '');
  const [filterVendor, setFilterVendor] = useState(effectiveSearchParams.get('vendor') || '');
  const [filterItem, setFilterItem] = useState(effectiveSearchParams.get('item') || '');

  useEffect(() => {
    const pDate = effectiveSearchParams.get('date');
    const pCust = effectiveSearchParams.get('customer');
    const pVend = effectiveSearchParams.get('vendor');
    const pItem = effectiveSearchParams.get('item');
    if (pDate) {
      setStartDate(pDate);
      setEndDate(pDate);
    }
    if (pCust !== null && pCust !== undefined) setFilterCustomer(pCust);
    if (pVend !== null && pVend !== undefined) setFilterVendor(pVend);
    if (pItem !== null && pItem !== undefined) setFilterItem(pItem);
  }, [windowPath, effectiveSearchParams]);

  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
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

  const cellStyle = 'grid-input text-[11px] leading-tight w-full';

  useEffect(() => {
    Promise.all([
      api.get('/customers').catch(() => ({ data: [] })),
      api.get('/vendors').catch(() => ({ data: [] })),
      api.get('/materials').catch(() => ({ data: [] })),
    ]).then(([cRes, vRes, mRes]) => {
      setCustomers(cRes.data || []);
      setVendors(vRes.data || []);
      setMaterials(mRes.data || []);
      const tMap = {};
      (mRes.data || []).forEach((m) => {
        if (m.name && m.nameTelugu) {
          tMap[m.name.trim().toLowerCase()] = m.nameTelugu;
        }
      });
      setTeluguMap(tMap);
    });
  }, []);

  const fetchSalesBills = useCallback(async () => {
    if (startDate > endDate) {
      toast.error('Start date must be before end date');
      return;
    }
    setLoading(true);
    try {
      const res = await api.get('/reports/sales-bills', {
        params: { startDate, endDate },
      });
      setData(res.data);
      if (res.data?.statements) {
        setSelectedCids(new Set(res.data.statements.map((s) => String(s.customerId))));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load sales bills');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchSalesBills();
  }, [fetchSalesBills, windowPath]);

  useDataRestored(fetchSalesBills);

  useEffect(() => {
    const handleUpdate = () => {
      fetchSalesBills();
    };
    window.addEventListener('jsr_data_updated', handleUpdate);
    return () => window.removeEventListener('jsr_data_updated', handleUpdate);
  }, [fetchSalesBills]);

  useEffect(() => {
    const handleSalesDateChanged = (e) => {
      const newDate = e.detail?.date;
      if (newDate) {
        setStartDate(newDate);
        setEndDate(newDate);
      }
    };
    window.addEventListener('jsr_sales_date_changed', handleSalesDateChanged);
    return () => window.removeEventListener('jsr_sales_date_changed', handleSalesDateChanged);
  }, []);

  // Dynamically derive available dropdown options based strictly on active sales data
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
  }, [availableCustomers, availableVendors, availableItems, filterCustomer, filterVendor, filterItem]);

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
      return true;
    });

    if (sortKey) {
      const dir = sortDir === 'desc' ? -1 : 1;
      list = [...list].sort((a, b) => {
        if (sortKey === 'name') {
          return String(a.name || '').localeCompare(String(b.name || ''), 'en', { numeric: true }) * dir;
        }
        if (sortKey === 'totalSale') {
          return ((Number(a.totalSale) || 0) - (Number(b.totalSale) || 0)) * dir;
        }
        return 0;
      });
    }

    return list;
  }, [data, filterCustomer, filterVendor, filterItem, sortKey, sortDir]);

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
      toast.error('No sales selected to print');
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
      toast.error('No sales selected');
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
          handlingCharges: st.sales?.reduce((acc, s) => acc + (s.isCoolyLine ? (Number(s.amount) || 0) : 0), 0) || 0,
          totalAmount: st.totalSale,
        };

        const html = await generateSingleCustomerBillHtml(saleObj);
        const filename = `Sales_Bill_${st.name.replace(/[^a-zA-Z0-9]/g, '_')}_${startDate}.pdf`;

        await sendWhatsAppBillPdf({
          recipientPhone: phone,
          recipientName: st.name,
          htmlString: html,
          filename,
          caption: `Dear ${st.name}, your sales bill for date ${formatDateOnly(startDate)} total ₹${st.totalSale} is generated. Please find your bill attached below. Thank you, JSR Traders.`,
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

  const persistSaleLine = async (st, s, patch) => {
    if (!s || !s.saleId) {
      toast.error('Cannot update this sale record');
      return;
    }

    try {
      const cid = String(st.customerId);
      const matchedCust = customers.find(
        (c) => String(c._id) === cid || c.name.toLowerCase() === String(st.name || '').trim().toLowerCase()
      );
      const resolvedCustId = matchedCust ? String(matchedCust._id) : cid;

      const matchedVendor = vendors.find(
        (v) => String(v._id) === String(s.vendorId || '') || v.name.toLowerCase() === String(s.vendorName || '').trim().toLowerCase()
      );
      const resolvedVendorId = matchedVendor ? String(matchedVendor._id) : (vendors[0]?._id ? String(vendors[0]._id) : '');

      const isByBag = patch.saleType !== undefined ? patch.saleType === 'by_bag' : s.saleType === 'by_bag';
      const bagsCount = patch.bags !== undefined ? Math.max(1, Math.floor(Number(patch.bags)) || 1) : (Number(s.bags) || 1);
      const totalKg = patch.weight !== undefined ? (Number(patch.weight) || 0) : (Number(s.weight) || 0);
      const rate = patch.ratePerKg !== undefined ? (Number(patch.ratePerKg) || 0) : (Number(s.ratePerKg) || 0);
      const cooly = patch.cooly !== undefined ? (Number(patch.cooly) || 0) : (Number(s.cooly || s.handlingCharges) || 0);

      let matId = patch.materialId;
      if (!matId) {
        const matchedMat = materials.find(
          (m) => String(m._id) === String(s.materialId || '') || m.name.toLowerCase() === String(s.material || '').trim().toLowerCase()
        );
        matId = matchedMat ? String(matchedMat._id) : (materials[0]?._id ? String(materials[0]._id) : '');
      }

      let bagEntries = [];
      if (!isByBag && totalKg > 0) {
        const perBagKg = Number((totalKg / bagsCount).toFixed(2));
        bagEntries = Array.from({ length: bagsCount }, () => ({ kgs: perBagKg }));
      }

      const payload = {
        customerId: resolvedCustId,
        vendorId: resolvedVendorId,
        date: s.date || startDate,
        handlingCharges: cooly,
        coolyRate: s.coolyRate || cooly,
        coolyPerBag: s.coolyPerBag || false,
        lines: [
          {
            materialId: matId,
            saleType: isByBag ? 'by_bag' : 'by_weight',
            ratePerKg: rate,
            bags: bagEntries,
            bagCount: bagsCount,
            totalKg: isByBag ? 0 : totalKg,
          },
        ],
      };

      await api.put(`/sales/${s.saleId}`, payload);
      toast.success('Sale updated');
      await fetchSalesBills();
      window.dispatchEvent(new CustomEvent('jsr_data_updated'));
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update sale');
    }
  };

  const handleGridKeyDown = (e, rowIdx, colIdx) => {
    const { key } = e;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;

    const el = e.currentTarget || e.target;
    const isInput = el.tagName === 'INPUT' && !el.readOnly;

    // For text inputs, ArrowLeft/Right should move cursor within the
    // text unless the caret is already at the boundary (start/end).
    if (isInput && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      const pos = el.selectionStart;
      const len = (el.value || '').length;
      const hasSelection = el.selectionStart !== el.selectionEnd;
      if (hasSelection) return; // let browser collapse selection first
      if (key === 'ArrowLeft' && pos > 0) return;   // cursor not at start
      if (key === 'ArrowRight' && pos < len) return; // cursor not at end
    }

    let targetRow = rowIdx;
    let targetCol = colIdx;

    if (key === 'ArrowDown') {
      targetRow = rowIdx + 1;
    } else if (key === 'ArrowUp') {
      targetRow = Math.max(0, rowIdx - 1);
    } else if (key === 'ArrowRight') {
      targetCol = Math.min(3, colIdx + 1);
    } else if (key === 'ArrowLeft') {
      targetCol = Math.max(0, colIdx - 1);
    }

    if (targetRow === rowIdx && targetCol === colIdx) return;

    const selector = `[data-print-row="${targetRow}"][data-print-col="${targetCol}"]`;
    const targetEl = document.querySelector(selector);
    if (targetEl) {
      e.preventDefault();
      targetEl.focus();
      if (typeof targetEl.select === 'function') {
        setTimeout(() => {
          try { targetEl.select(); } catch (_) {}
        }, 0);
      }
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
      const rowCells = document.querySelectorAll(`[data-print-row="${targetRow}"]`);
      if (rowCells.length > 0) {
        e.preventDefault();
        const closestCell = Array.from(rowCells).reduce((prev, curr) => {
          const prevCol = parseInt(prev.getAttribute('data-print-col') || '0', 10);
          const currCol = parseInt(curr.getAttribute('data-print-col') || '0', 10);
          return Math.abs(currCol - colIdx) < Math.abs(prevCol - colIdx) ? curr : prev;
        });
        closestCell.focus();
        if (typeof closestCell.select === 'function') {
          setTimeout(() => {
            try { closestCell.select(); } catch (_) {}
          }, 0);
        }
      }
    }
  };


  const SortHeader = ({ column, label, align = 'left' }) => {
    const active = sortKey === column;
    const Icon = active ? (sortDir === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-0.5 font-semibold text-[10px] uppercase tracking-tight hover:text-primary-800 cursor-pointer ${
          align === 'right' ? 'w-full justify-end text-right' : 'text-left'
        }`}
        onClick={() => toggleSort(column)}
      >
        <span>{label}</span>
        <Icon className={`w-2.5 h-2.5 shrink-0 ${active ? 'text-primary-800' : 'text-primary-400'}`} />
      </button>
    );
  };

  const hasFilters = !!(filterCustomer || filterVendor || filterItem);

  return (
    <div className="space-y-2.5 flex flex-col h-full overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0">
        <div>
          <h1 className="text-sm font-bold text-primary-800">Sales Print</h1>
          <p className="text-primary-400 text-[11px] mt-0.5">
            Filter, preview, and print customer sales bills for active sales entries
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          {isOnline && (
            <button
              type="button"
              className="btn-secondary !py-1.5 !px-2.5 !text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
              onClick={handleSendWhatsApp}
              disabled={!selectedStatements.length}
            >
              <Send className="w-3.5 h-3.5 text-emerald-600" /> Send WhatsApp
            </button>
          )}
          <button
            type="button"
            className="btn-primary !py-1.5 !px-3 !text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
            onClick={handlePrintPDF}
            disabled={!selectedStatements.length || printing}
          >
            <Printer className="w-3.5 h-3.5" /> {printing ? 'Opening PDF...' : 'Print / Save PDF'}
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card !p-1.5 shrink-0">
        <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap">
          <div className="flex items-center gap-1 h-7 px-2 rounded-lg bg-primary-100/70 border border-primary-200 text-[11px] font-bold text-primary-800 shrink-0">
            <Calendar className="w-3 h-3 text-primary-600" />
            <span>Date: {formatDateOnly(startDate)}</span>
          </div>

          <select
            className="h-7 min-w-[110px] max-w-[140px] rounded-lg border border-primary-200 bg-surface px-2 py-0.5 text-[11px] text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition truncate shrink-0"
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
            className="h-7 min-w-[105px] max-w-[130px] rounded-lg border border-primary-200 bg-surface px-2 py-0.5 text-[11px] text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition truncate shrink-0"
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
            className="h-7 min-w-[105px] max-w-[130px] rounded-lg border border-primary-200 bg-surface px-2 py-0.5 text-[11px] text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition truncate shrink-0"
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

          {hasFilters && (
            <button
              type="button"
              className="text-[11px] font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg px-2 h-7 flex items-center gap-1 transition cursor-pointer shrink-0"
              onClick={() => {
                setFilterCustomer('');
                setFilterVendor('');
                setFilterItem('');
              }}
              title="Clear active filters"
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}

          <button
            type="button"
            className="btn-secondary !h-7 !py-0.5 !px-2 !text-[11px] font-semibold rounded-lg flex items-center gap-1 ml-auto shrink-0 cursor-pointer"
            onClick={fetchSalesBills}
            disabled={loading}
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Main Workspace (Split View) */}
      <div className="flex flex-col md:flex-row gap-2.5 flex-1 min-h-0 overflow-hidden">
        {/* Left Column: Records Table (Collapsible) */}
        {showCustomerList && (
          <div className="w-full md:w-60 lg:w-64 min-w-[235px] max-w-[260px] flex flex-col card !p-0 overflow-hidden min-h-[160px] max-h-[240px] md:max-h-none shrink-0 border border-primary-200">
            <div className="px-2 py-1.5 border-b border-primary-100 bg-primary-50/70 flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button type="button" onClick={toggleSelectAll} className="text-primary-600 cursor-pointer">
                  {selectedCids.size === filteredStatements.length && filteredStatements.length > 0 ? (
                    <CheckSquare className="w-3.5 h-3.5" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-primary-400" />
                  )}
                </button>
                <span className="font-bold text-primary-800 text-[11px]">
                  Selected {selectedStatements.length} / {filteredStatements.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomerList(false)}
                className="text-[10px] font-semibold text-primary-500 hover:text-primary-800 px-1 py-0.5 rounded hover:bg-primary-100 transition cursor-pointer"
                title="Hide customer list to expand bill preview"
              >
                Hide
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-hidden">
              {loading ? (
                <div className="text-center py-12 text-primary-400 text-xs">Loading sales...</div>
              ) : filteredStatements.length === 0 ? (
                <div className="text-center py-12 text-primary-400 text-xs">No sales match filter</div>
              ) : (
                <table className="w-full text-[11px] table-fixed">
                  <thead className="sticky top-0 bg-primary-50 border-b border-primary-100 z-10 text-[10px]">
                    <tr className="text-left text-primary-600">
                      <th className="w-6 px-1 py-1 text-center"></th>
                      <th className="px-1.5 py-1 font-semibold">
                        <SortHeader column="name" label="Customer" />
                      </th>
                      <th className="px-1 py-1 font-semibold text-right w-14">
                        <SortHeader column="totalSale" label="Sale" align="right" />
                      </th>
                      <th className="px-1.5 py-1 font-semibold text-right w-16">
                        <SortHeader column="closing" label="Closing" align="right" />
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
                          <td className="px-1 py-1 text-center w-6" onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => toggleSelectOne(cid)} className="cursor-pointer">
                              {selected ? (
                                <CheckSquare className="w-3.5 h-3.5 text-primary-600" />
                              ) : (
                                <Square className="w-3.5 h-3.5 text-primary-300" />
                              )}
                            </button>
                          </td>
                          <td className="px-1.5 py-1 text-primary-800 min-w-0">
                            <div className="font-semibold text-[11px] leading-snug truncate" title={st.name}>
                              {st.name}
                            </div>
                            {st.nameTelugu ? (
                              <span className="text-[9.5px] text-primary-400 truncate block">{st.nameTelugu}</span>
                            ) : null}
                          </td>
                          <td className="px-1 py-1 text-right text-primary-700 font-semibold tabular-nums text-[11px] whitespace-nowrap w-14">
                            {formatCurrency(st.totalSale)}
                          </td>
                          <td className="px-1.5 py-1 text-right text-primary-800 font-bold tabular-nums text-[11px] whitespace-nowrap w-16">
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
          <div className="px-3 py-1.5 border-b border-primary-100 bg-primary-50/70 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {!showCustomerList && (
                <button
                  type="button"
                  onClick={() => setShowCustomerList(true)}
                  className="px-2 py-0.5 rounded border border-primary-200 bg-white text-primary-700 hover:bg-primary-100 text-[11px] font-semibold flex items-center gap-1 transition cursor-pointer shadow-2xs"
                  title="Show customer list"
                >
                  <Users className="w-3 h-3 text-primary-500" /> Show List
                </button>
              )}
              <span className="font-bold text-primary-800 text-xs">
                Live Preview ({selectedStatements.length} Bills)
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* View Layout Toggle: 1 Column vs 2 Columns */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-primary-500 font-semibold uppercase tracking-wide">View:</span>
                <button
                  type="button"
                  onClick={() => setViewColumns(1)}
                  className={`px-2 py-0.5 text-[11px] rounded-md font-semibold transition cursor-pointer ${
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
                  className={`px-2 py-0.5 text-[11px] rounded-md font-semibold transition cursor-pointer ${
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
              <div className="flex items-center gap-1 border-l border-primary-200 pl-2.5">
                <span className="text-[10px] text-primary-500 font-semibold uppercase tracking-wide">Print:</span>
                {[2, 4, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPerPage(n)}
                    className={`px-1.5 py-0.5 text-[11px] rounded-md font-semibold transition cursor-pointer ${
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

          <div className="flex-1 overflow-auto p-2.5 bg-primary-50/30">
            {selectedStatements.length === 0 ? (
              <div className="text-center py-20 text-primary-400">
                <FileText className="w-10 h-10 text-primary-300 mx-auto mb-2" />
                <p className="font-medium text-primary-600 text-xs">No sales selected for preview</p>
                <p className="text-[11px] mt-1 text-primary-400">Select customers on the left to see live preview</p>
              </div>
            ) : (
              (() => {
                let globalRowIdx = 0;
                return (
                  <div
                    className={`grid gap-2.5 ${
                      viewColumns === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
                    }`}
                  >
                    {selectedStatements.slice(0, 12).map((st) => {
                      return (
                        <div
                          key={st.customerId}
                          className="card !p-0 border border-primary-200 shadow-sm bg-white overflow-hidden flex flex-col"
                        >
                          <div className="bg-primary-50/90 px-2.5 py-1 border-b border-primary-200 flex items-center gap-1.5">
                            <span className="font-bold text-primary-900 text-xs truncate">{st.name}</span>
                            {st.nameTelugu ? (
                              <span className="text-[10px] text-primary-600 font-medium truncate">({st.nameTelugu})</span>
                            ) : null}
                          </div>

                          <div className="overflow-x-auto flex-1">
                            <table className="w-full text-[11px] excel-grid border border-primary-200">
                              <thead>
                                <tr className="bg-accent-200 text-accent-900 text-left whitespace-nowrap">
                                  <th className="bg-accent-200 px-1.5 py-1 font-bold text-center w-16 text-[10px]">తేదీ</th>
                                  <th className="bg-accent-200 px-1.5 py-1 font-bold min-w-[5.5rem] text-[10px]">వస్తువు</th>
                                  <th className="bg-accent-200 px-1 py-1 text-right font-bold w-10 text-[10px]">బ్యాగ్</th>
                                  <th className="bg-accent-200 px-1.5 py-1 text-right font-bold w-14 text-[10px]">బరువు (kg)</th>
                                  <th className="bg-accent-200 px-1.5 py-1 text-right font-bold w-14 text-[10px]">ధర</th>
                                  <th className="bg-accent-200 px-1.5 py-1 text-right font-bold w-18 text-[10px]">మొత్తం</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="bg-surface hover:bg-primary-50/40 text-[11px]">
                                  <td className="px-1.5 py-0.5 text-center text-primary-400 text-[9.5px]">—</td>
                                  <td className="px-1.5 py-0.5 font-semibold text-primary-700">Opening</td>
                                  <td className="px-1 py-0.5 text-center text-primary-400 text-[9.5px]">—</td>
                                  <td className="px-1.5 py-0.5 text-center text-primary-400 text-[9.5px]">—</td>
                                  <td className="px-1.5 py-0.5 text-center text-primary-400 text-[9.5px]">—</td>
                                  <td className="px-1.5 py-0.5 text-right font-semibold tabular-nums text-primary-800">{formatCurrency(st.opening || 0)}</td>
                                </tr>
                                {(st.sales || []).map((s, idx) => {
                                  const rIdx = globalRowIdx++;
                                  const rowKey = `${st.customerId}_${s.saleId || idx}_${idx}`;
                                  const baseAmount = Number(s.amount) || 0;
                                  const coolyAmt = Number(s.cooly) || Number(s.handlingCharges) || 0;
                                  const lineTotal = baseAmount + coolyAmt;

                                  const selectedMatId =
                                    materials.find(
                                      (m) =>
                                        String(m._id) === String(s.materialId || '') ||
                                        m.name.toLowerCase() === String(s.material || '').trim().toLowerCase()
                                    )?._id || s.materialId || '';

                                  return (
                                    <tr
                                      key={rowKey}
                                      className={
                                        idx % 2 === 0
                                          ? 'bg-surface hover:bg-primary-50/40'
                                          : 'bg-primary-50/20 hover:bg-primary-50/50'
                                      }
                                    >
                                      <td className="px-1.5 py-0.5 text-primary-600 text-center whitespace-nowrap tabular-nums text-[10.5px]">
                                        {formatShortDate(s.date)}
                                      </td>
                                      <td className="px-1 py-0.5 min-w-[5.5rem]">
                                        <select
                                          key={`${s.saleId}-mat-${s.materialId || s.material}`}
                                          data-print-row={rIdx}
                                          data-print-col={0}
                                          onKeyDown={(e) => handleGridKeyDown(e, rIdx, 0)}
                                          className={`${cellStyle} font-semibold text-primary-800 cursor-pointer text-[11px] py-0.5`}
                                          defaultValue={selectedMatId}
                                          onChange={(e) => {
                                            const newMatId = e.target.value;
                                            if (!newMatId) return;
                                            const mat = materials.find((m) => String(m._id) === newMatId);
                                            const newRate =
                                              mat?.sellingPricePerKg != null && mat.sellingPricePerKg > 0
                                                ? mat.sellingPricePerKg
                                                : s.ratePerKg;
                                            persistSaleLine(st, s, { materialId: newMatId, ratePerKg: newRate });
                                          }}
                                        >
                                          {!materials.some((m) => String(m._id) === String(selectedMatId)) && s.material && (
                                            <option value="">{s.material}</option>
                                          )}
                                          {materials.map((m) => (
                                            <option key={m._id} value={m._id}>
                                              {m.name}
                                            </option>
                                          ))}
                                        </select>
                                      </td>
                                      <td className="px-1 py-0.5 text-right w-10">
                                        <input
                                          key={`${s.saleId}-bags-${s.bags}`}
                                          data-print-row={rIdx}
                                          data-print-col={1}
                                          type="text"
                                          inputMode="numeric"
                                          autoComplete="off"
                                          defaultValue={s.bags || 1}
                                          className={`${cellStyle} text-right font-semibold tabular-nums text-primary-800 text-[11px] py-0.5`}
                                          onBlur={(e) => {
                                            const newBags = Math.max(1, Math.floor(Number(e.target.value)) || 1);
                                            if (newBags === Number(s.bags)) return;
                                            persistSaleLine(st, s, { bags: newBags });
                                          }}
                                          onKeyDown={(e) => {
                                            handleGridKeyDown(e, rIdx, 1);
                                            if (e.key === 'Enter') {
                                              e.preventDefault();
                                              e.currentTarget.blur();
                                            }
                                          }}
                                        />
                                      </td>
                                      <td className="px-1 py-0.5 text-right w-14">
                                        {s.saleType === 'by_bag' ? (
                                          <span
                                            tabIndex={0}
                                            data-print-row={rIdx}
                                            data-print-col={2}
                                            onKeyDown={(e) => handleGridKeyDown(e, rIdx, 2)}
                                            className="text-primary-400 font-medium py-0.5 px-1 block text-center outline-none cursor-default text-[10px]"
                                          >
                                            —
                                          </span>
                                        ) : (
                                          <input
                                            key={`${s.saleId}-weight-${s.weight}`}
                                            data-print-row={rIdx}
                                            data-print-col={2}
                                            type="text"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            defaultValue={s.weight != null ? s.weight : ''}
                                            className={`${cellStyle} text-right font-medium tabular-nums text-primary-700 text-[11px] py-0.5`}
                                            onBlur={(e) => {
                                              const newWeight = Number(e.target.value) || 0;
                                              if (newWeight === Number(s.weight)) return;
                                              persistSaleLine(st, s, { weight: newWeight });
                                            }}
                                            onKeyDown={(e) => {
                                              handleGridKeyDown(e, rIdx, 2);
                                              if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.currentTarget.blur();
                                              }
                                            }}
                                          />
                                        )}
                                      </td>
                                      <td className="px-1 py-0.5 text-right w-14">
                                        <div className="flex items-center justify-end gap-0.5">
                                          <input
                                            key={`${s.saleId}-rate-${s.ratePerKg}`}
                                            data-print-row={rIdx}
                                            data-print-col={3}
                                            type="text"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            defaultValue={s.ratePerKg != null ? s.ratePerKg : ''}
                                            className={`${cellStyle} text-right font-medium tabular-nums text-primary-700 text-[11px] py-0.5`}
                                            onBlur={(e) => {
                                              const newRate = Number(e.target.value) || 0;
                                              if (newRate === Number(s.ratePerKg)) return;
                                              persistSaleLine(st, s, { ratePerKg: newRate });
                                            }}
                                            onKeyDown={(e) => {
                                              handleGridKeyDown(e, rIdx, 3);
                                              if (e.key === 'Enter') {
                                                e.preventDefault();
                                                e.currentTarget.blur();
                                              }
                                            }}
                                          />
                                          {s.saleType === 'by_bag' && (
                                            <span className="text-[8px] font-bold px-1 rounded bg-amber-100 text-amber-800 leading-tight whitespace-nowrap">
                                              bag
                                            </span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-1.5 py-0.5 text-right font-bold text-primary-900 whitespace-nowrap tabular-nums text-[11px]">
                                        {formatCurrency(lineTotal)}
                                        {coolyAmt > 0 ? (
                                          <span className="text-[9px] text-emerald-700 block font-normal leading-tight">
                                            (incl. ₹{coolyAmt} cooly)
                                          </span>
                                        ) : null}
                                      </td>
                                    </tr>
                                  );
                                })}
                                {(st.payments || []).map((p, pIdx) => (
                                  <tr key={`payment-${pIdx}`} className="text-emerald-800 bg-emerald-50/40 text-[11px]">
                                    <td className="px-1.5 py-0.5 text-center whitespace-nowrap text-[10.5px]">{formatShortDate(p.date)}</td>
                                    <td className="px-1.5 py-0.5 font-semibold" colSpan={4}>Paid</td>
                                    <td className="px-1.5 py-0.5 text-right font-bold tabular-nums text-[11px]">- {formatCurrency(p.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="border-t-2 border-primary-300 bg-accent-200">
                                <tr className="bg-accent-200 text-accent-900 font-bold whitespace-nowrap text-[11px]">
                                  <td className="bg-accent-200 px-1.5 py-1 font-bold text-[10.5px] uppercase tracking-wide text-accent-900" colSpan={5}>
                                    Total
                                  </td>
                                  <td className="bg-accent-200 px-1.5 py-1 text-right font-bold text-xs tabular-nums text-accent-900">
                                    {formatCurrency(st.totalSale)}
                                  </td>
                                </tr>
                                <tr className="bg-accent-100/70 text-accent-900 font-bold whitespace-nowrap text-[11px]">
                                  <td className="bg-accent-100/70 px-1.5 py-1 font-bold text-[10.5px] uppercase tracking-wide text-accent-900" colSpan={5}>
                                    Closing
                                  </td>
                                  <td className="bg-accent-100/70 px-1.5 py-1 text-right font-bold text-xs tabular-nums text-accent-900">
                                    {formatCurrency(st.closing)}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                          <div className="flex items-center justify-between px-2.5 py-0.5 bg-primary-50/40 border-t border-primary-100 text-[9.5px] text-primary-400 font-medium shrink-0">
                            <span>Enter / blur to save • Arrow keys to navigate</span>
                            <span>{(st.sales || []).length} items</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
