import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, Printer } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency } from '../utils/format';
import { openBillPreviewTab, openRangeBillsNUp } from '../utils/rangeBillPrint';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function appliedCooly(rate, bags, perBag) {
  const r = Number(rate) || 0;
  const b = Number(bags) || 0;
  return perBag ? Number((r * b).toFixed(2)) : r;
}

export default function Sell() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [date, setDate] = useState(searchParams.get('date') || todayInputValue());
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);
  const [editingSaleId, setEditingSaleId] = useState(searchParams.get('saleId') || '');
  const [focusSaleId, setFocusSaleId] = useState(searchParams.get('saleId') || '');
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

  const [bagWeights, setBagWeights] = useState(['']);
  const [focusBagIdx, setFocusBagIdx] = useState(null);
  const [rate, setRate] = useState('');
  const [cooly, setCooly] = useState('0');
  const [coolyOn, setCoolyOn] = useState(false);
  const [coolyPerBag, setCoolyPerBag] = useState(true);
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingRowId, setSavingRowId] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
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

  const filledBags = bagWeights.map(Number).filter((n) => n > 0);
  const bagCount = filledBags.length;
  const qty = filledBags.reduce((s, n) => s + n, 0);
  const materialsAmount = Number((qty * (Number(rate) || 0)).toFixed(2));
  const coolyApplied = coolyOn ? appliedCooly(cooly, bagCount, coolyPerBag) : 0;
  const amount = Number((materialsAmount + coolyApplied).toFixed(2));

  const suggestions = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return [];
    return customers
      .filter((c) => {
        const name = (c.name || '').toLowerCase();
        const te = (c.nameTelugu || '').toLowerCase();
        return name.includes(q) || te.includes(q);
      })
      .slice(0, 8);
  }, [customers, nameQuery]);

  const flatRows = useMemo(() => {
    const rows = [];
    for (const sale of sales) {
      for (const line of sale.lines || []) {
        rows.push({
          saleId: sale._id,
          lineIndex: sale.lines.indexOf(line),
          serial: rows.length + 1,
          item: line.materialName,
          materialId: line.material?._id || line.material || '',
          name: sale.customer?.name || '—',
          customerId: sale.customer?._id || sale.customer || '',
          vendor: sale.vendor?.name || '—',
          vendorId: sale.vendor?._id || sale.vendor || '',
          bags: line.bagCount,
          qty: line.totalKg,
          rate: line.ratePerKg,
          cooly: sale.handlingCharges || 0,
          coolyRate: sale.coolyRate != null ? sale.coolyRate : sale.handlingCharges || 0,
          coolyPerBag: !!sale.coolyPerBag,
          amount: Number(line.totalAmount || 0) + (sale.handlingCharges || 0),
          sale,
          line,
        });
      }
    }
    return rows;
  }, [sales]);

  const displayedRows = useMemo(() => {
    const q = customerFilter.trim().toLowerCase();
    let rows = q
      ? flatRows.filter((r) => {
          const name = (r.name || '').toLowerCase();
          const te = (r.sale?.customer?.nameTelugu || '').toLowerCase();
          return name.includes(q) || te.includes(q);
        })
      : [...flatRows];
    if (sortKey) {
      const dir = sortDir === 'desc' ? -1 : 1;
      rows.sort((a, b) => {
        if (sortKey === 'amount') return (Number(a.amount) - Number(b.amount)) * dir;
        const av = String(a[sortKey] || '').toLowerCase();
        const bv = String(b[sortKey] || '').toLowerCase();
        return av.localeCompare(bv, 'en', { numeric: true }) * dir;
      });
    }
    return rows;
  }, [flatRows, customerFilter, sortKey, sortDir]);

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
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
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
        title={active ? `Sorted ${sortDir === 'desc' ? 'descending' : 'ascending'} — click to reverse` : 'Click to sort'}
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
      const bags = (line.bags || []).map((b) => String(b.kgs ?? ''));
      setBagWeights(bags.length ? bags : ['']);
    }
    setCoolyPerBag(!!sale.coolyPerBag);
    setCooly(String(sale.coolyRate != null && sale.coolyRate !== '' ? sale.coolyRate : sale.handlingCharges || 0));
    setTimeout(() => {
      fillingRef.current = false;
    }, 0);
  };

  useEffect(() => {
    Promise.all([api.get('/materials'), api.get('/customers'), api.get('/vendors')])
      .then(([m, c, v]) => {
        setMaterials(m.data);
        setCustomers(c.data);
        setVendors(v.data);
      })
      .catch(() => toast.error('Failed to load master data'));
  }, []);

  useEffect(() => {
    loadDaySales().catch(() => setSales([]));
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
        setCoolyOn(!!c.handlingCharges);
      }
      queryApplied.current = true;
    }
  }, [sales, customers, searchParams]);

  useEffect(() => {
    if (!focusSaleId || !focusRowRef.current) return;
    focusRowRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focusSaleId, flatRows.length]);

  useEffect(() => {
    setHighlight(-1);
  }, [nameQuery, suggestions]);

  useEffect(() => {
    if (fillingRef.current) return;
    if (material) {
      setRate(String(material.sellingPricePerKg ?? ''));
    }
  }, [materialId]);

  useEffect(() => {
    if (fillingRef.current) return;
    setCoolyOn(customerCoolyDefault);
    if (!customerCoolyDefault) setCooly('0');
  }, [customerId, customerCoolyDefault]);

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
    setCoolyOn(!!c.handlingCharges);
    setFocusBagIdx(0);
  };

  const clearEntry = () => {
    setEditingSaleId('');
    setFocusSaleId('');
    setCustomerId('');
    setNameQuery('');
    setBagWeights(['']);
    setCooly('0');
    setCoolyOn(false);
    setCoolyPerBag(true);
    setDetail('');
    if (material) setRate(String(material.sellingPricePerKg ?? ''));
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
    const bags = bagWeights.map((kgs) => ({ kgs: Number(kgs) })).filter((b) => b.kgs > 0);
    if (!bags.length) {
      toast.error('Enter bag weights');
      return;
    }
    const ratePerKg = Number(rate);
    if (rate === '' || Number.isNaN(ratePerKg) || ratePerKg < 0) {
      toast.error('Enter rate');
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
            ratePerKg,
            bags,
          },
        ],
      };
      if (editingSaleId) {
        await api.put(`/sales/${editingSaleId}`, payload);
        toast.success('Sale updated');
      } else {
        await api.post('/sales', payload);
        toast.success('Saved');
      }
      clearEntry();
      await loadDaySales();
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
      const base = {
        materialId,
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
        const qty = patch.qty !== undefined ? Number(patch.qty) : Number(l.totalKg);
        const bags = patch.bags !== undefined ? Math.floor(Number(patch.bags)) : Number(l.bagCount) || 1;
        if (!qty || qty <= 0) throw new Error('Enter quantity (kg)');
        if (!bags || bags < 1) throw new Error('Enter bags');
        base.totalKg = qty;
        base.bagCount = bags;
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
      api.get('/customers').then((r) => setCustomers(r.data));
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed to update');
      await loadDaySales();
    } finally {
      setSavingRowId('');
    }
  };

  const onNameKeyDown = (e) => {
    if (!suggestOpen || !suggestions.length) {
      if (e.key === 'Enter') {
        e.preventDefault();
        setFocusBagIdx(0);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = highlight >= 0 ? suggestions[highlight] : suggestions[0];
      if (pick) pickCustomer(pick);
    } else if (e.key === 'Escape') {
      setSuggestOpen(false);
    }
  };

  const printNUp = async (perPage) => {
    const ids = [];
    const seen = new Set();
    for (const row of displayedRows) {
      const cid = String(row.customerId || '');
      if (!cid || seen.has(cid)) continue;
      seen.add(cid);
      ids.push(cid);
    }
    if (!ids.length) {
      toast.error('No sales to print');
      return;
    }

    setPrinting(true);
    const previewTab = openBillPreviewTab();
    try {
      const res = await api.get('/reports/bills', {
        params: { startDate: date, endDate: date },
      });
      const byId = new Map((res.data?.statements || []).map((st) => [String(st.customerId), st]));
      const statements = ids.map((id) => byId.get(id)).filter(Boolean);
      if (!statements.length) {
        previewTab?.close();
        toast.error('No bills to print');
        return;
      }
      await openRangeBillsNUp(statements, perPage, previewTab);
      setPrintOpen(false);
    } catch (err) {
      previewTab?.close();
      toast.error(err.response?.data?.message || err.message || 'Could not print bill');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-2">
      <div className="shrink-0">
        <h1 className="page-title">Sales</h1>
        <p className="text-primary-400 text-sm mt-0.5">
          {editingSaleId
            ? 'Editing a sale from this date — change bags, rate, or customer, then save'
            : 'Select product, vendor & date — then enter customers one by one'}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 flex-1 min-h-0">
      <form
        onSubmit={handleSave}
        className="card border-2 border-primary-200 w-full lg:w-[26rem] xl:w-[28rem] shrink-0 min-h-0 max-h-[48vh] lg:max-h-none lg:h-full flex flex-col overflow-hidden"
      >
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-0.5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Serial</label>
            <input className="input-field bg-primary-50 font-semibold" value={nextSerial} readOnly />
          </div>
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
            <label className="label">Product *</label>
            <select
              className="input-field"
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
            <label className="label">Vendor *</label>
            <select
              className="input-field"
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

        <div className="grid grid-cols-1 gap-3 border-t border-primary-100 pt-4">
          <div className="relative">
            <label className="label">Name *</label>
            <input
              ref={nameRef}
              className="input-field"
              value={nameQuery}
              onChange={(e) => {
                setNameQuery(e.target.value);
                setCustomerId('');
                setSuggestOpen(true);
              }}
              onFocus={() => setSuggestOpen(true)}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              onKeyDown={onNameKeyDown}
              placeholder="Customer name..."
              autoComplete="off"
            />
            {suggestOpen && suggestions.length > 0 && (
              <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-xl border border-primary-200 bg-surface shadow-card">
                {suggestions.map((c, i) => (
                  <li key={c._id}>
                    <button
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm ${
                        i === highlight ? 'bg-primary-100 text-primary-800' : 'hover:bg-primary-50'
                      }`}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        pickCustomer(c);
                      }}
                    >
                      {c.name}
                      {c.nameTelugu ? (
                        <span className="block text-xs text-primary-400">{c.nameTelugu}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Bags</label>
              <input className="input-field bg-primary-50" value={bagCount || ''} readOnly />
            </div>
            <div>
              <label className="label">Qty (kg)</label>
              <input
                className="input-field bg-primary-50"
                value={qty ? qty.toFixed(1) : ''}
                readOnly
              />
            </div>
            <div>
              <label className="label">Rate *</label>
              <input
                ref={rateRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="input-field"
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

        <div>
          <label className="label">Bag weights (kg) *</label>
          <p className="text-xs text-primary-400 mb-2">
            Type weight and press Enter for the next bag — empty Enter moves to Rate
          </p>
          <div className="flex flex-wrap gap-2">
            {bagWeights.map((bag, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  bagInputRefs.current[idx] = el;
                }}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="input-field !w-24 !py-2"
                placeholder={`Bag ${idx + 1}`}
                value={bag}
                onChange={(e) => updateBag(idx, e.target.value.replace(/[^\d.]/g, ''))}
                onKeyDown={(e) => handleBagEnter(e, idx)}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                Cooly
                <input
                  type="checkbox"
                  checked={coolyOn}
                  onChange={(e) => setCoolyOn(e.target.checked)}
                />
              </span>
              <span className="inline-flex items-center gap-1.5 font-normal text-primary-500">
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
              className="input-field"
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
            <p className="text-[11px] text-primary-400 mt-1">
              {!coolyOn
                ? customerCoolyDefault
                  ? 'Customer default is cooly on — uncheck to skip this sale'
                  : 'Customer default is no cooly — tick to add on this sale'
                : coolyPerBag
                  ? `Per bag · ${formatCurrency(Number(cooly) || 0)} × ${bagCount} = ${formatCurrency(coolyApplied)}`
                  : `Overall · ${formatCurrency(coolyApplied)}`}
            </p>
          </div>
          <div>
            <label className="label">Amount</label>
            <input
              className="input-field bg-accent-100 font-semibold text-accent-700"
              value={amount ? formatCurrency(amount) : ''}
              readOnly
            />
          </div>
          <div className="col-span-2">
            <label className="label">Detail</label>
            <input
              className="input-field"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Optional note"
            />
          </div>
        </div>

        </div>
        <div className="flex flex-wrap gap-2 justify-center pt-3 mt-3 border-t border-primary-100 shrink-0">
          <button type="submit" className="btn-primary min-w-[120px]" disabled={saving}>
            {saving ? 'Saving...' : editingSaleId ? 'Update' : 'Save'}
          </button>
          <button type="button" className="btn-secondary min-w-[120px]" onClick={clearEntry}>
            {editingSaleId ? 'Cancel edit' : 'Clear'}
          </button>
        </div>
      </form>

      <div className="card p-0 w-full min-w-0 flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-primary-100 px-3 py-2 bg-accent-50 shrink-0">
          <input
            className="input-field !py-1.5 max-w-xs"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            placeholder="Filter by customer..."
          />
          <button
            type="button"
            className="btn-primary inline-flex items-center gap-1.5 !py-1.5 !px-3 text-sm ml-auto"
            disabled={!displayedRows.length || printing}
            onClick={() => setPrintOpen(true)}
          >
            <Printer className="h-4 w-4" />
            Print
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-accent-200 text-accent-800 text-left">
              <th className="px-3 py-2.5 font-semibold">S No</th>
              <th className="px-3 py-2.5 font-semibold">
                <SortLabel column="item">Item</SortLabel>
              </th>
              <th className="px-3 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">
                <SortLabel column="vendor">Vendor</SortLabel>
              </th>
              <th className="px-3 py-2.5 font-semibold text-right">Bags</th>
              <th className="px-3 py-2.5 font-semibold text-right">Qty</th>
              <th className="px-3 py-2.5 font-semibold text-right">Rate</th>
              <th className="px-3 py-2.5 font-semibold text-right">Cooly</th>
              <th className="px-3 py-2.5 font-semibold text-right">
                <SortLabel column="amount" align="right">
                  Amount
                </SortLabel>
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-primary-400">
                  {flatRows.length && customerFilter
                    ? 'No sales match this customer'
                    : `No sales for this date yet`}
                </td>
              </tr>
            ) : (
              displayedRows.map((r, i) => {
                const busy = savingRowId === r.saleId;
                const cell =
                  'w-full bg-transparent rounded-lg border border-transparent hover:border-primary-200 focus:border-primary-400 focus:bg-surface outline-none px-1.5 py-1 disabled:opacity-60';
                return (
                  <tr
                    key={`${r.saleId}-${r.lineIndex}`}
                    ref={r.saleId === focusSaleId ? focusRowRef : null}
                    className={
                      r.saleId === focusSaleId || r.saleId === editingSaleId
                        ? 'bg-accent-100'
                        : i % 2 === 0
                          ? 'bg-surface'
                          : 'bg-primary-50/40'
                    }
                  >
                    <td className="px-3 py-1.5 text-primary-500">{r.serial}</td>
                    <td className="px-2 py-1.5 min-w-[8rem]">
                      <select
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
                    <td className="px-3 py-1.5 text-primary-700 whitespace-nowrap">{r.vendor}</td>
                    <td className="px-2 py-1.5 w-20">
                      <input
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
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        disabled={busy}
                        defaultValue={Number(r.qty).toFixed(1)}
                        key={`${r.saleId}-${r.lineIndex}-qty-${r.qty}`}
                        className={`${cell} text-right tabular-nums`}
                        onBlur={(e) => {
                          const qty = Number(e.target.value);
                          if (qty === Number(r.qty)) return;
                          persistTableRow(r, { qty }).catch((err) => toast.error(err.message));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <input
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
                          if (e.key === 'Enter') e.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td className="px-2 py-1.5 w-28">
                      <div className="flex flex-col items-end gap-0.5">
                        <label className="inline-flex items-center gap-1 text-[10px] text-primary-400 font-normal">
                          <input
                            type="checkbox"
                            disabled={busy}
                            checked={r.coolyPerBag}
                            onChange={(e) => {
                              persistTableRow(r, { coolyPerBag: e.target.checked }).catch((err) =>
                                toast.error(err.message)
                              );
                            }}
                          />
                          Per bag
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          disabled={busy}
                          defaultValue={r.coolyRate || 0}
                          key={`${r.saleId}-cooly-${r.coolyRate}-${r.coolyPerBag}`}
                          className={`${cell} text-right tabular-nums`}
                          onBlur={(e) => {
                            const coolyRate = Number(e.target.value);
                            if (coolyRate === Number(r.coolyRate || 0)) return;
                            persistTableRow(r, { coolyRate }).catch((err) => toast.error(err.message));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                          }}
                        />
                        <span className="text-[10px] text-primary-400 tabular-nums">
                          {formatCurrency(r.cooly || 0)}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium text-primary-800">
                      {formatCurrency(r.amount)}
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

      {printOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="card w-full max-w-sm space-y-4">
            <h2 className="text-lg font-bold text-primary-800">Print bills</h2>
            <p className="text-sm text-primary-500">
              Same layout as Bill Print — opening, sales, జమ, and closing
              {customerFilter.trim() ? ' for filtered customers' : ''}.
            </p>
            <div className="grid grid-cols-1 gap-2">
              {[2, 4, 6].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={n === 6 ? 'btn-primary !py-3 justify-center' : 'btn-secondary !py-3 justify-center'}
                  disabled={printing}
                  onClick={() => printNUp(n)}
                >
                  {n} per page
                </button>
              ))}
            </div>
            <button
              type="button"
              className="text-sm font-medium text-primary-500"
              onClick={() => setPrintOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
