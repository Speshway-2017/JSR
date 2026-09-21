import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Save, Package, Eye, Printer } from 'lucide-react';
import { openPurchaseBillPreview } from '../utils/reportPrint';
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
  boxes: '',
  weightPerBox: '',
  totalKg: '',
  ratePerKg: '10',
});

export default function Purchase({ path: windowPath }) {
  const { updateWindowPath, openWindow } = useMDI();
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
      const type = line.purchaseType || 'by_weight';
      const rate = Number(line.ratePerKg) || 0;
      if (type === 'by_bag') {
        const b = Math.floor(Number(line.bags)) || 0;
        bags += b;
        amount += b * rate;
      } else if (type === 'by_box') {
        const bx = Math.floor(Number(line.boxes)) || 0;
        const w = Number(line.weightPerBox) || 0;
        const kg = Number((bx * w).toFixed(1));
        bags += bx;
        weight += kg;
        amount += kg * rate;
      } else {
        const b = Math.floor(Number(line.bags)) || 0;
        const kg = Number(line.totalKg) || 0;
        bags += b;
        weight += kg;
        amount += kg * rate;
      }
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
      const type = line.purchaseType || 'by_weight';
      const bags = Math.floor(Number(line.bags)) || 0;
      const boxes = Math.floor(Number(line.boxes)) || 0;
      const weightPerBox = Number(line.weightPerBox) || 0;
      const totalKg = type === 'by_box' ? Number((boxes * weightPerBox).toFixed(1)) : (type === 'by_bag' ? 0 : Number(line.totalKg) || 0);
      const ratePerKg = Number(line.ratePerKg);

      if (type === 'by_bag') {
        if (!bags || bags <= 0) {
          toast.error('Enter number of bags for each by-bag line');
          return;
        }
        if (Number.isNaN(ratePerKg) || ratePerKg < 0) {
          toast.error('Enter rate per bag for each product line');
          return;
        }
      } else if (type === 'by_box') {
        if (!boxes || boxes <= 0) {
          toast.error('Enter number of boxes for each by-box line');
          return;
        }
        if (!weightPerBox || weightPerBox <= 0) {
          toast.error('Enter weight per box for each by-box line');
          return;
        }
        if (Number.isNaN(ratePerKg) || ratePerKg < 0) {
          toast.error('Enter rate per kg for each product line');
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
        purchaseType: type,
        bags: type === 'by_box' ? boxes : bags,
        boxes,
        weightPerBox,
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
      const res = await api.post('/purchases', {
        vendorId,
        purchaseDate,
        lines: payloadLines,
        notes,
      });
      const savedPurchase = res.data;
      toast.success(
        (t) => (
          <div className="flex items-center gap-2">
            <span>Purchase saved</span>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(t.id);
                openPurchaseBillPreview(savedPurchase);
              }}
              className="px-2 py-0.5 bg-primary-700 text-white rounded text-xs font-semibold hover:bg-primary-800 transition cursor-pointer"
            >
              View Bill
            </button>
          </div>
        ),
        { duration: 4500 }
      );
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
    <div className="space-y-3 max-w-3xl">
      <div>
        <h1 className="text-sm font-bold text-primary-800">Purchase</h1>
        <p className="text-primary-400 text-[11px] mt-0.5">
          Buy products from a vendor
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2.5">
        <div className="card !p-3 space-y-2.5">
          <div className="flex items-center gap-2.5 bg-primary-50/70 px-2.5 py-1.5 rounded-lg border border-primary-100 flex-wrap text-xs">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-primary-600 shrink-0">Purchase Type:</span>
            <label className="inline-flex items-center gap-1.5 text-xs text-primary-700 font-medium cursor-pointer">
              <input
                type="radio"
                name="globalPurchaseType"
                value="by_weight"
                checked={globalPurchaseType === 'by_weight'}
                onChange={() => {
                  setGlobalPurchaseType('by_weight');
                  setLines(lines.map((l) => ({ ...l, purchaseType: 'by_weight' })));
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
                  setLines(lines.map((l) => ({ ...l, purchaseType: 'by_bag' })));
                }}
              />
              By Bag (Fixed Rate)
            </label>
            <label className="inline-flex items-center gap-1.5 text-xs text-primary-700 font-medium cursor-pointer">
              <input
                type="radio"
                name="globalPurchaseType"
                value="by_box"
                checked={globalPurchaseType === 'by_box'}
                onChange={() => {
                  setGlobalPurchaseType('by_box');
                  setLines(lines.map((l) => ({ ...l, purchaseType: 'by_box' })));
                }}
              />
              By Box
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">Date *</label>
              <input
                type="date"
                className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                required
              />
            </div>
            <div className="relative">
              <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">Vendor *</label>
              <input
                className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
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
                  className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-primary-200 bg-surface shadow-card"
                >
                  {suggestions.map((v, idx) => (
                    <li key={v._id}>
                      <button
                        type="button"
                        data-idx={idx}
                        className={`w-full text-left px-3 py-1.5 text-xs ${
                          idx === highlight
                            ? 'bg-primary-100 text-primary-900 font-medium'
                            : 'text-primary-700 hover:bg-primary-50'
                        }`}
                        onMouseDown={(e) => e.preventDefault()}
                        onMouseEnter={() => setHighlight(idx)}
                        onClick={() => pickVendor(v)}
                      >
                        <span className="font-semibold">{v.name}</span>
                        {v.city ? (
                          <span className="text-primary-400 ml-1.5 text-[11px]">({v.city})</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {selected && (
                <p className="text-[11px] text-primary-500 mt-1 font-medium">Selected: <strong className="text-primary-800">{selected.name}</strong></p>
              )}
            </div>
          </div>
        </div>

        {lines.map((line, idx) => {
          const type = line.purchaseType || 'by_weight';
          const rate = Number(line.ratePerKg) || 0;
          const bagsCount = Math.floor(Number(line.bags)) || 0;
          const boxesCount = Math.floor(Number(line.boxes)) || 0;
          const weightPerBoxKg = Number(line.weightPerBox) || 0;
          const weightKg = Number(line.totalKg) || 0;

          const boxTotalKg = Number((boxesCount * weightPerBoxKg).toFixed(1));
          const lineAmount =
            type === 'by_bag'
              ? bagsCount * rate
              : type === 'by_box'
              ? boxTotalKg * rate
              : weightKg * rate;

          return (
            <div key={idx} className="card !p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="font-semibold text-primary-800 flex items-center gap-1.5 text-xs">
                  <Package className="w-3.5 h-3.5 text-primary-600" /> Product {idx + 1}
                </h3>
                <div className="flex items-center gap-2 bg-primary-50/70 px-2 py-0.5 rounded-md border border-primary-100 text-[11px] flex-wrap">
                  <label className="inline-flex items-center gap-1 font-medium cursor-pointer text-primary-700">
                    <input
                      type="radio"
                      name={`line-type-${idx}`}
                      value="by_weight"
                      checked={line.purchaseType === 'by_weight'}
                      onChange={() => updateLine(idx, { purchaseType: 'by_weight' })}
                    />
                    By Weight
                  </label>
                  <label className="inline-flex items-center gap-1 font-medium cursor-pointer text-primary-700">
                    <input
                      type="radio"
                      name={`line-type-${idx}`}
                      value="by_bag"
                      checked={line.purchaseType === 'by_bag'}
                      onChange={() => updateLine(idx, { purchaseType: 'by_bag' })}
                    />
                    By Bag
                  </label>
                  <label className="inline-flex items-center gap-1 font-medium cursor-pointer text-primary-700">
                    <input
                      type="radio"
                      name={`line-type-${idx}`}
                      value="by_box"
                      checked={line.purchaseType === 'by_box'}
                      onChange={() => updateLine(idx, { purchaseType: 'by_box' })}
                    />
                    By Box
                  </label>
                </div>
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                    className="text-red-400 p-1 hover:bg-red-50 rounded ml-auto transition cursor-pointer"
                    title="Remove product"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <MaterialAutocomplete
                materials={materials}
                onMaterialsChange={setMaterials}
                value={line.materialName}
                materialId={line.materialId}
                compact={true}
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

              {type === 'by_bag' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-end">
                  <div>
                    <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">No. of Bags *</label>
                    <input
                      className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 tabular-nums transition"
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
                  <div>
                    <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">Rate / Bag *</label>
                    <input
                      className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 tabular-nums transition"
                      type="text"
                      inputMode="decimal"
                      value={line.ratePerKg}
                      onChange={(e) =>
                        updateLine(idx, { ratePerKg: e.target.value.replace(/[^\d.]/g, '') })
                      }
                      required
                    />
                  </div>
                  <div className="pb-0.5">
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-accent-100/80 text-accent-800 px-2.5 py-1 text-xs font-medium">
                      Amount: <strong className="font-bold">{formatCurrency(lineAmount)}</strong>
                    </div>
                  </div>
                </div>
              )}

              {type === 'by_box' && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                  <div>
                    <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">No. of Boxes *</label>
                    <input
                      className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 tabular-nums transition"
                      type="text"
                      inputMode="numeric"
                      placeholder="0"
                      value={line.boxes}
                      onChange={(e) =>
                        updateLine(idx, { boxes: e.target.value.replace(/[^\d]/g, '') })
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">Weight / Box (kg) *</label>
                    <input
                      className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 tabular-nums transition"
                      type="text"
                      inputMode="decimal"
                      placeholder="0.0"
                      value={line.weightPerBox}
                      onChange={(e) =>
                        updateLine(idx, { weightPerBox: e.target.value.replace(/[^\d.]/g, '') })
                      }
                      required
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">Rate / Kg *</label>
                    <input
                      className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 tabular-nums transition"
                      type="text"
                      inputMode="decimal"
                      value={line.ratePerKg}
                      onChange={(e) =>
                        updateLine(idx, { ratePerKg: e.target.value.replace(/[^\d.]/g, '') })
                      }
                      required
                    />
                  </div>
                  <div className="pb-0.5">
                    <p className="text-[10px] text-primary-400 mb-0.5">Total Wt: {boxTotalKg.toFixed(1)} kg</p>
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-accent-100/80 text-accent-800 px-2.5 py-1 text-xs font-medium">
                      Amount: <strong className="font-bold">{formatCurrency(lineAmount)}</strong>
                    </div>
                  </div>
                </div>
              )}

              {type === 'by_weight' && (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                  <div>
                    <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">No. of Bags</label>
                    <input
                      className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 tabular-nums transition"
                      type="text"
                      inputMode="numeric"
                      placeholder="0 (optional)"
                      value={line.bags}
                      onChange={(e) =>
                        updateLine(idx, { bags: e.target.value.replace(/[^\d]/g, '') })
                      }
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">Weight (kg) *</label>
                    <input
                      className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 tabular-nums transition"
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
                  <div>
                    <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">Rate / Kg *</label>
                    <input
                      className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 tabular-nums transition"
                      type="text"
                      inputMode="decimal"
                      value={line.ratePerKg}
                      onChange={(e) =>
                        updateLine(idx, { ratePerKg: e.target.value.replace(/[^\d.]/g, '') })
                      }
                      required
                    />
                  </div>
                  <div className="pb-0.5">
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-accent-100/80 text-accent-800 px-2.5 py-1 text-xs font-medium">
                      Amount: <strong className="font-bold">{formatCurrency(lineAmount)}</strong>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => setLines([...lines, emptyLine(globalPurchaseType)])}
          className="btn-secondary w-full !py-1.5 !text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs"
        >
          <Plus className="w-3.5 h-3.5" /> Add Product
        </button>

        <div className="card !p-3 space-y-2">
          <div>
            <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">Notes</label>
            <input
              className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-xs text-primary-700 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="flex justify-between text-xs py-0.5">
            <span className="text-primary-500">Total bags</span>
            <span className="font-semibold text-primary-800 tabular-nums">{totals.bags}</span>
          </div>
          <div className="flex justify-between text-xs py-0.5">
            <span className="text-primary-500">Total weight</span>
            <span className="font-semibold text-primary-800 tabular-nums">{formatKg(totals.weight)}</span>
          </div>
          <div className="flex justify-between items-center border-t border-primary-100 pt-2">
            <span className="font-semibold text-primary-700 text-xs">Vendor payable</span>
            <span className="text-base font-bold text-primary-800 tabular-nums">
              {formatCurrency(totals.amount)}
            </span>
          </div>
          <button type="submit" className="btn-primary w-full !py-1.5 !text-xs font-semibold shadow-xs flex items-center justify-center gap-1.5" disabled={saving}>
            <Save className="w-3.5 h-3.5" /> {saving ? 'Saving…' : 'Save Purchase'}
          </button>
        </div>
      </form>

      <div className="card !p-0 overflow-hidden border border-primary-200">
        <div className="px-3 py-2 border-b border-primary-200 bg-surface font-semibold text-xs text-primary-800 flex items-center justify-between">
          <span>Recent purchases</span>
          <button
            type="button"
            onClick={() => openWindow?.('/bill-print?type=purchase', 'Bill Print')}
            className="text-[11px] font-semibold text-primary-600 hover:text-primary-800 flex items-center gap-1 hover:underline cursor-pointer"
            title="Open all purchase bills in Bill Print"
          >
            <Printer className="w-3 h-3" /> Open in Bill Print
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="text-center py-6 text-primary-400 text-xs">No purchases yet</p>
        ) : (
          <ul className="divide-y divide-primary-100">
            {recent.map((p) => (
              <li
                key={p._id}
                className="px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 hover:bg-primary-50/40 transition"
              >
                <div className="min-w-[160px]">
                  <span className="font-semibold text-primary-800">{p.vendor?.name || '—'}</span>
                  {p.vendor?.nameTelugu ? (
                    <span className="text-[11px] text-primary-400 ml-1.5">({p.vendor.nameTelugu})</span>
                  ) : null}
                  <div className="text-[11px] text-primary-500 mt-0.5">
                    {p.totalBags ? `${p.totalBags} bags · ` : ''}{formatKg(p.totalWeight)}
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="text-right">
                    <div className="font-bold text-primary-800 tabular-nums text-xs">{formatCurrency(p.totalAmount)}</div>
                    <div className="text-[11px] text-primary-400">{formatDate(p.purchaseDate)}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openPurchaseBillPreview(p)}
                    className="btn-primary !py-1 !px-2.5 !text-xs flex items-center gap-1 cursor-pointer shrink-0 shadow-2xs"
                    title="View & Print Purchase Bill"
                  >
                    <Eye className="w-3 h-3" />
                    <span>View Bill</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
