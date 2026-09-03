import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Printer, Send, FileText, CheckSquare, Square, ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDateOnly } from '../utils/format';
import { openRangeBillsNUp } from '../utils/rangeBillPrint';
import { useDataRestored } from '../utils/useDataRestored';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function BillPrint({ path: windowPath }) {
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

  const [filterCustomer, setFilterCustomer] = useState(effectiveSearchParams.get('customer') || '');
  const [filterVendor, setFilterVendor] = useState(effectiveSearchParams.get('vendor') || '');
  const [filterItem, setFilterItem] = useState(effectiveSearchParams.get('item') || '');
  const [searchQuery, setSearchQuery] = useState('');

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

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((st) => {
        const custMatch =
          (st.name || '').toLowerCase().includes(q) ||
          (st.nameTelugu || '').toLowerCase().includes(q);
        const salesMatch = (st.sales || []).some(
          (s) =>
            (s.material || '').toLowerCase().includes(q) ||
            (s.vendorName || '').toLowerCase().includes(q)
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
  }, [data, filterCustomer, filterVendor, filterItem, searchQuery, sortKey, sortDir]);

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

  const handleSendWhatsApp = () => {
    if (!selectedStatements.length) {
      toast.error('No bills selected');
      return;
    }
    const text = `Bill statements for ${selectedStatements.length} customers (${startDate} to ${endDate}).`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
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
          <button
            type="button"
            className="btn-secondary !py-2 !px-3 text-xs"
            onClick={handleSendWhatsApp}
            disabled={!selectedStatements.length}
          >
            <Send className="w-4 h-4 text-emerald-600" /> Send WhatsApp
          </button>
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
            className="input-field !h-10 !py-0 w-full sm:w-48 text-sm"
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
            className="input-field !h-10 !py-0 w-full sm:w-44 text-sm"
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

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 text-primary-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search customer, vendor, item..."
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

          {(filterCustomer || filterVendor || filterItem || searchQuery.trim()) && (
            <button
              type="button"
              className="text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2"
              onClick={() => {
                setFilterCustomer('');
                setFilterVendor('');
                setFilterItem('');
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
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 overflow-hidden">
        {/* Left Column: Records Table */}
        <div className="lg:col-span-5 flex flex-col card !p-0 overflow-hidden min-h-[300px]">
          <div className="px-4 py-3 border-b border-primary-100 bg-primary-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button type="button" onClick={toggleSelectAll} className="text-primary-600">
                {selectedCids.size === filteredStatements.length && filteredStatements.length > 0 ? (
                  <CheckSquare className="w-5 h-5" />
                ) : (
                  <Square className="w-5 h-5 text-primary-400" />
                )}
              </button>
              <span className="font-bold text-primary-800 text-sm">
                Selected {selectedStatements.length} / {filteredStatements.length}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-primary-500">
              <span>Layout:</span>
              {[2, 4, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPerPage(n)}
                  className={`px-2 py-0.5 rounded font-semibold transition ${
                    perPage === n ? 'bg-primary-700 text-white' : 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="text-center py-16 text-primary-400">Loading bills...</div>
            ) : filteredStatements.length === 0 ? (
              <div className="text-center py-16 text-primary-400 text-sm">No bills match the selected filters</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-primary-50 border-b border-primary-100 z-10">
                  <tr className="text-left text-primary-600">
                    <th className="w-10 px-3 py-2.5"></th>
                    <th className="px-3 py-2.5 font-semibold">
                      <SortHeader column="name" label="Customer" />
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-right">
                      <SortHeader column="totalSale" label="Sale" />
                    </th>
                    <th className="px-3 py-2.5 font-semibold text-right">
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
                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => toggleSelectOne(cid)}>
                            {selected ? (
                              <CheckSquare className="w-4 h-4 text-primary-600" />
                            ) : (
                              <Square className="w-4 h-4 text-primary-300" />
                            )}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-primary-800">
                          <div>{st.name}</div>
                          {st.nameTelugu ? (
                            <span className="text-xs text-primary-400">{st.nameTelugu}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 text-right text-primary-700 font-semibold tabular-nums">
                          {formatCurrency(st.totalSale)}
                        </td>
                        <td className="px-3 py-2 text-right text-primary-800 font-bold tabular-nums">
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
        <div className="lg:col-span-7 flex flex-col card !p-0 overflow-hidden min-h-[300px]">
          <div className="px-4 py-3 border-b border-primary-100 bg-primary-50/50 flex items-center justify-between">
            <span className="font-bold text-primary-800 text-sm">
              Live Preview ({selectedStatements.length} Bills · {perPage} per page layout)
            </span>
            <span className="text-xs text-primary-500 font-medium">
              Page 1 of {Math.max(1, Math.ceil(selectedStatements.length / perPage))}
            </span>
          </div>

          <div className="flex-1 overflow-auto p-4 bg-primary-100/50">
            {selectedStatements.length === 0 ? (
              <div className="text-center py-24 text-primary-400">
                <FileText className="w-12 h-12 text-primary-300 mx-auto mb-2" />
                <p className="font-medium text-primary-600">No bills selected for preview</p>
                <p className="text-xs mt-1 text-primary-400">Select customers on the left to see live preview</p>
              </div>
            ) : (
              <div
                className={`grid gap-3 ${
                  perPage === 2 ? 'grid-cols-1 md:grid-cols-2' : perPage === 4 ? 'grid-cols-2' : 'grid-cols-2'
                }`}
              >
                {selectedStatements.slice(0, 12).map((st) => (
                  <div
                    key={st.customerId}
                    className="card !p-3 border border-primary-200 shadow-sm bg-white text-xs space-y-2"
                  >
                    <div className="text-center border-b border-primary-100 pb-1.5">
                      <p className="font-bold text-primary-900 text-sm">{st.name}</p>
                      {st.nameTelugu ? (
                        <p className="text-xs text-primary-500 font-medium">{st.nameTelugu}</p>
                      ) : null}
                    </div>

                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-primary-100 text-primary-500 font-semibold text-left">
                          <th className="pb-1">తేదీ</th>
                          <th className="pb-1">వస్తువు</th>
                          <th className="pb-1 text-right">బ్యాగ్</th>
                          <th className="pb-1 text-right">మొత్తం</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-primary-50">
                        <tr>
                          <td className="py-1"></td>
                          <td className="py-1 font-medium text-primary-700">Opening</td>
                          <td className="py-1"></td>
                          <td className="py-1 text-right font-semibold">{formatCurrency(st.opening)}</td>
                        </tr>
                        {(st.sales || []).map((s, idx) => (
                          <tr key={idx}>
                            <td className="py-1 text-primary-400">{formatDateOnly(s.date)}</td>
                            <td className="py-1 font-medium text-primary-800">
                              <div>{s.material || 'Sale'}</div>
                              {teluguMap[String(s.material || '').trim().toLowerCase()] &&
                              teluguMap[String(s.material || '').trim().toLowerCase()] !== String(s.material || '').trim() ? (
                                <span className="text-[11px] text-primary-400 font-normal block">
                                  {teluguMap[String(s.material || '').trim().toLowerCase()]}
                                </span>
                              ) : null}
                            </td>
                            <td className="py-1 text-right">{s.bags || '—'}</td>
                            <td className="py-1 text-right font-semibold">{formatCurrency(s.amount)}</td>
                          </tr>
                        ))}
                        <tr className="font-bold border-t border-primary-200">
                          <td className="pt-1 font-bold" colSpan={3}>
                            Total
                          </td>
                          <td className="pt-1 text-right font-bold">{formatCurrency(st.totalSale)}</td>
                        </tr>
                        <tr className="font-bold text-primary-900 border-t border-primary-200">
                          <td className="pt-1 font-bold" colSpan={3}>
                            Closing
                          </td>
                          <td className="pt-1 text-right font-bold text-primary-800">
                            {formatCurrency(st.closing)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
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
