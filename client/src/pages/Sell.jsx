import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, Printer, Trash2, Pencil, CheckCircle2, Lock, Eye, EyeOff, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDate, formatDateTimeSplit } from '../utils/format';
import { openBillPreviewTab, openRangeBillsNUp } from '../utils/rangeBillPrint';
import { matchesSearchFields, searchAndSortItems } from '../utils/search';
import { useDataRestored } from '../utils/useDataRestored';
import { useMDI } from '../context/MDIContext';

function dateToLocalISO(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayInputValue() {
  return dateToLocalISO(new Date());
}

function appliedCooly(rate, bags, perBag) {
  const r = Number(rate) || 0;
  const b = Number(bags) || 0;
  return perBag ? Number((r * b).toFixed(2)) : r;
}

export default function Sell({ path: windowPath }) {
  const { openWindow, updateWindowPath } = useMDI();
  const [searchParams, setSearchParams] = useSearchParams();
  const effectiveSearchParams = useMemo(() => {
    if (windowPath && windowPath.includes('?')) {
      return new URLSearchParams(windowPath.split('?')[1]);
    }
    return searchParams;
  }, [windowPath, searchParams]);

  const paramDate = effectiveSearchParams.get('date');
  const [date, setDate] = useState(paramDate || todayInputValue());
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const initialSaleId = effectiveSearchParams.get('saleId') || effectiveSearchParams.get('highlightSaleId') || '';
  const [editingSaleId, setEditingSaleId] = useState('');
  const [editingLineIndex, setEditingLineIndex] = useState(0);
  const [focusSaleId, setFocusSaleId] = useState(initialSaleId);
  const [isPaid, setIsPaid] = useState(false);

  useEffect(() => {
    const pDate = effectiveSearchParams.get('date');
    const pSaleId = effectiveSearchParams.get('saleId') || effectiveSearchParams.get('highlightSaleId');
    const pCustId = effectiveSearchParams.get('customerId');
    const pVendId = effectiveSearchParams.get('vendorId');

    if (pDate && pDate !== date) {
      setDate(pDate);
    }

    if (pSaleId) {
      setFocusSaleId(pSaleId);
      // Clear filters so all records on that date are shown
      setFilterCustomer('');
      setFilterVendor('');
      setFilterItem('');
    } else {
      if (pCustId) setFilterCustomer(pCustId);
      if (pVendId) setFilterVendor(pVendId);
    }
  }, [windowPath, effectiveSearchParams]);
  const fillingRef = useRef(false);
  const queryApplied = useRef(false);
  const fetchingSale = useRef(false);
  const focusRowRef = useRef(null);

  const [materialId, setMaterialId] = useState('');
  const [vendorId, setVendorId] = useState('');

  const [nameQuery, setNameQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const [saleType, setSaleType] = useState('by_weight');
  const [directBagCount, setDirectBagCount] = useState('');
  const [bagWeights, setBagWeights] = useState(['']);
  const [focusBagIdx, setFocusBagIdx] = useState(null);
  const [rate, setRate] = useState('');
  const [cooly, setCooly] = useState('0');
  const [coolyOn, setCoolyOn] = useState(false);
  const [coolyPerBag, setCoolyPerBag] = useState(true);
  const [salesCoolyRateByWeight, setSalesCoolyRateByWeight] = useState('17');
  const [salesCoolyRateByBag, setSalesCoolyRateByBag] = useState('10');
  const salesCoolyRate = saleType === 'by_bag' ? salesCoolyRateByBag : salesCoolyRateByWeight;
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingRowId, setSavingRowId] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterItem, setFilterItem] = useState('');
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState('asc');
  const [printOpen, setPrintOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  const [editAuthorized, setEditAuthorized] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingEditSale, setPendingEditSale] = useState(null);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [authError, setAuthError] = useState('');

  const nameRef = useRef(null);
  const bagInputRefs = useRef({});
  const rateRef = useRef(null);
  const coolyRef = useRef(null);
  const pendingFocusCell = useRef(null);
  const originalCellRef = useRef(null);
  const cancelEditRef = useRef(false);
  const editingSaleIdRef = useRef(editingSaleId);
  editingSaleIdRef.current = editingSaleId;
  const inFlightUpdatesRef = useRef(new Set());

  // Restore focus to pending cell immediately after React commits DOM mutations
  useLayoutEffect(() => {
    if (pendingFocusCell.current) {
      const { row, col } = pendingFocusCell.current;
      const selector = `[data-table-row="${row}"][data-table-col="${col}"]`;
      const target = document.querySelector(selector);
      if (target) {
        target.focus();
        if (typeof target.select === 'function' && target.tagName === 'INPUT') {
          target.select();
        }
        pendingFocusCell.current = null;
      }
    }
  });

  // Secondary fallback for asynchronous state updates
  useEffect(() => {
    if (pendingFocusCell.current) {
      const { row, col } = pendingFocusCell.current;
      const selector = `[data-table-row="${row}"][data-table-col="${col}"]`;
      const target = document.querySelector(selector);
      if (target) {
        target.focus();
        if (typeof target.select === 'function' && target.tagName === 'INPUT') {
          target.select();
        }
        pendingFocusCell.current = null;
      }
    }
  });

  const material = materials.find((m) => m._id === materialId);
  const customer = customers.find((c) => c._id === customerId);
  const customerCoolyDefault = !!customer?.handlingCharges;

  const isByBag = saleType === 'by_bag';
  const filledBags = bagWeights.map(Number).filter((n) => n > 0);
  const bagCount = isByBag ? Math.max(0, Math.floor(Number(directBagCount) || 0)) : filledBags.length;
  const qty = isByBag ? 0 : filledBags.reduce((s, n) => s + n, 0);
  const materialsAmount = isByBag
    ? Number((bagCount * (Number(rate) || 0)).toFixed(2))
    : Number((qty * (Number(rate) || 0)).toFixed(2));
  const coolyApplied = coolyOn ? appliedCooly(cooly, bagCount, coolyPerBag) : 0;
  const amount = Number((materialsAmount + coolyApplied).toFixed(2));

  const suggestions = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return [];
    const list = searchAndSortItems(customers, ['name', 'nameTelugu'], nameQuery).slice(0, 8);
    if ('cash'.startsWith(q) || 'నగదు'.startsWith(q) || q.includes('cash')) {
      list.unshift({
        _id: 'cash',
        name: 'Cash',
        nameTelugu: 'నగదు',
        isCashSale: true,
      });
    }
    return list;
  }, [customers, nameQuery]);

  const flatRows = useMemo(() => {
    const rows = [];
    for (const sale of sales) {
      for (const line of sale.lines || []) {
        const lineIdx = sale.lines.indexOf(line);
        const isEditingThis = editingSaleId === sale._id && lineIdx === editingLineIndex;

        const isCash = sale.isCashSale || !sale.customer || sale.customerName === 'Cash';
        const rawCustName = isCash ? 'Cash' : (sale.customer?.name || sale.customerName || 'Cash');
        const rawCustId = isCash ? 'cash' : (sale.customer?._id || sale.customer || 'cash');

        if (isEditingThis) {
          const matObj = materials.find((m) => m._id === materialId);
          const custObj = customers.find((c) => c._id === customerId);
          const vendObj = vendors.find((v) => v._id === vendorId);
          const editIsCash = customerId === 'cash' || nameQuery.trim().toLowerCase() === 'cash' || nameQuery.trim().toLowerCase() === 'నగదు';

          rows.push({
            saleId: sale._id,
            lineIndex: lineIdx,
            serial: sale.serialNo != null ? sale.serialNo : rows.length + 1,
            item: matObj?.name || line.materialName || '—',
            materialId: materialId || line.material?._id || line.material || '',
            name: editIsCash ? 'Cash' : (nameQuery || custObj?.name || rawCustName || '—'),
            customerId: editIsCash ? 'cash' : (customerId || rawCustId || ''),
            vendor: vendObj?.name || sale.vendor?.name || '—',
            vendorId: vendorId || sale.vendor?._id || sale.vendor || '',
            bags: bagCount,
            qty: isByBag ? 0 : qty,
            rate: rate !== '' ? Number(rate) || 0 : line.ratePerKg,
            isByBag,
            cooly: coolyApplied,
            coolyRate: coolyOn ? Number(cooly) || 0 : 0,
            coolyPerBag,
            isPaid: editIsCash ? true : !!isPaid,
            isCashSale: editIsCash,
            amount: amount,
            createdAt: sale.createdAt,
            sale,
            line,
            isLiveEditing: true,
          });
        } else {
          const lineIsByBag =
            line.saleType === 'by_bag' ||
            (line.bagCount > 0 && (!line.bags || line.bags.length === 0) && Number(line.totalKg) === 0);
          rows.push({
            saleId: sale._id,
            lineIndex: lineIdx,
            serial: sale.serialNo != null ? sale.serialNo : rows.length + 1,
            item: line.materialName,
            materialId: line.material?._id || line.material || '',
            name: rawCustName,
            customerId: rawCustId,
            vendor: sale.vendor?.name || '—',
            vendorId: sale.vendor?._id || sale.vendor || '',
            bags: line.bagCount,
            qty: line.totalKg,
            rate: line.ratePerKg,
            isByBag: lineIsByBag,
            cooly: sale.handlingCharges || 0,
            coolyRate: sale.coolyRate != null ? sale.coolyRate : sale.handlingCharges || 0,
            coolyPerBag: !!sale.coolyPerBag,
            isPaid: !!sale.isPaid,
            isCashSale: isCash,
            amount: Number(line.totalAmount || 0) + (sale.handlingCharges || 0),
            createdAt: sale.createdAt,
            sale,
            line,
            isLiveEditing: false,
          });
        }
      }
    }
    return rows;
  }, [
    sales,
    editingSaleId,
    editingLineIndex,
    materialId,
    customerId,
    vendorId,
    nameQuery,
    rate,
    bagCount,
    qty,
    isByBag,
    coolyApplied,
    cooly,
    coolyOn,
    coolyPerBag,
    isPaid,
    amount,
    materials,
    customers,
    vendors,
  ]);

  const availableCustomers = useMemo(() => {
    const map = new Map();
    for (const r of flatRows) {
      if (r.customerId && !map.has(r.customerId)) {
        if (r.customerId === 'cash' || r.isCashSale) {
          map.set('cash', {
            _id: 'cash',
            name: 'Cash',
            nameTelugu: 'నగదు',
          });
        } else {
          const fullObj = customers.find((c) => c._id === r.customerId);
          map.set(r.customerId, {
            _id: r.customerId,
            name: r.name,
            nameTelugu: fullObj?.nameTelugu || '',
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [flatRows, customers]);

  const availableVendors = useMemo(() => {
    const map = new Map();
    for (const r of flatRows) {
      if (r.vendorId && !map.has(r.vendorId)) {
        const fullObj = vendors.find((v) => v._id === r.vendorId);
        map.set(r.vendorId, {
          _id: r.vendorId,
          name: r.vendor,
          city: fullObj?.city || '',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [flatRows, vendors]);

  const availableItems = useMemo(() => {
    const map = new Map();
    for (const r of flatRows) {
      if (r.materialId && !map.has(r.materialId)) {
        const fullObj = materials.find((m) => m._id === r.materialId);
        map.set(r.materialId, {
          _id: r.materialId,
          name: r.item,
          nameTelugu: fullObj?.nameTelugu || '',
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [flatRows, materials]);

  useEffect(() => {
    if (filterCustomer && !availableCustomers.some((c) => c._id === filterCustomer)) {
      setFilterCustomer('');
    }
    if (filterVendor && !availableVendors.some((v) => v._id === filterVendor)) {
      setFilterVendor('');
    }
    if (filterItem && !availableItems.some((m) => m._id === filterItem)) {
      setFilterItem('');
    }
  }, [availableCustomers, availableVendors, availableItems, filterCustomer, filterVendor, filterItem]);

  const displayedRows = useMemo(() => {
    let rows = flatRows.filter((r) => {
      if (filterCustomer && r.customerId !== filterCustomer) return false;
      if (filterVendor && r.vendorId !== filterVendor) return false;
      if (filterItem && r.materialId !== filterItem) return false;
      return true;
    });
    if (sortKey) {
      const dir = sortDir === 'desc' ? -1 : 1;
      rows.sort((a, b) => {
        if (sortKey === 'serial') {
          const diff = (Number(a.serial) || 0) - (Number(b.serial) || 0);
          return diff * dir;
        }
        if (sortKey === 'vendor') {
          const vComp = String(a.vendor || '').localeCompare(String(b.vendor || ''), 'en', { numeric: true });
          if (vComp !== 0) return vComp * dir;
          const iComp = String(a.item || '').localeCompare(String(b.item || ''), 'en', { numeric: true });
          if (iComp !== 0) return iComp;
          return Number(a.serial || 0) - Number(b.serial || 0);
        }
        if (sortKey === 'item') {
          const vComp = String(a.vendor || '').localeCompare(String(b.vendor || ''), 'en', { numeric: true });
          if (vComp !== 0) return vComp;
          const iComp = String(a.item || '').localeCompare(String(b.item || ''), 'en', { numeric: true });
          if (iComp !== 0) return iComp * dir;
          return Number(a.serial || 0) - Number(b.serial || 0);
        }
        if (sortKey === 'amount') {
          const diff = (Number(a.amount) || 0) - (Number(b.amount) || 0);
          if (diff !== 0) return diff * dir;
          return Number(a.serial || 0) - Number(b.serial || 0);
        }
        if (sortKey === 'createdAt') {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          if (da !== db) return (da - db) * dir;
          return Number(a.serial || 0) - Number(b.serial || 0);
        }
        const av = String(a[sortKey] || '').toLowerCase();
        const bv = String(b[sortKey] || '').toLowerCase();
        return av.localeCompare(bv, 'en', { numeric: true }) * dir;
      });
    }
    return rows;
  }, [flatRows, filterCustomer, filterVendor, filterItem, sortKey, sortDir]);

  const hasActiveFilters = !!(filterCustomer || filterVendor || filterItem);

  const totals = useMemo(
    () =>
      displayedRows.reduce(
        (acc, r) => ({
          bags: acc.bags + (Number(r.bags) || 0),
          qty: acc.qty + (Number(r.qty) || 0),
          amount: acc.amount + (Number(r.amount) || 0),
        }),
        { bags: 0, qty: 0, amount: 0 }
      ),
    [displayedRows]
  );

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

  const SortLabel = ({ column, children, align = 'left' }) => {
    const active = sortKey === column;
    const Icon = active ? (sortDir === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <button
        type="button"
        title={
          active
            ? sortDir === 'asc'
              ? 'Sorted A-Z — click for Z-A'
              : 'Sorted Z-A — click to remove sort'
            : 'Click to sort'
        }
        className={`inline-flex items-center gap-1 font-semibold ${align === 'right' ? 'w-full justify-end' : ''}`}
        onClick={() => toggleSort(column)}
      >
        {children}
        <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-accent-800' : 'text-accent-800/45'}`} />
      </button>
    );
  };

  const nextSerial = editingSaleId
    ? flatRows.find((r) => r.saleId === editingSaleId)?.serial || flatRows.length
    : flatRows.length + 1;

  const loadDaySales = async (targetDate = date) => {
    if (!targetDate) {
      setSales([]);
      return [];
    }
    const res = await api.get('/sales', { params: { date: targetDate } });
    setSales(res.data);
    return res.data;
  };

  const fillFromSale = (sale, lineIndex = 0) => {
    if (!sale) return;
    fillingRef.current = true;
    const line = (sale.lines || [])[lineIndex] || (sale.lines || [])[0];
    const isCash = sale.isCashSale || !sale.customer || sale.customerName === 'Cash';
    const cust = sale.customer;
    const custId = isCash ? 'cash' : (cust?._id || (typeof cust === 'string' ? cust : ''));
    const custObj = isCash ? null : (customers.find((c) => c._id === custId) || (typeof cust === 'object' ? cust : null));

    editingSaleIdRef.current = sale._id;
    setEditingSaleId(sale._id);
    setEditingLineIndex(lineIndex);
    setFocusSaleId(sale._id);

    const vId = sale.vendor?._id || (typeof sale.vendor === 'string' ? sale.vendor : '');
    setVendorId(vId);

    if (isCash) {
      setCustomerId('cash');
      setNameQuery('Cash');
      setCoolyOn(!!sale.handlingCharges || Number(sale.coolyRate) > 0);
    } else if (custObj || custId) {
      setCustomerId(custObj?._id || custId);
      setNameQuery(custObj?.name || '');
      setCoolyOn(!!sale.handlingCharges || Number(sale.coolyRate) > 0);
    }
    if (line) {
      const matId = line.material?._id || (typeof line.material === 'string' ? line.material : '');
      setMaterialId(matId);
      setRate(String(line.ratePerKg ?? ''));
      const lineIsByBag =
        line.saleType === 'by_bag' ||
        (line.bagCount > 0 && (!line.bags || line.bags.length === 0) && Number(line.totalKg) === 0);
      setSaleType(lineIsByBag ? 'by_bag' : 'by_weight');
      if (lineIsByBag) {
        setDirectBagCount(String(line.bagCount || ''));
        setBagWeights(['']);
      } else {
        let bags = (line.bags || []).map((b) => String(b.kgs ?? '')).filter((b) => b !== '');
        if (!bags.length && line.bagCount > 0 && Number(line.totalKg) > 0) {
          const totalKg = Number(line.totalKg);
          const bagCount = Math.max(1, Math.floor(Number(line.bagCount)));
          const avg = Number((totalKg / bagCount).toFixed(1));
          const rem = Number((totalKg - avg * (bagCount - 1)).toFixed(1));
          bags = Array.from({ length: bagCount }, (_, idx) =>
            String(idx === bagCount - 1 ? rem : avg)
          );
        }
        setBagWeights(bags.length ? bags : ['']);
        setDirectBagCount('');
      }
    }
    setCoolyPerBag(!!sale.coolyPerBag);
    setCooly(String(sale.coolyRate != null && sale.coolyRate !== '' ? sale.coolyRate : sale.handlingCharges || 0));
    setIsPaid(!!sale.isPaid);
    setTimeout(() => {
      fillingRef.current = false;
    }, 0);
  };

  const requestEditSale = (sale, lineIndex = 0, forceAuth = false, cellTarget = null) => {
    if (!sale) return false;
    // Always require password on first edit attempt (not yet authorized)
    if (!editAuthorized) {
      setPendingEditSale({ sale, lineIndex, cellTarget });
      setAdminPasswordInput('');
      setAuthError('');
      setShowAuthModal(true);
      return false;
    }
    if (editingSaleId === sale._id && editingLineIndex === lineIndex && !forceAuth) {
      return true;
    }
    fillFromSale(sale, lineIndex);
    return true;
  };

  const handleVerifyPassword = async (e) => {
    e?.preventDefault?.();
    if (!adminPasswordInput) {
      setAuthError('Please enter the admin password.');
      return;
    }
    setAuthError('');
    setVerifyingPassword(true);
    try {
      await api.post('/auth/verify-password', { password: adminPasswordInput });
      setEditAuthorized(true);
      setShowAuthModal(false);
      setAuthError('');
      toast.success('Admin verified — edit access granted');
      if (pendingEditSale) {
        fillFromSale(pendingEditSale.sale, pendingEditSale.lineIndex);
        const cellTarget = pendingEditSale.cellTarget;
        setPendingEditSale(null);
        if (cellTarget) {
          setTimeout(() => {
            const selector = `[data-table-row="${cellTarget.row}"][data-table-col="${cellTarget.col}"]`;
            const el = document.querySelector(selector);
            if (el) {
              el.focus();
              if (typeof el.select === 'function' && el.tagName === 'INPUT') {
                el.select();
              }
            }
          }, 80);
        }
      }
    } catch (err) {
      setAuthError(err.response?.data?.message || 'Wrong password. Please try again.');
      setAdminPasswordInput('');
    } finally {
      setVerifyingPassword(false);
    }
  };

  const loadMasterData = useCallback(() => {
    Promise.all([api.get('/materials'), api.get('/customers'), api.get('/vendors'), api.get('/settings')])
      .then(([m, c, v, s]) => {
        setMaterials(m.data);
        setCustomers(c.data);
        setVendors(v.data);
        if (s.data?.salesCoolyRateByWeight != null) {
          setSalesCoolyRateByWeight(String(s.data.salesCoolyRateByWeight));
        } else if (s.data?.salesCoolyRate != null) {
          setSalesCoolyRateByWeight(String(s.data.salesCoolyRate));
        }
        if (s.data?.salesCoolyRateByBag != null) {
          setSalesCoolyRateByBag(String(s.data.salesCoolyRateByBag));
        } else if (s.data?.salesCoolyRate != null) {
          setSalesCoolyRateByBag(String(s.data.salesCoolyRate));
        }
      })
      .catch(() => toast.error('Failed to load master data'));
  }, []);

  useEffect(() => {
    loadMasterData();
  }, [loadMasterData]);

  const reloadAll = useCallback(() => {
    loadMasterData();
    loadDaySales().catch(() => setSales([]));
  }, [loadMasterData, date]);

  useDataRestored(reloadAll);

  useEffect(() => {
    const handleDataUpdated = () => {
      reloadAll();
    };
    window.addEventListener('jsr_data_updated', handleDataUpdated);
    return () => window.removeEventListener('jsr_data_updated', handleDataUpdated);
  }, [reloadAll]);

  useEffect(() => {
    if (date) {
      loadDaySales(date).catch(() => setSales([]));
      window.dispatchEvent(new CustomEvent('jsr_sales_date_changed', { detail: { date } }));
    } else {
      setSales([]);
    }
  }, [date]);

  const remoteFetchedSaleIdRef = useRef('');

  useEffect(() => {
    if (!focusSaleId) {
      remoteFetchedSaleIdRef.current = '';
      return;
    }
    const target = sales.find((s) => s._id === focusSaleId);
    if (target) {
      return;
    }
    // If not found in current day's sales list, fetch directly once to sync date
    if (remoteFetchedSaleIdRef.current === focusSaleId) return;
    remoteFetchedSaleIdRef.current = focusSaleId;
    let active = true;
    api
      .get(`/sales/${focusSaleId}`)
      .then((res) => {
        if (!active || !res.data) return;
        const d = dateToLocalISO(res.data.createdAt);
        if (d && d !== date) setDate(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sales, focusSaleId, date]);

  useEffect(() => {
    if (!focusSaleId || !focusRowRef.current) return;
    const timer = setTimeout(() => {
      focusRowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
    return () => clearTimeout(timer);
  }, [focusSaleId, displayedRows.length]);

  useEffect(() => {
    setHighlight(-1);
  }, [nameQuery, suggestions]);

  useEffect(() => {
    if (fillingRef.current || editingSaleId) return;
    if (material) {
      const p = Number(material.sellingPricePerKg) || 0;
      setRate(p > 0 ? String(p) : '');
    } else {
      setRate('');
    }
  }, [materialId, material, editingSaleId]);

  useEffect(() => {
    if (fillingRef.current || editingSaleId) return;
    const hasCooly = customerCoolyDefault;
    setCoolyOn(hasCooly);
    if (hasCooly) {
      setCooly((prev) => (!prev || prev === '0' ? salesCoolyRate : prev));
    } else {
      setCooly('0');
    }
  }, [customerId, customerCoolyDefault, salesCoolyRate, editingSaleId]);

  useEffect(() => {
    if (fillingRef.current || editingSaleId) return;
    if (coolyOn) {
      setCooly(salesCoolyRate);
    }
  }, [saleType, salesCoolyRate, coolyOn, editingSaleId]);

  useEffect(() => {
    if (focusBagIdx == null) return;
    const el = bagInputRefs.current[focusBagIdx];
    if (el) {
      el.focus();
      setFocusBagIdx(null);
    }
  }, [bagWeights, focusBagIdx]);

  const pickCustomer = (c) => {
    if (c._id === 'cash' || c.isCashSale) {
      setCustomerId('cash');
      setNameQuery('Cash');
      setSuggestOpen(false);
      setHighlight(-1);
      setCoolyOn(false);
      setCooly('0');
      setFocusBagIdx(0);
      return;
    }
    setCustomerId(c._id);
    setNameQuery(c.name);
    setSuggestOpen(false);
    setHighlight(-1);
    const hasCooly = !!c.handlingCharges;
    setCoolyOn(hasCooly);
    if (hasCooly) {
      setCooly((prev) => (!prev || prev === '0' ? salesCoolyRate : prev));
    } else {
      setCooly('0');
    }
    setFocusBagIdx(0);
  };

  const clearEntry = ({ clearFocus = true, focusName = true } = {}) => {
    editingSaleIdRef.current = '';
    setEditingSaleId('');
    setEditAuthorized(false);
    setEditingLineIndex(0);
    if (clearFocus) {
      setFocusSaleId('');
    }
    setCustomerId('');
    setNameQuery('');
    setDirectBagCount('');
    setBagWeights(['']);
    setCooly('0');
    setCoolyOn(false);
    setCoolyPerBag(true);
    setIsPaid(false);
    setDetail('');
    if (material) {
      const p = Number(material.sellingPricePerKg) || 0;
      setRate(p > 0 ? String(p) : '');
    } else {
      setRate('');
    }
    if (focusName) {
      setTimeout(() => {
        nameRef.current?.focus();
      }, 50);
    }
    if (searchParams.get('saleId') || searchParams.get('customerId') || searchParams.get('highlightSaleId')) {
      setSearchParams({}, { replace: true });
    }
  };

  const updateBag = (idx, value) => {
    const next = [...bagWeights];
    next[idx] = value;
    setBagWeights(next);
  };

  const removeBag = (idx) => {
    if (bagWeights.length <= 1) {
      setBagWeights(['']);
      return;
    }
    const next = bagWeights.filter((_, i) => i !== idx);
    setBagWeights(next);
  };

  const handleBagEnter = (e, idx) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const weight = Number(bagWeights[idx]);
    if (!weight || weight <= 0) {
      // Empty last bag → move on to rate
      if (idx === bagWeights.length - 1 && bagCount > 0) {
        rateRef.current?.focus();
        return;
      }
      toast.error('Enter bag weight first');
      return;
    }

    if (idx === bagWeights.length - 1) {
      setBagWeights([...bagWeights, '']);
    }
    setFocusBagIdx(idx + 1);
  };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!date) {
      toast.error('Select date');
      return;
    }
    if (!materialId) {
      toast.error('Select product');
      return;
    }
    if (!vendorId) {
      toast.error('Select vendor');
      return;
    }
    const isCash = customerId === 'cash' || nameQuery.trim().toLowerCase() === 'cash' || nameQuery.trim().toLowerCase() === 'నగదు';
    if (!isCash && !customerId) {
      toast.error('Type and select a customer or type Cash');
      return;
    }
    const isByBag = saleType === 'by_bag';
    let bags = [];
    let lineBagCount = 0;
    if (isByBag) {
      lineBagCount = Math.max(1, Math.floor(Number(directBagCount) || 0));
      if (!lineBagCount) {
        toast.error('Enter valid number of bags');
        return;
      }
    } else {
      bags = bagWeights.map((kgs) => ({ kgs: Number(kgs) })).filter((b) => b.kgs > 0);
      if (!bags.length) {
        toast.error('Enter bag weights');
        return;
      }
      lineBagCount = bags.length;
    }
    const ratePerKg = Number(rate);
    if (rate === '' || Number.isNaN(ratePerKg) || ratePerKg < 0) {
      toast.error(isByBag ? 'Enter rate per bag' : 'Enter rate per kg');
      return;
    }

    if (editingSaleId && !editAuthorized) {
      const rowData =
        displayedRows.find((r) => r.saleId === editingSaleId) ||
        flatRows.find((r) => r.saleId === editingSaleId);
      setPendingEditSale({
        sale: rowData?.sale || { _id: editingSaleId },
        lineIndex: editingLineIndex,
      });
      setAdminPasswordInput('');
      setShowAuthModal(true);
      toast.error('Admin password required to update sales entry');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customerId: isCash ? 'cash' : customerId,
        isCashSale: isCash,
        customerName: isCash ? 'Cash' : undefined,
        vendorId,
        date,
        handlingCharges: coolyOn ? coolyApplied : 0,
        coolyRate: coolyOn ? Number(cooly) || 0 : 0,
        coolyPerBag: coolyOn ? coolyPerBag : false,
        isPaid: isCash ? true : isPaid,
        paymentType: 'Cash',
        lines: [
          {
            materialId,
            saleType: isByBag ? 'by_bag' : 'by_weight',
            ratePerKg,
            bags,
            bagCount: lineBagCount,
            totalKg: isByBag ? 0 : qty,
          },
        ],
      };
      let savedSaleId = editingSaleId;
      if (editingSaleId) {
        await api.put(`/sales/${editingSaleId}`, payload);
        toast.success('Sale updated');
        setEditAuthorized(false);
      } else {
        const res = await api.post('/sales', payload);
        savedSaleId = res.data?._id;
        toast.success('Saved');
      }
      if (hasActiveFilters) {
        setFilterCustomer('');
        setFilterVendor('');
        setFilterItem('');
      }
      await loadDaySales();
      window.dispatchEvent(new CustomEvent('jsr_data_updated'));
      if (savedSaleId) {
        setFocusSaleId(savedSaleId);
      }
      clearEntry({ clearFocus: false, focusName: true });
      api.get('/customers').then((r) => setCustomers(r.data));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sale failed');
    } finally {
      setSaving(false);
    }
  };

  const commitCellEdit = async (row, patch) => {
    if (!editAuthorized) {
      requestEditSale(row.sale, row.lineIndex, true);
      return;
    }
    const updateKey = `${row.saleId}-${row.lineIndex}-${JSON.stringify(patch)}`;
    if (inFlightUpdatesRef.current.has(updateKey)) {
      return;
    }
    inFlightUpdatesRef.current.add(updateKey);
    try {
      await persistTableRow(row, patch);
      toast.success('Sale updated');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update');
    } finally {
      inFlightUpdatesRef.current.delete(updateKey);
    }
  };

  const persistTableRow = async (row, patch) => {
    if (!editAuthorized) {
      requestEditSale(row.sale, row.lineIndex, true);
      toast.error('Admin password required to edit sales entry');
      return;
    }
    const sale = row.sale;
    const isCashNext = patch.customerId === 'cash' || patch.isCashSale || (!patch.customerId && (sale.isCashSale || !sale.customer));
    const customerIdNext = isCashNext ? 'cash' : (patch.customerId || sale.customer?._id || sale.customer);
    const vendorIdNext = sale.vendor?._id || sale.vendor;
    if (!customerIdNext || !vendorIdNext) {
      toast.error('Sale is missing customer or vendor');
      return;
    }

    const coolyRateNext =
      patch.coolyRate !== undefined
        ? Math.max(0, Number(patch.coolyRate) || 0)
        : Number(sale.coolyRate != null ? sale.coolyRate : sale.handlingCharges) || 0;
    const coolyPerBagNext =
      patch.coolyPerBag !== undefined ? !!patch.coolyPerBag : !!sale.coolyPerBag;

    const lines = (sale.lines || []).map((l, i) => {
      const materialId = l.material?._id || l.material;
      const isByBag = l.saleType === 'by_bag' || (l.bagCount > 0 && (!l.bags || l.bags.length === 0) && Number(l.totalKg) === 0);
      const base = {
        materialId,
        saleType: isByBag ? 'by_bag' : 'by_weight',
        ratePerKg: l.ratePerKg,
        bags: l.bags,
        bagCount: l.bagCount,
        totalKg: l.totalKg,
      };
      if (i !== row.lineIndex) return base;

      if (patch.materialId) {
        base.materialId = patch.materialId;
      }
      if (patch.rate !== undefined) {
        const ratePerKg = Number(patch.rate);
        if (Number.isNaN(ratePerKg) || ratePerKg < 0) {
          throw new Error('Enter a valid rate');
        }
        base.ratePerKg = ratePerKg;
      }
      if (patch.qty !== undefined || patch.bags !== undefined) {
        const bags = patch.bags !== undefined ? Math.floor(Number(patch.bags)) : Number(l.bagCount) || 1;
        if (!bags || bags < 1) throw new Error('Enter bags');
        if (isByBag) {
          base.totalKg = 0;
          base.bagCount = bags;
          delete base.bags;
        } else {
          const qty = patch.qty !== undefined ? Number(patch.qty) : Number(l.totalKg);
          if (!qty || qty <= 0) throw new Error('Enter quantity (kg)');
          base.totalKg = qty;
          base.bagCount = bags;
          if (l.bags && l.bags.length === bags) {
            base.bags = l.bags;
          } else {
            delete base.bags;
          }
        }
      }
      return base;
    });

    try {
      const res = await api.put(`/sales/${sale._id}`, {
        customerId: customerIdNext,
        vendorId: vendorIdNext,
        date,
        handlingCharges: coolyRateNext,
        coolyRate: coolyRateNext,
        coolyPerBag: coolyPerBagNext,
        lines,
      });
      const updatedSales = await loadDaySales();
      window.dispatchEvent(new CustomEvent('jsr_data_updated'));
      setFocusSaleId(sale._id);
      const freshSale = (updatedSales || []).find((s) => s._id === sale._id) || res.data;
      if (freshSale && editingSaleIdRef.current === sale._id) {
        fillFromSale(freshSale, row.lineIndex);
      }
      api.get('/customers').then((r) => setCustomers(r.data));
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update');
      await loadDaySales();
    }
  };

  const custSuggestListRef = useRef(null);

  useEffect(() => {
    if (!suggestOpen || highlight < 0 || !custSuggestListRef.current) return;
    const el = custSuggestListRef.current.querySelector(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, suggestOpen]);

  const onNameKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!suggestOpen) setSuggestOpen(true);
      if (suggestions.length) {
        setHighlight((h) => (h < 0 ? 0 : Math.min(h + 1, suggestions.length - 1)));
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (suggestions.length) {
        setHighlight((h) => (h <= 0 ? 0 : h - 1));
      }
      return;
    }
    if (e.key === 'Enter') {
      if (suggestOpen && suggestions.length && highlight >= 0) {
        e.preventDefault();
        const pick = suggestions[highlight];
        if (pick) pickCustomer(pick);
      } else if (nameQuery.trim().toLowerCase() === 'cash' || nameQuery.trim().toLowerCase() === 'నగదు') {
        e.preventDefault();
        pickCustomer({ _id: 'cash', name: 'Cash', nameTelugu: 'నగదు', isCashSale: true });
      } else if (suggestOpen && suggestions.length) {
        e.preventDefault();
        const pick = suggestions[0];
        if (pick) pickCustomer(pick);
      } else {
        e.preventDefault();
        setFocusBagIdx(0);
      }
      return;
    }
    if (e.key === 'Escape') {
      setSuggestOpen(false);
      setHighlight(-1);
    }
  };

  const printNUp = async (perPage) => {
    if (!displayedRows.length) {
      toast.error('No sales to print');
      return;
    }

    setPrinting(true);
    try {
      let serverStatements = new Map();
      try {
        const res = await api.get('/reports/bills', {
          params: { startDate: date, endDate: date },
        });
        serverStatements = new Map(
          (res.data?.statements || []).map((st) => [String(st.customerId), st])
        );
      } catch (e) {
        console.warn('Could not fetch /reports/bills, using current sales view data:', e);
      }

      const hasFilter = !!(filterItem || filterVendor || filterCustomer);
      const statementsMap = new Map();

      for (const row of displayedRows) {
        const rawCid = row.customerId?._id || row.customerId || row.sale?.customer?._id || row.sale?.customer;
        let cid = '';
        if (typeof rawCid === 'string' && rawCid.trim() && rawCid !== '[object Object]') {
          cid = rawCid.trim();
        } else if (rawCid && typeof rawCid === 'object' && rawCid._id) {
          cid = String(rawCid._id);
        } else if (row.name && row.name !== '—') {
          cid = `name_${row.name.trim()}`;
        }
        if (!cid) continue;

        if (!statementsMap.has(cid)) {
          const serverSt = serverStatements.get(cid);
          const fullCust = customers.find((c) => String(c._id) === cid);
          statementsMap.set(cid, {
            customerId: cid,
            name: row.name && row.name !== '—' ? row.name : fullCust?.name || serverSt?.name || '—',
            nameTelugu: fullCust?.nameTelugu || serverSt?.nameTelugu || '',
            opening: hasFilter ? 0 : Number(serverSt?.opening) || 0,
            sales: [],
            payments: hasFilter ? [] : serverSt?.payments || [],
            totalSale: 0,
            totalPaid: hasFilter ? 0 : Number(serverSt?.totalPaid) || 0,
            closing: 0,
          });
        }

        const st = statementsMap.get(cid);
        const lineAmt = Number(row.amount) || 0;
        st.sales.push({
          date: row.createdAt || date,
          material: row.item || 'Sale',
          bags: Number(row.bags) || 0,
          weight: Number(row.qty) || 0,
          amount: lineAmt,
        });
      }

      const statements = Array.from(statementsMap.values()).map((st) => {
        const totalSale = Number(st.sales.reduce((acc, s) => acc + (Number(s.amount) || 0), 0).toFixed(2));
        const totalPaid = Number((st.payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0).toFixed(2));
        const closing = Number((st.opening + totalSale - totalPaid).toFixed(2));
        const entries = [
          ...st.sales.map((s) => ({ ...s, isPayment: false })),
          ...(st.payments || []).map((p) => ({ ...p, isPayment: true, material: p.description || 'Paid' })),
        ].sort((a, b) => new Date(a.date || a.createdAt || 0).getTime() - new Date(b.date || b.createdAt || 0).getTime());
        return {
          ...st,
          entries,
          totalSale,
          totalPaid,
          closing,
        };
      });

      if (!statements.length) {
        toast.error('No bills to print');
        return;
      }

      await openRangeBillsNUp(statements, perPage);
      setPrintOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Could not print bill');
    } finally {
      setPrinting(false);
    }
  };


  const handleDeleteSale = async (r) => {
    if (!r.saleId) return;
    if (!window.confirm(`Are you sure you want to delete the sales entry for "${r.name || 'customer'}" (${r.item || 'Item'})?`)) {
      return;
    }
    try {
      await api.delete(`/sales/${r.saleId}`);
      toast.success('Sales entry deleted successfully');
      if (editingSaleId === r.saleId) {
        clearEntry();
      }
      await loadDaySales();
      window.dispatchEvent(new CustomEvent('jsr_data_updated'));
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to delete sale');
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-1 min-h-full overflow-hidden">
      {/* ── Page Header ── */}
      <div className="shrink-0 px-0.5 flex items-center justify-between">
        <div>
          <h1 className="page-title text-lg md:text-xl font-bold">Sales Entry</h1>
          <p className="text-primary-400 text-xs mt-0">
            Select product, vendor & date — then enter customers one by one
          </p>
        </div>
      </div>

      {/* ── Responsive Horizontal Entry Form ── */}
      <form
        onSubmit={handleSave}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && editingSaleId) {
            e.preventDefault();
            clearEntry({ clearFocus: false, focusName: true });
          }
        }}
        className="shrink-0 bg-surface border border-primary-200 rounded-xl shadow-2xs overflow-hidden"
      >
        {/* Top toolbar: Mode & actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-1.5 bg-accent-50/80 border-b border-primary-100">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-primary-800">
                {editingSaleId ? 'Edit Sales Entry' : 'New Sales Entry'}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded bg-surface border border-primary-200 text-xs font-bold text-primary-700">
                S.No {nextSerial}
              </span>
              {editingSaleId && (
                <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 text-xs font-semibold">
                  Editing
                </span>
              )}
            </div>

            <div className="h-4 w-px bg-primary-200 shrink-0" />

            {/* Sale Type radios */}
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-sm text-primary-700 font-medium cursor-pointer">
                <input
                  type="radio"
                  name="saleType"
                  value="by_weight"
                  checked={saleType === 'by_weight'}
                  onChange={() => setSaleType('by_weight')}
                  className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                />
                By kg
              </label>
              <label className="inline-flex items-center gap-1.5 text-sm text-primary-700 font-medium cursor-pointer">
                <input
                  type="radio"
                  name="saleType"
                  value="by_bag"
                  checked={saleType === 'by_bag'}
                  onChange={() => setSaleType('by_bag')}
                  className="w-4 h-4 text-primary-600 focus:ring-primary-500"
                />
                By bag
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="btn-primary !py-1.5 !px-4 !text-sm font-semibold"
              disabled={saving}
            >
              {saving ? 'Saving...' : editingSaleId ? 'Update' : 'Save'}
            </button>
            <button
              type="button"
              className="btn-secondary !py-1.5 !px-3 !text-sm font-semibold"
              onClick={() => clearEntry()}
            >
              {editingSaleId ? 'Cancel' : 'Clear'}
            </button>
          </div>
        </div>

        {/* 2-Row Inputs Structure with enhanced font size */}
        <div className="p-3 space-y-2.5">
          {/* Row 1: Primary Transaction Details */}
          <div className="flex items-end gap-2.5">
            {/* Date */}
            <div className="flex flex-col shrink-0 w-32">
              <label className="text-xs font-semibold text-primary-600 mb-1">Date *</label>
              <input
                type="date"
                className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
                value={date}
                onChange={(e) => {
                  const newDate = e.target.value;
                  setDate(newDate);
                  clearEntry({ clearFocus: true, focusName: false });
                  setFilterCustomer('');
                  setFilterVendor('');
                  setFilterItem('');
                  if (newDate && typeof updateWindowPath === 'function') {
                    updateWindowPath('/sell', `/sell?date=${newDate}`);
                  }
                }}
                required
              />
            </div>

            {/* Product */}
            <div className="flex flex-col flex-1 min-w-[130px]">
              <label className="text-xs font-semibold text-primary-600 mb-1">Product *</label>
              <select
                className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition truncate"
                value={materialId}
                onChange={(e) => setMaterialId(e.target.value)}
                required
              >
                <option value="">Select product...</option>
                {materials.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.name}{m.nameTelugu ? ` · ${m.nameTelugu}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Vendor */}
            <div className="flex flex-col flex-1 min-w-[120px]">
              <label className="text-xs font-semibold text-primary-600 mb-1">Vendor *</label>
              <select
                className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition truncate"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                required
              >
                <option value="">{vendors.length ? 'Select vendor...' : 'No vendors'}</option>
                {vendors.map((v) => (
                  <option key={v._id} value={v._id}>
                    {v.name}{v.city ? ` · ${v.city}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Customer Name */}
            <div className="flex flex-col relative flex-1 min-w-[140px]">
              <label className="text-xs font-semibold text-primary-600 mb-1">Name *</label>
              <input
                ref={nameRef}
                className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 placeholder:text-primary-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
                value={nameQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setNameQuery(val);
                  if (val.trim().toLowerCase() === 'cash' || val.trim().toLowerCase() === 'నగదు') {
                    setCustomerId('cash');
                    setCoolyOn(false);
                    setCooly('0');
                  } else {
                    const match = customers.find((c) => c.name.trim().toLowerCase() === val.trim().toLowerCase());
                    if (match) {
                      setCustomerId(match._id);
                      const hasCooly = !!match.handlingCharges;
                      setCoolyOn(hasCooly);
                      if (hasCooly) setCooly((prev) => (!prev || prev === '0' ? salesCoolyRate : prev));
                    } else {
                      setCustomerId('');
                    }
                  }
                  setSuggestOpen(true);
                }}
                onFocus={() => setSuggestOpen(true)}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                onKeyDown={onNameKeyDown}
                placeholder="Customer name..."
                autoComplete="off"
              />
              {suggestOpen && suggestions.length > 0 && (
                <ul
                  ref={custSuggestListRef}
                  className="absolute top-full left-0 z-30 mt-1 w-64 max-h-48 overflow-auto rounded-xl border border-primary-200 bg-surface shadow-card"
                >
                  {suggestions.map((c, idx) => (
                    <li key={c._id}>
                      <button
                        type="button"
                        data-idx={idx}
                        className={`w-full text-left px-3 py-2 text-sm ${idx === highlight ? 'bg-primary-100 text-primary-800' : 'hover:bg-primary-50'}`}
                        onMouseDown={(ev) => { ev.preventDefault(); pickCustomer(c); }}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.nameTelugu ? <span className="block text-xs text-primary-400">{c.nameTelugu}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Amount */}
            <div className="flex flex-col shrink-0 w-28">
              <label className="text-xs font-semibold text-primary-600 mb-1">Amount</label>
              <input
                className="h-9 w-full rounded-lg border border-accent-300/80 bg-accent-100/90 px-2.5 py-1 text-base font-bold text-accent-900 text-right focus:outline-none tabular-nums shadow-2xs"
                value={amount ? formatCurrency(amount) : ''}
                readOnly
              />
            </div>
          </div>

          {/* Row 2: Quantities, Rates, Cooly & Bag Weights */}
          <div className="flex items-center gap-2.5 pt-1.5 border-t border-primary-100/70 min-h-[38px]">
            {/* Bags */}
            <div className="flex items-center gap-1.5 shrink-0">
              <label className="text-xs font-semibold text-primary-600 shrink-0">
                {isByBag ? 'Bags *' : 'Bags:'}
              </label>
              {isByBag ? (
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="h-8 w-16 rounded-lg border border-primary-200 bg-surface px-2 py-1 text-sm font-semibold text-primary-700 text-right focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
                  placeholder="0"
                  value={directBagCount}
                  onChange={(e) => setDirectBagCount(e.target.value.replace(/[^\d]/g, ''))}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); rateRef.current?.focus(); } }}
                />
              ) : (
                <input
                  className="h-8 w-14 rounded-lg border border-primary-200 bg-primary-50 px-2 py-1 text-sm font-bold text-primary-800 text-right focus:outline-none tabular-nums"
                  value={bagCount || '0'}
                  readOnly
                />
              )}
            </div>

            {/* Qty (kg) */}
            <div className="flex items-center gap-1.5 shrink-0">
              <label className="text-xs font-semibold text-primary-600 shrink-0">Qty (kg):</label>
              <input
                className={`h-8 w-20 rounded-lg border border-primary-200 px-2 py-1 text-sm font-bold text-right focus:outline-none tabular-nums ${
                  isByBag ? 'bg-primary-50/70 text-primary-400' : 'bg-primary-50 text-primary-800'
                }`}
                value={isByBag ? '—' : (qty ? qty.toFixed(1) : '')}
                readOnly
              />
            </div>

            {/* Rate */}
            <div className="flex items-center gap-1.5 shrink-0">
              <label className="text-xs font-semibold text-primary-600 shrink-0">
                {isByBag ? 'Rate/bag *' : 'Rate/kg *'}
              </label>
              <input
                ref={rateRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="h-8 w-20 rounded-lg border border-primary-200 bg-surface px-2 py-1 text-sm font-bold text-primary-800 text-right focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
                value={rate}
                onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (coolyOn) coolyRef.current?.focus();
                  else handleSave(e);
                }}
              />
            </div>

            {/* Cooly */}
            <div className="flex items-center gap-1.5 shrink-0">
              <label className="text-xs font-semibold text-primary-600 shrink-0 flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 cursor-pointer">
                  Cooly <input type="checkbox" checked={coolyOn} onChange={(e) => { setCoolyOn(e.target.checked); if (e.target.checked) setCooly((p) => (!p || p === '0' ? salesCoolyRate : p)); else setCooly('0'); }} className="w-3.5 h-3.5 rounded cursor-pointer" />
                </span>
                <span className="inline-flex items-center gap-1 font-normal text-primary-500 cursor-pointer">
                  /bag <input type="checkbox" checked={coolyPerBag} disabled={!coolyOn} onChange={(e) => setCoolyPerBag(e.target.checked)} className="w-3.5 h-3.5 rounded cursor-pointer" />
                </span>
              </label>
              <input
                ref={coolyRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="h-8 w-18 rounded-lg border border-primary-200 bg-surface px-2 py-1 text-sm font-semibold text-primary-700 text-right focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition disabled:bg-primary-50 disabled:text-primary-400"
                value={cooly}
                disabled={!coolyOn}
                onChange={(e) => setCooly(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSave(e); } }}
              />
            </div>

            {/* Vertical Divider */}
            <div className="h-6 w-px bg-primary-200 shrink-0 mx-1" />

            {/* Bag weights or by_bag indicator */}
            <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto no-scrollbar">
              {isByBag ? (
                <span className="text-xs text-primary-500 font-medium italic whitespace-nowrap">
                  By bag sale — {directBagCount || '0'} bags · weights not applicable
                </span>
              ) : (
                <>
                  <span className="text-xs font-semibold text-primary-700 shrink-0">Bag wts:</span>
                  {bagWeights.map((bag, idx) => (
                    <div key={idx} className="relative inline-flex items-center shrink-0">
                      <input
                        ref={(el) => { bagInputRefs.current[idx] = el; }}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        className="w-14 h-8 rounded-lg border border-primary-200 bg-surface px-1.5 text-sm font-semibold text-primary-800 text-center pr-4 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
                        placeholder={`${idx + 1}`}
                        value={bag}
                        onChange={(e) => updateBag(idx, e.target.value.replace(/[^\d.]/g, ''))}
                        onKeyDown={(e) => handleBagEnter(e, idx)}
                      />
                      {bagWeights.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeBag(idx)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-primary-400 hover:text-rose-600 text-xs px-0.5 font-bold rounded cursor-pointer leading-none"
                        >×</button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setBagWeights([...bagWeights, '']); setFocusBagIdx(bagWeights.length); }}
                    className="px-2.5 py-1 text-xs font-semibold text-accent-800 bg-accent-100 hover:bg-accent-200 border border-accent-300/80 rounded-lg transition cursor-pointer shrink-0"
                  >+ Add</button>
                </>
              )}
            </div>
          </div>
        </div>
      </form>

      {/* ── Full-Width Table Card ── */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

        <div className="card p-0 w-full min-w-0 flex-1 min-h-0 h-full flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-primary-100 px-3 py-2 bg-accent-50 shrink-0 min-w-0">
          <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto no-scrollbar py-0.5">
            <select
              className="bg-surface text-primary-700 text-xs font-medium border border-primary-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400/20 cursor-pointer min-w-[110px] max-w-[150px] truncate shrink-0"
              value={filterCustomer}
              onChange={(e) => setFilterCustomer(e.target.value)}
            >
              <option value="">All customers</option>
              {availableCustomers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} {c.nameTelugu ? `· ${c.nameTelugu}` : ''}
                </option>
              ))}
            </select>

            <select
              className="bg-surface text-primary-700 text-xs font-medium border border-primary-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400/20 cursor-pointer min-w-[100px] max-w-[140px] truncate shrink-0"
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
            >
              <option value="">All vendors</option>
              {availableVendors.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.name} {v.city ? `· ${v.city}` : ''}
                </option>
              ))}
            </select>

            <select
              className="bg-surface text-primary-700 text-xs font-medium border border-primary-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-primary-400 focus:ring-1 focus:ring-primary-400/20 cursor-pointer min-w-[100px] max-w-[130px] truncate shrink-0"
              value={filterItem}
              onChange={(e) => setFilterItem(e.target.value)}
            >
              <option value="">All items</option>
              {availableItems.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name} {m.nameTelugu ? `· ${m.nameTelugu}` : ''}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                className="text-xs font-medium text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg px-2 py-1 transition whitespace-nowrap shrink-0"
                onClick={() => {
                  setFilterCustomer('');
                  setFilterVendor('');
                  setFilterItem('');
                }}
              >
                Clear filters
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5 !py-1.5 !px-3 text-sm shrink-0 ml-auto"
            disabled={!flatRows.length}
            onClick={() => {
              const params = new URLSearchParams();
              if (date) params.set('date', date);
              if (filterCustomer) params.set('customer', filterCustomer);
              if (filterVendor) params.set('vendor', filterVendor);
              if (filterItem) params.set('item', filterItem);
              params.set('t', Date.now().toString());
              openWindow({ path: `/sales-print?${params.toString()}`, title: 'Sales Print' });
            }}
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto border-t border-primary-200 bg-surface">
        <table className="w-full min-w-[760px] text-xs excel-grid">
          <thead className="sticky top-0 z-20 bg-accent-200">
            <tr className="bg-accent-200 text-accent-800 text-left">
              <th className="bg-accent-200 px-1.5 py-1.5 font-semibold whitespace-nowrap sticky top-0 z-20 text-center w-10">
                <SortLabel column="serial">S No</SortLabel>
              </th>
              <th className="bg-accent-200 px-2 py-1.5 font-semibold whitespace-nowrap sticky top-0 z-20 w-24">
                <SortLabel column="vendor">Vendor</SortLabel>
              </th>
              <th className="bg-accent-200 px-2 py-1.5 font-semibold whitespace-nowrap sticky top-0 z-20 w-28">
                <SortLabel column="item">Item</SortLabel>
              </th>
              <th className="bg-accent-200 px-2 py-1.5 font-semibold whitespace-nowrap sticky top-0 z-20">Name</th>
              <th className="bg-accent-200 px-1.5 py-1.5 font-semibold text-right whitespace-nowrap sticky top-0 z-20 w-12">Bags</th>
              <th className="bg-accent-200 px-1.5 py-1.5 font-semibold text-right whitespace-nowrap sticky top-0 z-20 w-14">Qty</th>
              <th className="bg-accent-200 px-1.5 py-1.5 font-semibold text-right whitespace-nowrap sticky top-0 z-20 w-14">Rate</th>
              <th className="bg-accent-200 px-1.5 py-1.5 font-semibold text-right whitespace-nowrap sticky top-0 z-20 w-14">Cooly</th>
              <th className="bg-accent-200 px-1.5 py-1.5 font-semibold text-right whitespace-nowrap sticky top-0 z-20 w-18">Amount</th>
              <th className="bg-accent-200 px-1.5 py-1.5 font-semibold text-right leading-tight whitespace-nowrap sticky top-0 z-20 w-28">
                <SortLabel column="createdAt" align="right">
                  <span>Entry Date Time</span>
                </SortLabel>
              </th>
              <th className="bg-accent-200 px-1 py-1.5 font-semibold text-center whitespace-nowrap sticky top-0 z-20 w-14">Action</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-primary-400">
                  {flatRows.length && hasActiveFilters
                    ? 'No sales match the selected filters'
                    : `No sales for this date yet`}
                </td>
              </tr>
            ) : (
              displayedRows.map((r, i) => {
                const busy = savingRowId === r.saleId;
                const cell = 'grid-input tabular-nums disabled:opacity-60';

                const handleGridKeyDown = (e, colIdx) => {
                  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    return;
                  }

                  const el = e.currentTarget || e.target;
                  const isInput = el.tagName === 'INPUT' && !el.readOnly;
                  const isSelect = el.tagName === 'SELECT';

                  // For text inputs, ArrowLeft/Right should move cursor within the
                  // text unless the caret is already at the boundary (start/end).
                  if (isInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                    const pos = el.selectionStart;
                    const len = (el.value || '').length;
                    const hasSelection = el.selectionStart !== el.selectionEnd;
                    if (hasSelection) return; // let browser collapse selection first
                    if (e.key === 'ArrowLeft' && pos > 0) return;   // cursor not at start
                    if (e.key === 'ArrowRight' && pos < len) return; // cursor not at end
                  }

                  let targetRow = i;
                  let targetCol = colIdx;

                  if (e.key === 'ArrowUp') {
                    targetRow = Math.max(0, i - 1);
                  } else if (e.key === 'ArrowDown') {
                    targetRow = Math.min(displayedRows.length - 1, i + 1);
                  } else if (e.key === 'ArrowLeft') {
                    targetCol = Math.max(0, colIdx - 1);
                  } else if (e.key === 'ArrowRight') {
                    targetCol = Math.min(9, colIdx + 1);
                  }

                  if (targetRow === i && targetCol === colIdx) return;

                  e.preventDefault();
                  e.stopPropagation();

                  // Cancel / revert any uncommitted edit in current cell before navigating away
                  cancelEditRef.current = true;
                  if (isInput) {
                    const origVal = originalCellRef.current?.val ?? (r.line?.ratePerKg != null ? String(r.line.ratePerKg) : (r.rate != null ? String(r.rate) : ''));
                    el.value = origVal;
                    if (r.isLiveEditing && colIdx === 6) {
                      setRate(origVal);
                    }
                  } else if (isSelect) {
                    const origVal = originalCellRef.current?.val;
                    if (origVal !== undefined) {
                      el.value = origVal;
                      if (r.isLiveEditing) {
                        if (colIdx === 2) setMaterialId(origVal);
                        if (colIdx === 3) {
                          setCustomerId(origVal);
                          const match = customers.find((c) => c._id === origVal);
                          if (match) setNameQuery(match.name);
                        }
                      }
                    }
                  }

                  // If moving to a different row while authorized, switch edit focus cleanly
                  if (targetRow !== i && editAuthorized) {
                    const targetRowData = displayedRows[targetRow];
                    if (targetRowData) {
                      fillFromSale(targetRowData.sale, targetRowData.lineIndex);
                    }
                  }

                  if (isInput || isSelect) {
                    el.blur();
                  }

                  // Store the target cell so we can re-focus after React re-render
                  pendingFocusCell.current = { row: targetRow, col: targetCol };

                  const focusTarget = () => {
                    const selector = `[data-table-row="${targetRow}"][data-table-col="${targetCol}"]`;
                    const target = document.querySelector(selector);
                    if (target) {
                      target.focus();
                      if (typeof target.select === 'function' && target.tagName === 'INPUT') {
                        target.select();
                      }
                      return true;
                    }
                    return false;
                  };

                  if (targetRow === i) {
                    if (focusTarget()) {
                      pendingFocusCell.current = null;
                    }
                  } else {
                    focusTarget();
                    requestAnimationFrame(() => {
                      if (pendingFocusCell.current) {
                        if (focusTarget()) pendingFocusCell.current = null;
                      }
                    });
                    setTimeout(() => {
                      if (pendingFocusCell.current) {
                        if (focusTarget()) pendingFocusCell.current = null;
                      }
                    }, 50);
                  }
                };

                return (
                  <tr
                    key={`${r.saleId}-${r.lineIndex}`}
                    ref={r.saleId === focusSaleId ? focusRowRef : null}
                    onClick={() => {
                      requestEditSale(r.sale, r.lineIndex);
                    }}
                    className={
                      r.saleId === focusSaleId || r.saleId === editingSaleId
                        ? 'bg-amber-100/90 font-bold border-l-4 border-l-amber-500 shadow-sm transition-all duration-300 ring-1 ring-amber-300'
                        : i % 2 === 0
                          ? 'bg-surface hover:bg-primary-50/40'
                          : 'bg-primary-50/30 hover:bg-primary-50/60'
                    }
                  >
                    <td
                      tabIndex={0}
                      data-table-row={i}
                      data-table-col={0}
                      onClick={() => requestEditSale(r.sale, r.lineIndex)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          requestEditSale(r.sale, r.lineIndex);
                          return;
                        }
                        handleGridKeyDown(e, 0);
                      }}
                      className="px-1.5 py-1 text-primary-500 outline-none cursor-pointer text-center"
                    >
                      {r.serial}
                    </td>
                    <td
                      tabIndex={0}
                      data-table-row={i}
                      data-table-col={1}
                      onClick={() => requestEditSale(r.sale, r.lineIndex)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          requestEditSale(r.sale, r.lineIndex);
                          return;
                        }
                        handleGridKeyDown(e, 1);
                      }}
                      className="px-1.5 py-1 text-primary-700 whitespace-nowrap font-medium outline-none cursor-pointer"
                    >
                      {r.vendor}
                    </td>
                    <td className="px-1 py-0.5">
                      <select
                        data-table-row={i}
                        data-table-col={2}
                        onMouseDown={(e) => {
                          if (!editAuthorized) {
                            e.preventDefault();
                            requestEditSale(r.sale, r.lineIndex, true, { row: i, col: 2 });
                          }
                        }}
                        onFocus={() => {
                          if (editAuthorized) {
                            cancelEditRef.current = false;
                            originalCellRef.current = {
                              row: i,
                              col: 2,
                              val: r.line?.material?._id || r.line?.material || r.materialId
                            };
                            if (!r.isLiveEditing) fillFromSale(r.sale, r.lineIndex);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEditRef.current = true;
                            const orig = originalCellRef.current?.val ?? (r.line?.material?._id || r.line?.material || r.materialId);
                            e.currentTarget.value = orig;
                            if (r.isLiveEditing) setMaterialId(orig);
                            pendingFocusCell.current = { row: i, col: 2 };
                            e.currentTarget.focus();
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            cancelEditRef.current = false;
                            const matId = e.currentTarget.value;
                            const dbMatId = r.line?.material?._id || r.line?.material || r.materialId;
                            if (originalCellRef.current) {
                              originalCellRef.current.val = matId;
                            }
                            if (matId && matId !== dbMatId) {
                              commitCellEdit(r, { materialId: matId });
                            }
                            pendingFocusCell.current = { row: i, col: 2 };
                            e.currentTarget.focus();
                            return;
                          }
                          handleGridKeyDown(e, 2);
                        }}
                        onBlur={(e) => {
                          if (!editAuthorized) return;
                          // If blurred without pressing Enter or if cancelled, revert value
                          const orig = originalCellRef.current?.val ?? (r.line?.material?._id || r.line?.material || r.materialId);
                          if (e.target.value !== orig) {
                            e.target.value = orig;
                            if (r.isLiveEditing) setMaterialId(orig);
                          }
                          cancelEditRef.current = false;
                        }}
                        className={`${cell} font-medium text-primary-700 text-xs cursor-pointer`}
                        value={r.isLiveEditing ? materialId : r.materialId}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!editAuthorized) {
                            e.target.value = r.materialId;
                            requestEditSale(r.sale, r.lineIndex, true, { row: i, col: 2 });
                            return;
                          }
                          if (r.isLiveEditing) {
                            setMaterialId(val);
                          }
                        }}
                      >
                        {r.materialId && !materials.some((m) => m._id === r.materialId) ? (
                          <option value={r.materialId}>{r.item}</option>
                        ) : null}
                        {materials.map((m) => (
                          <option key={m._id} value={m._id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-0.5">
                      <select
                        data-table-row={i}
                        data-table-col={3}
                        onMouseDown={(e) => {
                          if (!editAuthorized) {
                            e.preventDefault();
                            requestEditSale(r.sale, r.lineIndex, true, { row: i, col: 3 });
                          }
                        }}
                        onFocus={() => {
                          if (editAuthorized) {
                            cancelEditRef.current = false;
                            originalCellRef.current = {
                              row: i,
                              col: 3,
                              val: r.sale?.customer?._id || r.sale?.customer || r.customerId
                            };
                            if (!r.isLiveEditing) fillFromSale(r.sale, r.lineIndex);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEditRef.current = true;
                            const orig = originalCellRef.current?.val ?? (r.sale?.customer?._id || r.sale?.customer || r.customerId);
                            e.currentTarget.value = orig;
                            if (r.isLiveEditing) {
                              setCustomerId(orig);
                              const match = customers.find((c) => c._id === orig);
                              if (match) setNameQuery(match.name);
                            }
                            pendingFocusCell.current = { row: i, col: 3 };
                            e.currentTarget.focus();
                            return;
                          }
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            cancelEditRef.current = false;
                            const custId = e.currentTarget.value;
                            const dbCustId = r.sale?.customer?._id || r.sale?.customer || r.customerId;
                            if (originalCellRef.current) {
                              originalCellRef.current.val = custId;
                            }
                            if (custId && custId !== dbCustId) {
                              commitCellEdit(r, { customerId: custId });
                            }
                            pendingFocusCell.current = { row: i, col: 3 };
                            e.currentTarget.focus();
                            return;
                          }
                          handleGridKeyDown(e, 3);
                        }}
                        onBlur={(e) => {
                          if (!editAuthorized) return;
                          // If blurred without pressing Enter or if cancelled, revert value
                          const orig = originalCellRef.current?.val ?? (r.sale?.customer?._id || r.sale?.customer || r.customerId);
                          if (e.target.value !== orig) {
                            e.target.value = orig;
                            if (r.isLiveEditing) {
                              setCustomerId(orig);
                              const match = customers.find((c) => c._id === orig);
                              if (match) setNameQuery(match.name);
                            }
                          }
                          cancelEditRef.current = false;
                        }}
                        className={`${cell} text-primary-700 text-xs cursor-pointer`}
                        value={r.isLiveEditing ? customerId : r.customerId}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!editAuthorized) {
                            e.target.value = r.customerId;
                            requestEditSale(r.sale, r.lineIndex, true, { row: i, col: 3 });
                            return;
                          }
                          if (r.isLiveEditing) {
                            setCustomerId(val);
                            const match = customers.find((c) => c._id === val);
                            if (match) setNameQuery(match.name);
                          }
                        }}
                      >
                        {r.customerId && !customers.some((c) => c._id === r.customerId) && r.customerId !== 'cash' ? (
                          <option value={r.customerId}>{r.name}</option>
                        ) : null}
                        <option value="cash">Cash (నగదు)</option>
                        {customers.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td
                      tabIndex={0}
                      data-table-row={i}
                      data-table-col={4}
                      onClick={() => requestEditSale(r.sale, r.lineIndex)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          requestEditSale(r.sale, r.lineIndex);
                          return;
                        }
                        handleGridKeyDown(e, 4);
                      }}
                      className="px-1.5 py-1 text-right tabular-nums font-semibold text-primary-700 whitespace-nowrap outline-none cursor-pointer w-12"
                    >
                      {r.isLiveEditing
                        ? (r.isByBag ? directBagCount || '0' : (bagCount != null && bagCount !== '' ? String(bagCount) : '0'))
                        : (r.bags != null ? String(r.bags) : '0')}
                    </td>
                    <td
                      tabIndex={0}
                      data-table-row={i}
                      data-table-col={5}
                      onClick={() => requestEditSale(r.sale, r.lineIndex)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          requestEditSale(r.sale, r.lineIndex);
                          return;
                        }
                        handleGridKeyDown(e, 5);
                      }}
                      className="px-1.5 py-1 text-right tabular-nums font-semibold text-primary-700 whitespace-nowrap outline-none cursor-pointer w-14"
                    >
                      {r.isByBag ? (
                        <span className="text-primary-400 font-medium">—</span>
                      ) : (
                        r.isLiveEditing
                          ? (qty ? Number(qty).toFixed(1) : '—')
                          : (r.qty != null && Number(r.qty) > 0 ? Number(r.qty).toFixed(1) : '—')
                      )}
                    </td>
                    <td className="px-1 py-0.5 w-14">
                      <div className="flex flex-col items-end">
                        <input
                          data-table-row={i}
                          data-table-col={6}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          value={r.isLiveEditing ? rate : (r.rate != null ? String(r.rate) : '')}
                          className={`${cell} text-right font-semibold`}
                          onMouseDown={(e) => {
                            if (!editAuthorized) {
                              e.preventDefault();
                              requestEditSale(r.sale, r.lineIndex, true, { row: i, col: 6 });
                            }
                          }}
                          onFocus={(e) => {
                            if (!editAuthorized) {
                              e.target.blur();
                              requestEditSale(r.sale, r.lineIndex, true, { row: i, col: 6 });
                            } else {
                              cancelEditRef.current = false;
                              const origVal = r.line?.ratePerKg != null ? String(r.line.ratePerKg) : (r.rate != null ? String(r.rate) : '');
                              originalCellRef.current = {
                                row: i,
                                col: 6,
                                val: origVal
                              };
                              if (!r.isLiveEditing) fillFromSale(r.sale, r.lineIndex);
                              if (typeof e.target.select === 'function') {
                                setTimeout(() => {
                                  try { e.target.select(); } catch (_) {}
                                }, 0);
                              }
                            }
                          }}
                          onChange={(e) => {
                            if (!editAuthorized) return;
                            const val = e.target.value.replace(/[^\d.]/g, '');
                            if (r.isLiveEditing) {
                              setRate(val);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              e.stopPropagation();
                              cancelEditRef.current = true;
                              const orig = originalCellRef.current?.val ?? (r.line?.ratePerKg != null ? String(r.line.ratePerKg) : (r.rate != null ? String(r.rate) : ''));
                              e.currentTarget.value = orig;
                              if (r.isLiveEditing) {
                                setRate(orig);
                              }
                              pendingFocusCell.current = { row: i, col: 6 };
                              e.currentTarget.focus();
                              if (typeof e.currentTarget.select === 'function') e.currentTarget.select();
                              return;
                            }
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              cancelEditRef.current = false;
                              const rateVal = Number(e.currentTarget.value);
                              const dbRate = Number(r.line?.ratePerKg != null ? r.line.ratePerKg : r.rate);
                              if (originalCellRef.current) {
                                originalCellRef.current.val = String(rateVal);
                              }
                              if (!isNaN(rateVal) && rateVal >= 0 && rateVal !== dbRate) {
                                commitCellEdit(r, { rate: rateVal });
                              }
                              pendingFocusCell.current = { row: i, col: 6 };
                              e.currentTarget.focus();
                              if (typeof e.currentTarget.select === 'function') {
                                e.currentTarget.select();
                              }
                              return;
                            }
                            handleGridKeyDown(e, 6);
                          }}
                          onBlur={(e) => {
                            if (!editAuthorized) return;
                            // If blurred without pressing Enter or if cancelled, revert value
                            const orig = originalCellRef.current?.val ?? (r.line?.ratePerKg != null ? String(r.line.ratePerKg) : (r.rate != null ? String(r.rate) : ''));
                            if (e.target.value !== orig) {
                              e.target.value = orig;
                              if (r.isLiveEditing) {
                                setRate(orig);
                              }
                            }
                            cancelEditRef.current = false;
                          }}
                        />
                        {r.isByBag && (
                          <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent-100 text-accent-800 border border-accent-200/80 leading-none mt-0.5 whitespace-nowrap shadow-2xs">
                            per bag
                          </span>
                        )}
                      </div>
                    </td>
                    <td
                      tabIndex={0}
                      data-table-row={i}
                      data-table-col={7}
                      onClick={() => requestEditSale(r.sale, r.lineIndex)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          requestEditSale(r.sale, r.lineIndex);
                          return;
                        }
                        handleGridKeyDown(e, 7);
                      }}
                      className="px-1 py-1 text-right tabular-nums font-medium text-primary-700 whitespace-nowrap outline-none cursor-pointer w-14"
                    >
                      {r.cooly ? formatCurrency(r.cooly) : '—'}
                    </td>
                    <td
                      tabIndex={0}
                      data-table-row={i}
                      data-table-col={8}
                      onClick={() => requestEditSale(r.sale, r.lineIndex)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          requestEditSale(r.sale, r.lineIndex);
                          return;
                        }
                        handleGridKeyDown(e, 8);
                      }}
                      className="px-1.5 py-1 text-right tabular-nums font-medium text-primary-800 outline-none cursor-pointer w-18"
                    >
                      {formatCurrency(r.amount)}
                    </td>
                    <td
                      tabIndex={0}
                      data-table-row={i}
                      data-table-col={9}
                      onClick={() => requestEditSale(r.sale, r.lineIndex)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          requestEditSale(r.sale, r.lineIndex);
                          return;
                        }
                        handleGridKeyDown(e, 9);
                      }}
                      className="px-1.5 py-1 text-[10px] text-primary-500 whitespace-nowrap text-right tabular-nums leading-tight outline-none cursor-pointer w-28"
                    >
                      {(() => {
                        const { dateStr, timeStr } = formatDateTimeSplit(r.createdAt);
                        return (
                          <>
                            <div>{dateStr}</div>
                            {timeStr && <div className="text-[11px] text-primary-400">{timeStr}</div>}
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-1 py-0.5 text-center whitespace-nowrap w-14" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            requestEditSale(r.sale, r.lineIndex);
                          }}
                          title="Edit sales entry in form"
                          className="p-1 rounded text-primary-600 hover:text-primary-800 hover:bg-primary-100 transition cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteSale(r);
                          }}
                          title="Delete sales entry"
                          className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 bg-accent-200">
            <tr className="bg-accent-200 text-accent-900 font-bold">
              <td colSpan={4} className="bg-accent-200 px-2 py-1.5 text-right font-bold text-accent-900 uppercase tracking-wide">
                Total
              </td>
              <td className="bg-accent-200 px-1 py-1.5 text-right tabular-nums font-bold text-accent-900 w-12">
                {totals.bags}
              </td>
              <td className="bg-accent-200 px-1 py-1.5 text-right tabular-nums font-bold text-accent-900 w-14">
                {totals.qty.toFixed(1)}
              </td>
              <td className="bg-accent-200 px-1 py-1.5 text-right text-accent-600 font-medium w-14">—</td>
              <td className="bg-accent-200 px-1 py-1.5 text-right text-accent-600 font-medium w-14">—</td>
              <td className="bg-accent-200 px-1.5 py-1.5 text-right tabular-nums font-bold text-accent-900 w-18">
                {formatCurrency(totals.amount)}
              </td>
              <td className="bg-accent-200 px-1.5 py-1.5 w-28"></td>
              <td className="bg-accent-200 px-1 py-1.5 w-14"></td>
            </tr>
          </tfoot>
        </table>
        </div>

        {/* Lightweight status strip matching table */}
        <div className="flex items-center justify-between px-3 py-1 bg-surface border-t border-primary-100 text-[11px] text-primary-400 shrink-0">
          <span>Enter to save • Esc to cancel • Arrow keys to navigate</span>
          <span className="font-medium text-primary-500">
            {displayedRows.length} {displayedRows.length === 1 ? 'sale' : 'sales'}
          </span>
        </div>
      </div>
      </div>

      {showAuthModal && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="card w-full max-w-md space-y-4 shadow-2xl border-2 border-primary-200">
            <div className="flex items-center justify-between border-b border-primary-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-100 text-amber-800 rounded-xl">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-primary-800">Admin Authorization Required</h2>
                  <p className="text-xs text-primary-500">Enter password to edit sales entry</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAuthModal(false);
                  setPendingEditSale(null);
                  setAuthError('');
                }}
                className="p-1.5 rounded-lg hover:bg-primary-50 text-primary-400 hover:text-primary-600 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVerifyPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-primary-600 mb-1">Admin Password *</label>
                <div className="relative">
                  <input
                    type={showAdminPassword ? 'text' : 'password'}
                    className={`w-full rounded-xl border bg-surface px-3 py-2 pr-10 text-sm text-primary-800 focus:outline-none focus:ring-2 transition ${
                      authError
                        ? 'border-red-400 focus:border-red-500 focus:ring-red-100'
                        : 'border-primary-200 focus:border-primary-400 focus:ring-primary-100'
                    }`}
                    placeholder="Enter admin password..."
                    value={adminPasswordInput}
                    onChange={(e) => { setAdminPasswordInput(e.target.value); if (authError) setAuthError(''); }}
                    autoFocus
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600"
                  >
                    {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {authError && (
                  <p className="mt-1.5 text-xs font-medium text-red-600 flex items-center gap-1">
                    <X className="w-3.5 h-3.5 shrink-0" />
                    {authError}
                  </p>
                )}
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowAuthModal(false);
                    setPendingEditSale(null);
                    setAuthError('');
                  }}
                  className="btn-secondary flex-1 !py-2 !text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifyingPassword}
                  className="btn-primary flex-1 !py-2 !text-sm disabled:opacity-50"
                >
                  {verifyingPassword ? 'Verifying...' : 'Unlock & Edit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
