import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Save, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import MaterialAutocomplete from '../components/MaterialAutocomplete';
import { formatCurrency, formatDate, formatKg } from '../utils/format';
import { matchesSearchFields } from '../utils/search';
import { useDataRestored } from '../utils/useDataRestored';

import { useMDI } from '../context/MDIContext';
import { useSearchParams } from 'react-router-dom';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

const emptyLine = (type = 'by_weight') => ({
  materialName: '',
  materialId: '',
  purchaseType: type,
  bags: '',
  totalKg: '',
  ratePerKg: '10',
});

export default function Purchase({ path: windowPath }) {
  const { updateWindowPath } = useMDI();
  const [searchParams] = useSearchParams();
  const effectiveSearchParams = useMemo(() => {
    if (windowPath && windowPath.includes('?')) {
      return new URLSearchParams(windowPath.split('?')[1]);
    }
    return searchParams;
  }, [windowPath, searchParams]);

  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [vendorQuery, setVendorQuery] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => effectiveSearchParams.get('date') || todayInputValue());

  useEffect(() => {
    if (purchaseDate && typeof updateWindowPath === 'function') {
      updateWindowPath('/purchase', `/purchase?date=${purchaseDate}`);
    }
  }, [purchaseDate, updateWindowPath]);
  const [globalPurchaseType, setGlobalPurchaseType] = useState('by_weight');
  const [lines, setLines] = useState([emptyLine('by_weight')]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [recent, setRecent] = useState([]);

  const vendorListRef = useRef(null);

  const selected = vendors.find((v) => v._id === vendorId);

  const suggestions = useMemo(() => {
    if (!vendorQuery.trim()) return [];
    return vendors
      .filter((v) => matchesSearchFields(v, ['name', 'nameTelugu', 'city', 'mobile'], vendorQuery))
      .slice(0, 8);
  }, [vendors, vendorQuery]);

  useEffect(() => {
    setHighlight(-1);
  }, [vendorQuery, suggestions]);

  useEffect(() => {
    if (!suggestOpen || highlight < 0 || !vendorListRef.current) return;
    const el = vendorListRef.current.querySelector(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, suggestOpen]);

  const totals = useMemo(() => {
    let bags = 0;
    let weight = 0;
    let amount = 0;
    for (const line of lines) {
      const isByBag = line.purchaseType === 'by_bag';
      const b = isByBag ? Math.floor(Number(line.bags)) || 0 : 0;
      const kg = isByBag ? 0 : Number(line.totalKg) || 0;
      const rate = Number(line.ratePerKg) || 0;
      bags += b;
      weight += kg;
      amount += isByBag ? b * rate : kg * rate;
    }
    return { bags, weight: Number(weight.toFixed(1)), amount: Number(amount.toFixed(2)) };
  }, [lines]);

  const refreshRecent = useCallback(() => {
    api
      .get('/purchases')
      .then((res) => setRecent(res.data.slice(0, 15)))
      .catch(() => {});
  }, []);

  const loadAll = useCallback(() => {
    Promise.all([api.get('/vendors'), api.get('/materials')])
      .then(([v, m]) => {
        setVendors(v.data);
        setMaterials(m.data);
      })
      .catch(() => toast.error('Failed to load purchase data'));
    refreshRecent();
  }, [refreshRecent]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useDataRestored(loadAll);

  const pickVendor = (v) => {
    setVendorId(v._id);
    setVendorQuery(v.name);
    setSuggestOpen(false);
    setHighlight(-1);
  };

  const updateLine = (idx, patch) => {
    const next = [...lines];
    next[idx] = { ...next[idx], ...patch };
    setLines(next);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vendorId) {
      toast.error('Type and select a vendor');
      return;
    }

    const payloadLines = [];
    for (const line of lines) {
      if (!line.materialName?.trim() && !line.materialId) continue;
      const isByBag = line.purchaseType === 'by_bag';
      const bags = isByBag ? Math.floor(Number(line.bags)) || 0 : 0;
      const totalKg = isByBag ? 0 : Number(line.totalKg) || 0;
      const ratePerKg = Number(line.ratePerKg);
      if (isByBag) {
        if (!bags || bags <= 0) {
          toast.error('Enter number of bags for each by-bag line');
          return;
        }
        if (Number.isNaN(ratePerKg) || ratePerKg < 0) {
          toast.error('Enter rate per bag for each product line');
          return;
        }
      } else {
        if (!totalKg || totalKg <= 0) {
          toast.error('Enter weight for each by-weight product line');
          return;
        }
        if (Number.isNaN(ratePerKg) || ratePerKg < 0) {
          toast.error('Enter rate per kg for each product line');
          return;
        }
      }
      payloadLines.push({
        materialId: line.materialId || undefined,
        materialName: line.materialName,
        purchaseType: line.purchaseType || 'by_weight',
        bags,
        totalKg,
        ratePerKg,
      });
    }

    if (!payloadLines.length) {
      toast.error('Add at least one product');
      return;
    }

    setSaving(true);
    try {
      await api.post('/purchases', {
        vendorId,
        purchaseDate,
        lines: payloadLines,
        notes,
      });
      toast.success('Purchase saved');
      setVendorId('');
      setVendorQuery('');
      setLines([emptyLine(globalPurchaseType)]);
      setNotes('');
      refreshRecent();
      api.get('/materials').then((res) => setMaterials(res.data));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save purchase');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="page-title">Purchase</h1>
        <p className="text-primary-400 text-sm mt-0.5">
          Buy products from a vendor
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card space-y-4">
          <div className="flex items-center gap-3 bg-primary-50/70 px-3 py-2 rounded-xl border border-primary-100">
            <span className="text-xs font-semibold text-primary-600 shrink-0">Purchase Type:</span>
            <label className="inline-flex items-center gap-1.5 text-xs text-primary-700 font-medium cursor-pointer">
              <input
                type="radio"
                name="globalPurchaseType"
                value="by_weight"
                checked={globalPurchaseType === 'by_weight'}
                onChange={() => {
                  setGlobalPurchaseType('by_weight');
                  setLines(lines.map((l) => ({ ...l, purchaseType: 'by_weight', bags: '' })));
                }}
              />
              By Weight (kg)
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-primary-700 font-medium cursor-pointer">
              <input
                type="radio"
                name="globalPurchaseType"
                value="by_bag"
                checked={globalPurchaseType === 'by_bag'}
                onChange={() => {
                  setGlobalPurchaseType('by_bag');
                  setLines(lines.map((l) => ({ ...l, purchaseType: 'by_bag', totalKg: '' })));
                }}
              />
              By Bag (Fixed Rate)
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Date *</label>
              <input
                type="date"
                className="input-field"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                required
              />
            </div>
            <div className="relative">
              <label className="label">Vendor *</label>
              <input
                className="input-field"
                value={vendorQuery}
                placeholder="Type vendor name…"
                autoComplete="off"
                onChange={(e) => {
                  setVendorQuery(e.target.value);
                  setVendorId('');
                  setSuggestOpen(true);
                }}
                onFocus={() => {
                  if (vendorQuery.trim()) setSuggestOpen(true);
                }}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown' && suggestions.length) {
                    e.preventDefault();
                    setSuggestOpen(true);
                    setHighlight((h) => (h < 0 ? 0 : Math.min(h + 1, suggestions.length - 1)));
                  } else if (e.key === 'ArrowUp' && suggestions.length) {
                    e.preventDefault();
                    setSuggestOpen(true);
                    setHighlight((h) => (h <= 0 ? 0 : h - 1));
                  } else if (e.key === 'Enter' && suggestOpen && suggestions.length) {
                    e.preventDefault();
                    pickVendor(suggestions[highlight >= 0 ? highlight : 0]);
                  } else if (e.key === 'Escape') {
                    setSuggestOpen(false);
                    setHighlight(-1);
                  }
                }}
                required
              />
              {suggestOpen && suggestions.length > 0 && (
                <ul
                  ref={vendorListRef}
                  className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl border border-primary-200 bg-surface shadow-card"
                >
                  {suggestions.map((v, idx) => (
                    <li key={v._id}>
                      <button
                        type="button"
                        data-idx={idx}
                        className={`w-full text-left px-4 py-2.5 text-sm ${
                          idx === highlight
                            ? 'bg-primary-100 text-primary-900 font-medium'
                            : 'text-primary-700 hover:bg-primary-50'
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => pickVendor(v)}
                      >
                        {v.name}
                        {v.city ? (
                          <span className="text-primary-400 ml-2 text-xs">{v.city}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selected && (
                <p className="text-xs text-primary-500 mt-1">Selected: {selected.name}</p>
              )}
            </div>
          </div>
        </div>

        {lines.map((line, idx) => {
          const isByBag = line.purchaseType === 'by_bag';
          const lineAmount = isByBag
            ? (Math.floor(Number(line.bags)) || 0) * (Number(line.ratePerKg) || 0)
            : (Number(line.totalKg) || 0) * (Number(line.ratePerKg) || 0);

          return (
            <div key={idx} className="card space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-semibold text-primary-700 flex items-center gap-2 text-sm">
                  <Package className="w-4 h-4" /> Product {idx + 1}
                </h3>
                <div className="flex items-center gap-2 bg-primary-50/70 px-2 py-1 rounded-lg border border-primary-100 text-xs">
                  <label className="inline-flex items-center gap-1 font-medium cursor-pointer text-primary-700">
                    <input
                      type="radio"
                      name={`line-type-${idx}`}
                      value="by_weight"
                      checked={line.purchaseType !== 'by_bag'}
                      onChange={() => updateLine(idx, { purchaseType: 'by_weight', bags: '' })}
                    />
                    By Weight
                  </label>
                  <label className="inline-flex items-center gap-1 font-medium cursor-pointer text-primary-700">
                    <input
                      type="radio"
                      name={`line-type-${idx}`}
                      value="by_bag"
                      checked={line.purchaseType === 'by_bag'}
                      onChange={() => updateLine(idx, { purchaseType: 'by_bag', totalKg: '' })}
                    />
                    By Bag
                  </label>
                </div>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                    className="text-red-400 p-1.5 hover:bg-red-50 rounded-lg ml-auto"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <MaterialAutocomplete
                materials={materials}
                onMaterialsChange={setMaterials}
                value={line.materialName}
                materialId={line.materialId}
                onChange={(sel) =>
                  updateLine(idx, {
                    materialId: sel.materialId,
                    materialName: sel.materialName,
                    ratePerKg:
                      sel.sellingPricePerKg != null
                        ? String(sel.sellingPricePerKg)
                        : line.ratePerKg,
                  })
                }
                required
              />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {isByBag ? (
                  <div>
                    <label className="label">No. of Bags *</label>
                    <input
                      className="input-field"
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={line.bags}
                      onChange={(e) =>
                        updateLine(idx, { bags: e.target.value.replace(/[^\d]/g, '') })
                      }
                      required
                    />
                  </div>
                ) : (
                  <div>
                    <label className="label">Weight (kg) *</label>
                    <input
                      className="input-field"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.0"
                      value={line.totalKg}
                      onChange={(e) =>
                        updateLine(idx, { totalKg: e.target.value.replace(/[^\d.]/g, '') })
                      }
                      required
                    />
                  </div>
                )}
                <div>
                  <label className="label">{isByBag ? 'Rate / Bag *' : 'Rate / Kg *'}</label>
                  <input
                    className="input-field"
                    type="text"
                    inputMode="decimal"
                    value={line.ratePerKg}
                    onChange={(e) =>
                      updateLine(idx, { ratePerKg: e.target.value.replace(/[^\d.]/g, '') })
                    }
                    required
                  />
                </div>
                <div className="flex items-end">
                  <p className="text-sm text-primary-600 pb-3">
                    Amount: <strong>{formatCurrency(lineAmount)}</strong>
                  </p>
                </div>
              </div>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setLines([...lines, emptyLine(globalPurchaseType)])}
          className="btn-secondary w-full !py-2.5"
        >
          <Plus className="w-4 h-4" /> Add Product
        </button>

        <div className="card space-y-3">
          <div>
            <label className="label">Notes</label>
            <input
              className="input-field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-primary-500">Total bags</span>
            <span className="font-semibold">{totals.bags}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-primary-500">Total weight</span>
            <span className="font-semibold">{formatKg(totals.weight)}</span>
          </div>
          <div className="flex justify-between items-center border-t border-primary-100 pt-3">
            <span className="font-semibold text-primary-700">Vendor payable</span>
            <span className="text-2xl font-bold text-primary-700">
              {formatCurrency(totals.amount)}
            </span>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Purchase'}
          </button>
        </div>
      </form>

      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-primary-100 font-semibold text-primary-700">
          Recent purchases
        </div>
        {recent.length === 0 ? (
          <p className="text-center py-8 text-primary-400 text-sm">No purchases yet</p>
        ) : (
          <ul className="divide-y divide-primary-50">
            {recent.map((p) => (
              <li key={p._id} className="px-4 py-3 text-sm flex justify-between gap-3">
                <span>
                  <span className="font-medium text-primary-800">{p.vendor?.name || '—'}</span>
                  <span className="text-primary-400 ml-2">
                    {p.totalBags ? `${p.totalBags} bags · ` : ''}{formatKg(p.totalWeight)}
                  </span>
                </span>
                <span className="text-primary-600">
                  {formatCurrency(p.totalAmount)} · {formatDate(p.purchaseDate)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
