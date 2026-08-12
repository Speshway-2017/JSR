import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency } from '../utils/format';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function Sell() {
  const [date, setDate] = useState(todayInputValue());
  const [materials, setMaterials] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [sales, setSales] = useState([]);

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
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);

  const nameRef = useRef(null);
  const bagInputRefs = useRef({});
  const rateRef = useRef(null);
  const coolyRef = useRef(null);

  const material = materials.find((m) => m._id === materialId);
  const customer = customers.find((c) => c._id === customerId);
  const hasCooly = !!customer?.handlingCharges;

  const filledBags = bagWeights.map(Number).filter((n) => n > 0);
  const bagCount = filledBags.length;
  const qty = filledBags.reduce((s, n) => s + n, 0);
  const amount = Number((qty * (Number(rate) || 0)).toFixed(2));

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
          serial: rows.length + 1,
          item: line.materialName,
          name: sale.customer?.name || '—',
          bags: line.bagCount,
          qty: line.totalKg,
          rate: line.ratePerKg,
          cooly: sale.handlingCharges || 0,
          amount: line.totalAmount + (sale.handlingCharges || 0),
        });
      }
    }
    return rows;
  }, [sales]);

  const totals = useMemo(
    () =>
      flatRows.reduce(
        (acc, r) => ({
          bags: acc.bags + (Number(r.bags) || 0),
          qty: acc.qty + (Number(r.qty) || 0),
          amount: acc.amount + (Number(r.amount) || 0),
        }),
        { bags: 0, qty: 0, amount: 0 }
      ),
    [flatRows]
  );

  const nextSerial = flatRows.length + 1;

  const loadDaySales = async () => {
    if (!date) return;
    const params = { date };
    if (vendorId) params.vendorId = vendorId;
    const res = await api.get('/sales', { params });
    setSales(res.data);
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
  }, [date, vendorId]);

  useEffect(() => {
    setHighlight(-1);
  }, [nameQuery, suggestions]);

  useEffect(() => {
    if (material) {
      setRate(String(material.sellingPricePerKg ?? ''));
    }
  }, [materialId]);

  useEffect(() => {
    if (!hasCooly) {
      setCoolyOn(false);
      setCooly('0');
    }
  }, [customerId, hasCooly]);

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
    setCustomerId('');
    setNameQuery('');
    setBagWeights(['']);
    setCooly('0');
    setCoolyOn(false);
    setDetail('');
    if (material) setRate(String(material.sellingPricePerKg ?? ''));
    nameRef.current?.focus();
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
      await api.post('/sales', {
        customerId,
        vendorId,
        date,
        handlingCharges: coolyOn && hasCooly ? Number(cooly) || 0 : 0,
        lines: [
          {
            materialId,
            ratePerKg,
            bags,
          },
        ],
      });
      toast.success('Saved');
      clearEntry();
      await loadDaySales();
      api.get('/customers').then((r) => setCustomers(r.data));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sale failed');
    } finally {
      setSaving(false);
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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Sales</h1>
        <p className="text-primary-400 text-sm mt-0.5">
          Select product, vendor & date — then enter customers one by one
        </p>
      </div>

      <form onSubmit={handleSave} className="card space-y-4 border-2 border-primary-200">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
          <div className="sm:col-span-2">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-primary-100 pt-4">
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
                type="number"
                min="0"
                step="0.01"
                className="input-field"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  e.preventDefault();
                  if (hasCooly) coolyRef.current?.focus();
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
                type="number"
                min="0.1"
                step="0.1"
                className="input-field !w-24 !py-2"
                placeholder={`Bag ${idx + 1}`}
                value={bag}
                onChange={(e) => updateBag(idx, e.target.value)}
                onKeyDown={(e) => handleBagEnter(e, idx)}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="label flex items-center gap-2">
              Cooly
              <input
                type="checkbox"
                checked={coolyOn && hasCooly}
                disabled={!hasCooly}
                onChange={(e) => setCoolyOn(e.target.checked)}
              />
            </label>
            <input
              ref={coolyRef}
              type="number"
              min="0"
              step="0.01"
              className="input-field"
              value={cooly}
              disabled={!coolyOn || !hasCooly}
              onChange={(e) => setCooly(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSave();
                }
              }}
            />
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

        <div className="flex flex-wrap gap-2 justify-center pt-1">
          <button type="submit" className="btn-primary min-w-[120px]" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button type="button" className="btn-secondary min-w-[120px]" onClick={clearEntry}>
            Clear
          </button>
        </div>
      </form>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-accent-200 text-accent-800 text-left">
              <th className="px-3 py-2.5 font-semibold">S No</th>
              <th className="px-3 py-2.5 font-semibold">Item</th>
              <th className="px-3 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold text-right">Bags</th>
              <th className="px-3 py-2.5 font-semibold text-right">Qty</th>
              <th className="px-3 py-2.5 font-semibold text-right">Rate</th>
              <th className="px-3 py-2.5 font-semibold text-right">Cooly</th>
              <th className="px-3 py-2.5 font-semibold text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {flatRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-primary-400">
                  No sales for this date{vendorId ? ' / vendor' : ''} yet
                </td>
              </tr>
            ) : (
              flatRows.map((r, i) => (
                <tr
                  key={`${r.saleId}-${i}`}
                  className={i % 2 === 0 ? 'bg-surface' : 'bg-primary-50/40'}
                >
                  <td className="px-3 py-2 text-primary-500">{r.serial}</td>
                  <td className="px-3 py-2 font-medium text-primary-700">{r.item}</td>
                  <td className="px-3 py-2 text-primary-700">{r.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.bags}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.qty).toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.rate}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.cooly || 0}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">
                    {formatCurrency(r.amount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-primary-100 px-3 py-3 bg-accent-50">
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
  );
}
