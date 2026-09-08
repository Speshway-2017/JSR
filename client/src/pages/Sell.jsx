import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDate, formatDateTimeSplit } from '../utils/format';
import { openBillPreviewTab, openRangeBillsNUp } from '../utils/rangeBillPrint';
import { matchesSearchFields, searchAndSortItems } from '../utils/search';
import { useDataRestored } from '../utils/useDataRestored';
import { useMDI } from '../context/MDIContext';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function appliedCooly(rate, bags, perBag) {
  const r = Number(rate) || 0;
  const b = Number(bags) || 0;
  return perBag ? Number((r * b).toFixed(2)) : r;
}

export default function Sell({ path: windowPath }) {
  const { openWindow } = useMDI();
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
  const [editingSaleId, setEditingSaleId] = useState(initialSaleId);
  const [focusSaleId, setFocusSaleId] = useState(initialSaleId);

  useEffect(() => {
    const pDate = effectiveSearchParams.get('date');
    const pSaleId = effectiveSearchParams.get('saleId') || effectiveSearchParams.get('highlightSaleId');
    const pCustId = effectiveSearchParams.get('customerId');
    const pVendId = effectiveSearchParams.get('vendorId');

    if (pDate && pDate !== date) setDate(pDate);
    if (pSaleId) {
      setFocusSaleId(pSaleId);
      setEditingSaleId(pSaleId);
    }
    if (pCustId) setFilterCustomer(pCustId);
    if (pVendId) setFilterVendor(pVendId);
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

  const nameRef = useRef(null);
  const bagInputRefs = useRef({});
  const rateRef = useRef(null);
  const coolyRef = useRef(null);

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
    if (!nameQuery.trim()) return [];
    return searchAndSortItems(customers, ['name', 'nameTelugu', 'mobile'], nameQuery).slice(0, 8);
  }, [customers, nameQuery]);

  const flatRows = useMemo(() => {
    const rows = [];
    for (const sale of sales) {
      for (const line of sale.lines || []) {
        const isByBag =
          line.saleType === 'by_bag' ||
          (line.bagCount > 0 && (!line.bags || line.bags.length === 0) && Number(line.totalKg) === 0);
        rows.push({
          saleId: sale._id,
          lineIndex: sale.lines.indexOf(line),
          serial: sale.serialNo != null ? sale.serialNo : rows.length + 1,
          item: line.materialName,
          materialId: line.material?._id || line.material || '',
          name: sale.customer?.name || '—',
          customerId: sale.customer?._id || sale.customer || '',
          vendor: sale.vendor?.name || '—',
          vendorId: sale.vendor?._id || sale.vendor || '',
          bags: line.bagCount,
          qty: line.totalKg,
          rate: line.ratePerKg,
          isByBag,
          cooly: sale.handlingCharges || 0,
          coolyRate: sale.coolyRate != null ? sale.coolyRate : sale.handlingCharges || 0,
          coolyPerBag: !!sale.coolyPerBag,
          amount: Number(line.totalAmount || 0) + (sale.handlingCharges || 0),
          createdAt: sale.createdAt,
          sale,
          line,
        });
      }
    }
    return rows;
  }, [sales]);

  const availableCustomers = useMemo(() => {
    const map = new Map();
    for (const r of flatRows) {
      if (r.customerId && !map.has(r.customerId)) {
        const fullObj = customers.find((c) => c._id === r.customerId);
        map.set(r.customerId, {
          _id: r.customerId,
          name: r.name,
          nameTelugu: fullObj?.nameTelugu || '',
        });
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

  const handleGridKeyDown = (e, rowIdx, colIdx) => {
    const { key } = e;
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return;

    let targetRow = rowIdx;
    let targetCol = colIdx;

    if (key === 'ArrowDown') {
      targetRow = rowIdx + 1;
    } else if (key === 'ArrowUp') {
      targetRow = rowIdx - 1;
    } else if (key === 'ArrowRight') {
      targetCol = colIdx + 1;
    } else if (key === 'ArrowLeft') {
      targetCol = colIdx - 1;
    }

    const targetEl = document.querySelector(`[data-table-row="${targetRow}"][data-table-col="${targetCol}"]`);
    if (targetEl) {
      e.preventDefault();
      targetEl.focus();
      if (typeof targetEl.select === 'function') {
        setTimeout(() => {
          try { targetEl.select(); } catch (_) {}
        }, 0);
      }
    } else if (key === 'ArrowDown' || key === 'ArrowUp') {
      const rowCells = document.querySelectorAll(`[data-table-row="${targetRow}"]`);
      if (rowCells.length > 0) {
        e.preventDefault();
        const closestCell = Array.from(rowCells).reduce((prev, curr) => {
          const prevCol = parseInt(prev.getAttribute('data-table-col') || '0', 10);
          const currCol = parseInt(curr.getAttribute('data-table-col') || '0', 10);
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

  const loadDaySales = async () => {
    if (!date) return;
    const res = await api.get('/sales', { params: { date } });
    setSales(res.data);
    return res.data;
  };

  const fillFromSale = (sale) => {
    fillingRef.current = true;
    const line = (sale.lines || [])[0];
    const cust = sale.customer;
    setEditingSaleId(sale._id);
    setFocusSaleId(sale._id);
    setVendorId(sale.vendor?._id || sale.vendor || '');
    if (cust) {
      setCustomerId(cust._id);
      setNameQuery(cust.name || '');
      setCoolyOn(!!sale.handlingCharges || Number(sale.coolyRate) > 0);
    }
    if (line) {
      setMaterialId(line.material?._id || line.material || '');
      setRate(String(line.ratePerKg ?? ''));
      const lineIsByBag =
        line.saleType === 'by_bag' ||
        (line.bagCount > 0 && (!line.bags || line.bags.length === 0) && Number(line.totalKg) === 0);
      setSaleType(lineIsByBag ? 'by_bag' : 'by_weight');
      if (lineIsByBag) {
        setDirectBagCount(String(line.bagCount || ''));
        setBagWeights(['']);
      } else {
        const bags = (line.bags || []).map((b) => String(b.kgs ?? ''));
        setBagWeights(bags.length ? bags : ['']);
        setDirectBagCount('');
      }
    }
    setCoolyPerBag(!!sale.coolyPerBag);
    setCooly(String(sale.coolyRate != null && sale.coolyRate !== '' ? sale.coolyRate : sale.handlingCharges || 0));
    setTimeout(() => {
      fillingRef.current = false;
    }, 0);
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
    loadDaySales().catch(() => setSales([]));
    if (date) {
      window.dispatchEvent(new CustomEvent('jsr_sales_date_changed', { detail: { date } }));
    }
  }, [date]);

  useEffect(() => {
    if (queryApplied.current) return;
    if (!customers.length) return;
    const qSale = searchParams.get('saleId');
    const qCust = searchParams.get('customerId');
    if (qSale) {
      const sale = sales.find((s) => s._id === qSale);
      if (sale) {
        fillFromSale(sale);
        queryApplied.current = true;
        return;
      }
      if (fetchingSale.current) return;
      fetchingSale.current = true;
      api
        .get(`/sales/${qSale}`)
        .then((res) => {
          fillFromSale(res.data);
          const d = new Date(res.data.createdAt).toISOString().slice(0, 10);
          setDate(d);
        })
        .catch(() => {})
        .finally(() => {
          queryApplied.current = true;
        });
      return;
    }
    if (qCust) {
      const c = customers.find((x) => x._id === qCust);
      if (c) {
        setCustomerId(c._id);
        setNameQuery(c.name);
        const hasCooly = !!c.handlingCharges;
        setCoolyOn(hasCooly);
        if (hasCooly) {
          setCooly((prev) => (!prev || prev === '0' ? salesCoolyRate : prev));
        }
      }
      queryApplied.current = true;
    }
  }, [sales, customers, searchParams, salesCoolyRate]);

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
    if (fillingRef.current) return;
    if (material) {
      const p = Number(material.sellingPricePerKg) || 0;
      setRate(p > 0 ? String(p) : '');
    } else {
      setRate('');
    }
  }, [materialId, material]);

  useEffect(() => {
    if (fillingRef.current) return;
    const hasCooly = customerCoolyDefault;
    setCoolyOn(hasCooly);
    if (hasCooly) {
      setCooly((prev) => (!prev || prev === '0' ? salesCoolyRate : prev));
    } else {
      setCooly('0');
    }
  }, [customerId, customerCoolyDefault, salesCoolyRate]);

  useEffect(() => {
    if (fillingRef.current) return;
    if (coolyOn) {
      setCooly(salesCoolyRate);
    }
  }, [saleType, salesCoolyRate]);

  useEffect(() => {
    if (focusBagIdx == null) return;
    const el = bagInputRefs.current[focusBagIdx];
    if (el) {
      el.focus();
      setFocusBagIdx(null);
    }
  }, [bagWeights, focusBagIdx]);

  const pickCustomer = (c) => {
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

  const clearEntry = ({ clearFocus = true } = {}) => {
    setEditingSaleId('');
    if (clearFocus) {
      setFocusSaleId('');
    }
    setCustomerId('');
    setNameQuery('');
    setBagWeights(['']);
    setCooly('0');
    setCoolyOn(false);
    setCoolyPerBag(true);
    setDetail('');
    if (material) {
      const p = Number(material.sellingPricePerKg) || 0;
      setRate(p > 0 ? String(p) : '');
    } else {
      setRate('');
    }
    nameRef.current?.focus();
    if (searchParams.get('saleId') || searchParams.get('customerId')) {
      setSearchParams({}, { replace: true });
    }
  };

  const updateBag = (idx, value) => {
    const next = [...bagWeights];
    next[idx] = value;
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
    if (!customerId) {
      toast.error('Type and select a customer');
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

    setSaving(true);
    try {
      const payload = {
        customerId,
        vendorId,
        date,
        handlingCharges: coolyOn ? coolyApplied : 0,
        coolyRate: coolyOn ? Number(cooly) || 0 : 0,
        coolyPerBag: coolyOn ? coolyPerBag : false,
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
      } else {
        const res = await api.post('/sales', payload);
        savedSaleId = res.data?._id;
        toast.success('Saved');
      }
      clearEntry({ clearFocus: false });
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
      api.get('/customers').then((r) => setCustomers(r.data));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sale failed');
    } finally {
      setSaving(false);
    }
  };

  const persistTableRow = async (row, patch) => {
    const sale = row.sale;
    const customerIdNext = patch.customerId || sale.customer?._id || sale.customer;
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
        } else {
          const qty = patch.qty !== undefined ? Number(patch.qty) : Number(l.totalKg);
          if (!qty || qty <= 0) throw new Error('Enter quantity (kg)');
          base.totalKg = qty;
          base.bagCount = bags;
        }
        delete base.bags;
      }
      return base;
    });

    setSavingRowId(row.saleId);
    try {
      await api.put(`/sales/${sale._id}`, {
        customerId: customerIdNext,
        vendorId: vendorIdNext,
        date,
        handlingCharges: coolyRateNext,
        coolyRate: coolyRateNext,
        coolyPerBag: coolyPerBagNext,
        lines,
      });
      await loadDaySales();
      window.dispatchEvent(new CustomEvent('jsr_data_updated'));
      setFocusSaleId(sale._id);
      api.get('/customers').then((r) => setCustomers(r.data));
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update');
      await loadDaySales();
    } finally {
      setSavingRowId('');
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
      if (suggestOpen && suggestions.length) {
        e.preventDefault();
        const pick = highlight >= 0 ? suggestions[highlight] : suggestions[0];
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
        return {
          ...st,
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

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2 min-h-full overflow-y-auto">
      <div className="shrink-0">
        <h1 className="page-title">Sales Entry</h1>
        <p className="text-primary-400 text-sm mt-0.5">
          {editingSaleId
            ? 'Editing a sale from this date — change bags, rate, or customer, then save'
            : 'Select product, vendor & date — then enter customers one by one'}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0 overflow-hidden">
      <form
        onSubmit={handleSave}
        className="card border-2 border-primary-200 w-full lg:w-[26rem] xl:w-[28rem] shrink-0 min-h-0 max-h-[48vh] lg:max-h-full h-full flex flex-col overflow-hidden !p-4"
      >
        <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-0.5">
        <div className="flex items-center gap-3 bg-primary-50/70 px-2.5 py-1.5 rounded-xl border border-primary-100 mb-0.5">
          <span className="text-[11px] font-semibold text-primary-600 shrink-0">Sale Type:</span>
          <label className="inline-flex items-center gap-1 text-[11px] text-primary-700 font-medium cursor-pointer">
            <input
              type="radio"
              name="saleType"
              value="by_weight"
              checked={saleType === 'by_weight'}
              onChange={() => setSaleType('by_weight')}
            />
            By Weight (kg)
          </label>
          <label className="inline-flex items-center gap-1 text-[11px] text-primary-700 font-medium cursor-pointer">
            <input
              type="radio"
              name="saleType"
              value="by_bag"
              checked={saleType === 'by_bag'}
              onChange={() => setSaleType('by_bag')}
            />
            By Bag (Fixed Rate)
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-xs font-semibold text-primary-600 mb-1">Serial</label>
            <input className="w-full rounded-xl border border-primary-200 bg-primary-50 px-3 py-1.5 text-sm text-primary-700 font-semibold focus:outline-none" value={nextSerial} readOnly />
          </div>
          <div>
            <label className="block text-xs font-semibold text-primary-600 mb-1">Date *</label>
            <input
              type="date"
              className="w-full rounded-xl border border-primary-200 bg-surface px-3 py-1.5 text-sm text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-primary-600 mb-1">Product *</label>
            <select
              className="w-full rounded-xl border border-primary-200 bg-surface px-3 py-1.5 text-sm text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              required
            >
              <option value="">Select product...</option>
              {materials.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                  {m.nameTelugu ? ` · ${m.nameTelugu}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-primary-600 mb-1">Vendor *</label>
            <select
              className="w-full rounded-xl border border-primary-200 bg-surface px-3 py-1.5 text-sm text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              required
            >
              <option value="">
                {vendors.length ? 'Select vendor...' : 'No vendors yet'}
              </option>
              {vendors.map((v) => (
                <option key={v._id} value={v._id}>
                  {v.name}
                  {v.city ? ` · ${v.city}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2.5 border-t border-primary-100 pt-2.5">
          <div className="relative">
            <label className="block text-xs font-semibold text-primary-600 mb-1">Name *</label>
            <input
              ref={nameRef}
              className="w-full rounded-xl border border-primary-200 bg-surface px-3 py-1.5 text-sm text-primary-700 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
              value={nameQuery}
              onChange={(e) => {
                const val = e.target.value;
                setNameQuery(val);
                const match = customers.find(
                  (c) => c.name.trim().toLowerCase() === val.trim().toLowerCase()
                );
                if (match) {
                  setCustomerId(match._id);
                  const hasCooly = !!match.handlingCharges;
                  setCoolyOn(hasCooly);
                  if (hasCooly) {
                    setCooly((prev) => (!prev || prev === '0' ? salesCoolyRate : prev));
                  }
                } else {
                  setCustomerId('');
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
                className="absolute z-20 mt-1 w-full max-h-40 overflow-auto rounded-xl border border-primary-200 bg-surface shadow-card"
              >
                {suggestions.map((c, i) => (
                  <li key={c._id}>
                    <button
                      type="button"
                      data-idx={i}
                      className={`w-full text-left px-3 py-1.5 text-xs ${
                        i === highlight ? 'bg-primary-100 text-primary-800' : 'hover:bg-primary-50'
                      }`}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        pickCustomer(c);
                      }}
                    >
                      {c.name}
                      {c.nameTelugu ? (
                        <span className="block text-[11px] text-primary-400">{c.nameTelugu}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-primary-600 mb-1">{isByBag ? 'Bags *' : 'Bags'}</label>
              {isByBag ? (
                <input
                  type="text"
                  inputMode="numeric"
                  className="w-full rounded-xl border border-primary-200 bg-surface px-3 py-1.5 text-sm text-primary-700 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
                  placeholder="Bags"
                  value={directBagCount}
                  onChange={(e) => setDirectBagCount(e.target.value.replace(/[^\d]/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      rateRef.current?.focus();
                    }
                  }}
                />
              ) : (
                <input className="w-full rounded-xl border border-primary-200 bg-primary-50 px-3 py-1.5 text-sm text-primary-700 focus:outline-none" value={bagCount || ''} readOnly />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-primary-600 mb-1">Qty (kg)</label>
              <input
                className="w-full rounded-xl border border-primary-200 bg-primary-50 px-3 py-1.5 text-sm text-primary-700 focus:outline-none"
                value={isByBag ? '—' : qty ? qty.toFixed(1) : ''}
                readOnly
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-primary-600 mb-1">{isByBag ? 'Rate/bag *' : 'Rate/kg *'}</label>
              <input
                ref={rateRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="w-full rounded-xl border border-primary-200 bg-surface px-3 py-1.5 text-sm text-primary-700 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
                value={rate}
                onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (coolyOn) coolyRef.current?.focus();
                  else handleSave();
                }}
              />
            </div>
          </div>
        </div>

        {!isByBag && (
          <div>
            <label className="block text-xs font-semibold text-primary-600 mb-1">Bag weights (kg) *</label>
            <p className="text-[11px] text-primary-400 mb-1.5">
              Type weight and press Enter for the next bag — empty Enter moves to Rate
            </p>
            <div className="flex flex-wrap gap-1.5">
              {bagWeights.map((bag, idx) => (
                <input
                  key={idx}
                  ref={(el) => {
                    bagInputRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  className="w-20 rounded-lg border border-primary-200 bg-surface px-2 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
                  placeholder={`Bag ${idx + 1}`}
                  value={bag}
                  onChange={(e) => updateBag(idx, e.target.value.replace(/[^\d.]/g, ''))}
                  onKeyDown={(e) => handleBagEnter(e, idx)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-xs font-semibold text-primary-600 mb-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
              <span className="inline-flex items-center gap-1">
                Cooly
                <input
                  type="checkbox"
                  checked={coolyOn}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setCoolyOn(checked);
                    if (checked) {
                      setCooly((prev) => (!prev || prev === '0' ? salesCoolyRate : prev));
                    } else {
                      setCooly('0');
                    }
                  }}
                />
              </span>
              <span className="inline-flex items-center gap-1 font-normal text-primary-500">
                Per bag
                <input
                  type="checkbox"
                  checked={coolyPerBag}
                  disabled={!coolyOn}
                  onChange={(e) => setCoolyPerBag(e.target.checked)}
                />
              </span>
            </label>
            <input
              ref={coolyRef}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className="w-full rounded-xl border border-primary-200 bg-surface px-3 py-1.5 text-sm text-primary-700 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
              value={cooly}
              disabled={!coolyOn}
              onChange={(e) => setCooly(e.target.value.replace(/[^\d.]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
            <p className="text-[10px] text-primary-400 mt-0.5">
              {!coolyOn
                ? customerCoolyDefault
                  ? 'Customer default is cooly on — uncheck to skip'
                  : 'Customer default is no cooly — tick to add'
                : coolyPerBag
                  ? `Per bag · ${formatCurrency(Number(cooly) || 0)} × ${bagCount} = ${formatCurrency(coolyApplied)}`
                  : `Overall · ${formatCurrency(coolyApplied)}`}
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-primary-600 mb-1">Amount</label>
            <input
              className="w-full rounded-xl border border-primary-200 bg-accent-100 px-3 py-1.5 text-sm font-semibold text-accent-700 focus:outline-none"
              value={amount ? formatCurrency(amount) : ''}
              readOnly
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-primary-600 mb-1">Detail</label>
            <input
              className="w-full rounded-xl border border-primary-200 bg-surface px-3 py-1.5 text-sm text-primary-700 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 transition"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Optional note"
            />
          </div>
        </div>

        </div>
        <div className="flex flex-wrap gap-2 justify-center pt-2.5 mt-2 border-t border-primary-100 shrink-0">
          <button type="submit" className="btn-primary !py-1.5 !px-4 !text-sm min-w-[100px]" disabled={saving}>
            {saving ? 'Saving...' : editingSaleId ? 'Update' : 'Save'}
          </button>
          <button type="button" className="btn-secondary !py-1.5 !px-4 !text-sm min-w-[100px]" onClick={clearEntry}>
            {editingSaleId ? 'Cancel edit' : 'Clear'}
          </button>
        </div>
      </form>

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
        <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-accent-200 text-accent-800 text-left">
              <th className="px-3 py-2.5 font-semibold">
                <SortLabel column="serial">S No</SortLabel>
              </th>
              <th className="px-3 py-2.5 font-semibold">
                <SortLabel column="vendor">Vendor</SortLabel>
              </th>
              <th className="px-3 py-2.5 font-semibold">
                <SortLabel column="item">Item</SortLabel>
              </th>
              <th className="px-3 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold text-right">Bags</th>
              <th className="px-3 py-2.5 font-semibold text-right">Qty</th>
              <th className="px-3 py-2.5 font-semibold text-right">Rate</th>
              <th className="px-3 py-2.5 font-semibold text-right">Cooly</th>
              <th className="px-3 py-2.5 font-semibold text-right">Amount</th>
              <th className="px-3 py-2 font-semibold text-right leading-tight whitespace-nowrap">
                <SortLabel column="createdAt" align="right">
                  <span>Entry Date Time</span>
                </SortLabel>
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-primary-400">
                  {flatRows.length && hasActiveFilters
                    ? 'No sales match the selected filters'
                    : `No sales for this date yet`}
                </td>
              </tr>
            ) : (
              displayedRows.map((r, i) => {
                const busy = savingRowId === r.saleId;
                const cell =
                  'w-full bg-transparent rounded-lg border border-transparent hover:border-primary-200 focus:border-primary-400 focus:bg-surface outline-none px-1.5 py-1 disabled:opacity-60';

                const handleGridKeyDown = (e, colIdx) => {
                  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                    return;
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
                  const selector = `[data-table-row="${targetRow}"][data-table-col="${targetCol}"]`;
                  const el = document.querySelector(selector);
                  if (el) {
                    el.focus();
                    if (typeof el.select === 'function') {
                      el.select();
                    }
                  }
                };

                return (
                  <tr
                    key={`${r.saleId}-${r.lineIndex}`}
                    ref={r.saleId === focusSaleId ? focusRowRef : null}
                    className={
                      r.saleId === focusSaleId || r.saleId === editingSaleId
                        ? 'bg-amber-100/90 ring-2 ring-amber-400 font-bold shadow-md transition-all duration-300'
                        : i % 2 === 0
                          ? 'bg-surface'
                          : 'bg-primary-50/40'
                    }
                  >
                    <td
                      tabIndex={0}
                      data-table-row={i}
                      data-table-col={0}
                      onKeyDown={(e) => handleGridKeyDown(e, 0)}
                      className="px-3 py-1.5 text-primary-500 outline-none focus:ring-2 focus:ring-amber-500 rounded cursor-pointer"
                    >
                      {r.serial}
                    </td>
                    <td
                      tabIndex={0}
                      data-table-row={i}
                      data-table-col={1}
                      onKeyDown={(e) => handleGridKeyDown(e, 1)}
                      className="px-3 py-1.5 text-primary-700 whitespace-nowrap font-medium outline-none focus:ring-2 focus:ring-amber-500 rounded cursor-pointer"
                    >
                      {r.vendor}
                    </td>
                    <td className="px-2 py-1.5 min-w-[8rem]">
                      <select
                        data-table-row={i}
                        data-table-col={2}
                        onKeyDown={(e) => handleGridKeyDown(e, 2)}
                        className={`${cell} font-medium text-primary-700`}
                        value={r.materialId}
                        disabled={busy}
                        onChange={(e) => {
                          const materialId = e.target.value;
                          if (materialId === r.materialId) return;
                          persistTableRow(r, { materialId });
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
                    <td className="px-2 py-1.5 min-w-[9rem]">
                      <select
                        data-table-row={i}
                        data-table-col={3}
                        onKeyDown={(e) => handleGridKeyDown(e, 3)}
                        className={`${cell} text-primary-700`}
                        value={r.customerId}
                        disabled={busy}
                        onChange={(e) => {
                          const customerId = e.target.value;
                          if (customerId === r.customerId) return;
                          persistTableRow(r, { customerId });
                        }}
                      >
                        {r.customerId && !customers.some((c) => c._id === r.customerId) ? (
                          <option value={r.customerId}>{r.name}</option>
                        ) : null}
                        {customers.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 w-20">
                      <input
                        data-table-row={i}
                        data-table-col={4}
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        disabled={busy}
                        defaultValue={r.bags}
                        key={`${r.saleId}-${r.lineIndex}-bags-${r.bags}`}
                        className={`${cell} text-right tabular-nums`}
                        onBlur={(e) => {
                          const bags = Math.floor(Number(e.target.value));
                          if (bags === Number(r.bags)) return;
                          persistTableRow(r, { bags }).catch((err) => toast.error(err.message));
                        }}
                        onKeyDown={(e) => {
                          handleGridKeyDown(e, 4);
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      {r.isByBag ? (
                        <div
                          tabIndex={0}
                          data-table-row={i}
                          data-table-col={5}
                          onKeyDown={(e) => handleGridKeyDown(e, 5)}
                          className="text-right text-primary-400 font-medium py-1 outline-none focus:ring-2 focus:ring-amber-500 rounded cursor-pointer"
                        >
                          —
                        </div>
                      ) : (
                        <input
                          data-table-row={i}
                          data-table-col={5}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          disabled={busy}
                          defaultValue={r.qty != null ? Number(r.qty).toFixed(1) : ''}
                          key={`${r.saleId}-${r.lineIndex}-qty-${r.qty}`}
                          className={`${cell} text-right tabular-nums`}
                          onBlur={(e) => {
                            const qty = Number(e.target.value);
                            if (qty === Number(r.qty)) return;
                            persistTableRow(r, { qty }).catch((err) => toast.error(err.message));
                          }}
                          onKeyDown={(e) => {
                            handleGridKeyDown(e, 5);
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                      )}
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <div className="flex flex-col items-end">
                        <input
                          data-table-row={i}
                          data-table-col={6}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          disabled={busy}
                          defaultValue={r.rate}
                          key={`${r.saleId}-${r.lineIndex}-rate-${r.rate}`}
                          className={`${cell} text-right tabular-nums`}
                          onBlur={(e) => {
                            const rate = Number(e.target.value);
                            if (rate === Number(r.rate)) return;
                            persistTableRow(r, { rate }).catch((err) => toast.error(err.message));
                          }}
                          onKeyDown={(e) => {
                            handleGridKeyDown(e, 6);
                            if (e.key === 'Enter') e.currentTarget.blur();
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
                      onKeyDown={(e) => handleGridKeyDown(e, 7)}
                      className="px-3 py-1.5 text-right tabular-nums font-medium text-primary-700 whitespace-nowrap outline-none focus:ring-2 focus:ring-amber-500 rounded cursor-pointer"
                    >
                      {r.cooly ? formatCurrency(r.cooly) : '—'}
                    </td>
                    <td
                      tabIndex={0}
                      data-table-row={i}
                      data-table-col={8}
                      onKeyDown={(e) => handleGridKeyDown(e, 8)}
                      className="px-3 py-1.5 text-right tabular-nums font-medium text-primary-800 outline-none focus:ring-2 focus:ring-amber-500 rounded cursor-pointer"
                    >
                      {formatCurrency(r.amount)}
                    </td>
                    <td
                      tabIndex={0}
                      data-table-row={i}
                      data-table-col={9}
                      onKeyDown={(e) => handleGridKeyDown(e, 9)}
                      className="px-3 py-1.5 text-xs text-primary-500 whitespace-nowrap text-right tabular-nums leading-tight outline-none focus:ring-2 focus:ring-amber-500 rounded cursor-pointer"
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
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary-100 px-3 py-3 bg-accent-50 shrink-0">
          <p className="text-xs text-primary-400">
            Edit item, name, bags, qty, rate or cooly in the table — Enter or click away to save.
            Cooly is per bag or overall.
          </p>
          <span className="text-sm font-semibold text-primary-600">Total</span>
          <span className="rounded-lg bg-accent-200 px-3 py-1.5 text-sm font-semibold tabular-nums">
            Bags {totals.bags}
          </span>
          <span className="rounded-lg bg-accent-200 px-3 py-1.5 text-sm font-semibold tabular-nums">
            Qty {totals.qty.toFixed(1)}
          </span>
          <span className="rounded-lg bg-accent-200 px-3 py-1.5 text-sm font-semibold tabular-nums">
            {formatCurrency(totals.amount)}
          </span>
        </div>
      </div>
      </div>
    </div>
  );
}
