import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, Send, FileText, CheckSquare, Square, ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, Edit2, Calendar, CheckCircle2, DollarSign } from 'lucide-react';
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
  return new Date().toISOString().slice(0, 10);
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

  const [selectedCids, setSelectedCids] = useState(new Set());
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');

  const cellStyle =
    'w-full bg-transparent rounded border border-transparent hover:border-primary-200 focus:border-primary-400 focus:bg-white outline-none px-1 py-0.5 text-xs transition-all';

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

  const toggleBillPaid = async (st, targetIsPaid) => {
    try {
      const saleIds = Array.from(new Set((st.sales || []).map((s) => s.saleId).filter(Boolean)));
      if (!saleIds.length) {
        toast.error('No sale ID found to update status');
        return;
      }
      for (const saleId of saleIds) {
        await api.patch(`/sales/${saleId}/toggle-paid`, { isPaid: targetIsPaid });
      }
      toast.success(targetIsPaid ? `Marked as Paid for ${st.name}` : `Marked as Unpaid for ${st.name}`);
      fetchSalesBills();
      window.dispatchEvent(new CustomEvent('jsr_data_updated'));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update payment status');
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
          <h1 className="page-title">Sales Print</h1>
          <p className="text-primary-400 text-sm mt-0.5">
            Filter, preview, and print customer sales bills for active sales entries
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
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
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-100/70 border border-primary-200 text-xs font-bold text-primary-800">
            <Calendar className="w-3.5 h-3.5 text-primary-600" />
            <span>Date: {formatDateOnly(startDate)}</span>
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
            className="input-field !h-10 !py-0 w-full sm:w-auto min-w-[130px] text-sm flex-1 sm:flex-initial"
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
              className="text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2"
              onClick={() => {
                setFilterCustomer('');
                setFilterVendor('');
                setFilterItem('');
              }}
            >
              Clear filters
            </button>
          )}

          <button
            type="button"
            className="btn-secondary !h-10 !py-1 !px-3 text-xs ml-auto"
            onClick={fetchSalesBills}
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
              <div className="text-center py-16 text-primary-400 text-xs">Loading sales...</div>
            ) : filteredStatements.length === 0 ? (
              <div className="text-center py-16 text-primary-400 text-xs">No sales match filter</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-primary-50 border-b border-primary-100 z-10">
                  <tr className="text-left text-primary-600">
                    <th className="w-7 px-2 py-2"></th>
                    <th className="px-2 py-2 font-semibold">
                      <SortHeader column="name" label="Customer" />
                    </th>
                    <th className="px-2 py-2 font-semibold text-right">
                      <SortHeader column="totalSale" label="Total" />
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
                          <div className="font-semibold text-xs leading-snug truncate max-w-[120px]">{st.name}</div>
                          {st.nameTelugu ? (
                            <span className="text-[11px] text-primary-400 truncate block">{st.nameTelugu}</span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 text-right text-primary-800 font-bold tabular-nums text-xs">
                          {formatCurrency(st.totalSale)}
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
                <p className="font-medium text-primary-600">No sales selected for preview</p>
                <p className="text-xs mt-1 text-primary-400">Select customers on the left to see live preview</p>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
                {selectedStatements.slice(0, 12).map((st) => {
                  const allPaid = (st.sales || []).length > 0 && (st.sales || []).every((s) => s.isPaid);
                  return (
                      <div
                        key={st.customerId}
                        className="card !p-3.5 border border-primary-200 shadow-sm bg-white text-xs space-y-2.5 relative overflow-hidden"
                      >
                        <div className="flex items-center justify-between border-b border-primary-100 pb-2">
                          <div className="text-left flex-1">
                            <p className="font-bold text-primary-900 text-base">{st.name}</p>
                            {st.nameTelugu ? (
                              <p className="text-xs text-primary-500 font-medium">{st.nameTelugu}</p>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {allPaid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Paid Direct
                              </span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => toggleBillPaid(st, !allPaid)}
                              className={`px-3 py-1 rounded-md text-xs font-bold border transition shadow-2xs cursor-pointer ${
                                allPaid
                                  ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                  : 'bg-emerald-600 text-white hover:bg-emerald-700 border-emerald-700'
                              }`}
                              title={allPaid ? 'Click to mark as unpaid' : 'Click to mark as paid direct'}
                            >
                              {allPaid ? 'Mark Unpaid' : 'Mark as Paid'}
                            </button>
                          </div>
                        </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs min-w-[340px]">
                        <thead>
                          <tr className="border-b border-primary-200 text-primary-600 font-semibold text-left bg-primary-50/70 whitespace-nowrap">
                            <th className="py-1.5 px-1 font-bold">తేదీ</th>
                            <th className="py-1.5 px-1 font-bold min-w-[7rem]">వస్తువు</th>
                            <th className="py-1.5 px-1 text-right font-bold w-12">బ్యాగ్</th>
                            <th className="py-1.5 px-1 text-right font-bold w-16">బరువు (kg)</th>
                            <th className="py-1.5 px-1 text-right font-bold w-16">ధర</th>
                            <th className="py-1.5 px-1 text-right font-bold">మొత్తం</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-primary-100">
                          {(st.sales || []).map((s, idx) => {
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
                              <tr key={rowKey} className="hover:bg-primary-50/40 transition">
                                <td className="py-1 px-1 text-primary-500 whitespace-nowrap">
                                  {formatDateOnly(s.date)}
                                </td>
                                <td className="py-1 px-1 min-w-[7rem]">
                                  <select
                                    key={`${s.saleId}-mat-${s.materialId || s.material}`}
                                    className={`${cellStyle} font-semibold text-primary-800 cursor-pointer`}
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
                                <td className="py-1 px-1 w-12 text-right">
                                  <input
                                    key={`${s.saleId}-bags-${s.bags}`}
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    defaultValue={s.bags || 1}
                                    className={`${cellStyle} text-right font-medium tabular-nums text-primary-800`}
                                    onBlur={(e) => {
                                      const newBags = Math.max(1, Math.floor(Number(e.target.value)) || 1);
                                      if (newBags === Number(s.bags)) return;
                                      persistSaleLine(st, s, { bags: newBags });
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') e.currentTarget.blur();
                                    }}
                                  />
                                </td>
                                <td className="py-1 px-1 w-16 text-right">
                                  {s.saleType === 'by_bag' ? (
                                    <span className="text-primary-400 font-medium py-1 px-1 block">—</span>
                                  ) : (
                                    <input
                                      key={`${s.saleId}-weight-${s.weight}`}
                                      type="text"
                                      inputMode="decimal"
                                      autoComplete="off"
                                      defaultValue={s.weight != null ? s.weight : ''}
                                      className={`${cellStyle} text-right font-medium tabular-nums text-primary-700`}
                                      onBlur={(e) => {
                                        const newWeight = Number(e.target.value) || 0;
                                        if (newWeight === Number(s.weight)) return;
                                        persistSaleLine(st, s, { weight: newWeight });
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') e.currentTarget.blur();
                                      }}
                                    />
                                  )}
                                </td>
                                <td className="py-1 px-1 w-16 text-right">
                                  <div className="flex flex-col items-end">
                                    <input
                                      key={`${s.saleId}-rate-${s.ratePerKg}`}
                                      type="text"
                                      inputMode="decimal"
                                      autoComplete="off"
                                      defaultValue={s.ratePerKg != null ? s.ratePerKg : ''}
                                      className={`${cellStyle} text-right font-medium tabular-nums text-primary-700`}
                                      onBlur={(e) => {
                                        const newRate = Number(e.target.value) || 0;
                                        if (newRate === Number(s.ratePerKg)) return;
                                        persistSaleLine(st, s, { ratePerKg: newRate });
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') e.currentTarget.blur();
                                      }}
                                    />
                                    {s.saleType === 'by_bag' && (
                                      <span className="inline-block text-[9px] font-semibold px-1 py-0.2 rounded bg-amber-100 text-amber-800 leading-none whitespace-nowrap">
                                        per bag
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-1 px-1 text-right font-bold text-primary-800 whitespace-nowrap">
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
                          <tr className="font-bold text-primary-900 border-t border-primary-200 bg-primary-50/50 whitespace-nowrap">
                            <td className="py-2 px-1 font-bold text-xs" colSpan={5}>
                              Total
                            </td>
                            <td className="py-2 px-1 text-right font-bold text-sm text-primary-900">
                              {formatCurrency(st.totalSale)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
