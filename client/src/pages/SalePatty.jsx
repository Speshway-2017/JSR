import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Send, Share2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatKg } from '../utils/format';
import { matchesSearchFields } from '../utils/search';
import { openVendorBillPdf, generateSingleVendorBillHtml } from '../utils/vendorBillPdf';
import { DEDUCTION_FIELDS, emptyRatesState, ratesPayload } from '../utils/deductionFields';
import { useDataRestored } from '../utils/useDataRestored';
import { sendWhatsAppBillPdf } from '../utils/whatsappSender';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

import { useMDI } from '../context/MDIContext';
import { useSearchParams } from 'react-router-dom';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function isValidDateStr(str) {
  if (!str || typeof str !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(Date.parse(str));
}

function shiftDateStr(dateStr, days) {
  if (!isValidDateStr(dateStr)) return todayInputValue();
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function SalePatty({ path: windowPath }) {
  const { updateWindowPath } = useMDI();
  const isOnline = useOnlineStatus();

  const [searchParams] = useSearchParams();
  const effectiveSearchParams = useMemo(() => {
    if (windowPath && windowPath.includes('?')) {
      return new URLSearchParams(windowPath.split('?')[1]);
    }
    return searchParams;
  }, [windowPath, searchParams]);

  const [date, setDate] = useState(() => effectiveSearchParams.get('date') || todayInputValue());
  const [vendors, setVendors] = useState([]);
  const [vendorQuery, setVendorQuery] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [selectedMaterials, setSelectedMaterials] = useState([]);
  const [rates, setRates] = useState(() => emptyRatesState());
  const [saving, setSaving] = useState(false);
  const vendorListRef = useRef(null);
  const isInternalPathUpdate = useRef(false);

  useEffect(() => {
    if (isValidDateStr(date) && typeof updateWindowPath === 'function') {
      const current = effectiveSearchParams.get('date');
      if (current !== date) {
        isInternalPathUpdate.current = true;
        updateWindowPath('/sale-patty', `/sale-patty?date=${date}`);
      }
    }
  }, [date, updateWindowPath, effectiveSearchParams]);

  useEffect(() => {
    if (isInternalPathUpdate.current) {
      isInternalPathUpdate.current = false;
      return;
    }
    const pDate = effectiveSearchParams.get('date');
    if (pDate && isValidDateStr(pDate) && pDate !== date) {
      setDate(pDate);
    }
  }, [effectiveSearchParams]);

  const selected = vendors.find((v) => v._id === vendorId);

  const suggestions = useMemo(() => {
    if (!vendorQuery.trim()) return vendors.slice(0, 12);
    return vendors
      .filter((v) => matchesSearchFields(v, ['name', 'nameTelugu'], vendorQuery))
      .slice(0, 12);
  }, [vendors, vendorQuery]);

  useEffect(() => {
    setHighlight(-1);
  }, [vendorQuery, suggestions]);

  useEffect(() => {
    if (!suggestOpen || highlight < 0 || !vendorListRef.current) return;
    const el = vendorListRef.current.querySelector(`[data-idx="${highlight}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [highlight, suggestOpen]);

  const loadVendors = useCallback((targetDate) => {
    const d = targetDate || date;
    if (!isValidDateStr(d)) {
      setVendors([]);
      return;
    }
    api
      .get('/loads/vendors-by-date', { params: { date: d } })
      .then((res) => setVendors(res.data))
      .catch(() => {
        setVendors([]);
        toast.error('Failed to load vendors for date');
      });
  }, [date]);

  useEffect(() => {
    setVendorId('');
    setVendorQuery('');
    setPreview(null);
    setSelectedMaterials([]);
    if (isValidDateStr(date)) {
      loadVendors(date);
    } else {
      setVendors([]);
    }
  }, [date, loadVendors]);

  useDataRestored(() => {
    if (isValidDateStr(date)) loadVendors(date);
  });

  const fetchPreview = useCallback((vId, d, mats, preserveRates = false) => {
    if (!vId || !isValidDateStr(d)) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    const params = { vendorId: vId, date: d };
    if (mats && mats.length > 0) {
      params.materials = mats.join(',');
    }
    api
      .get('/loads/sale-patty', { params })
      .then((res) => {
        setPreview(res.data);
        if (!preserveRates) {
          const source = res.data.load?.billGenerated
            ? res.data.ratesUsed || {}
            : res.data.defaults || {};
          setRates(emptyRatesState(source));
        }
        if (mats === null || mats === undefined) {
          setSelectedMaterials(res.data.availableMaterials || []);
        }
      })
      .catch((err) => {
        setPreview(null);
        toast.error(err.response?.data?.message || 'Failed to load sale patty');
      })
      .finally(() => setLoadingPreview(false));
  }, []);

  useEffect(() => {
    if (!vendorId || !isValidDateStr(date)) {
      setPreview(null);
      setSelectedMaterials([]);
      return;
    }
    fetchPreview(vendorId, date, null, false);
  }, [vendorId, date, fetchPreview]);

  const availableItems = useMemo(() => {
    if (!preview) return [];
    if (preview.availableMaterialsSummary && preview.availableMaterialsSummary.length > 0) {
      return preview.availableMaterialsSummary;
    }
    if (preview.availableMaterials && preview.availableMaterials.length > 0) {
      return preview.availableMaterials.map((name) => ({ materialName: name }));
    }
    return [];
  }, [preview]);

  const allAvailableNames = useMemo(() => {
    return availableItems.map((item) => item.materialName);
  }, [availableItems]);

  const isAllSelected =
    allAvailableNames.length > 0 &&
    selectedMaterials.length === allAvailableNames.length;

  const handleToggleAll = () => {
    if (isAllSelected) {
      toast.error('Select at least one item');
      return;
    }
    const next = [...allAvailableNames];
    setSelectedMaterials(next);
    fetchPreview(vendorId, date, next, true);
  };

  const handleToggleItem = (name) => {
    let next;
    if (selectedMaterials.includes(name)) {
      if (selectedMaterials.length <= 1) {
        toast.error('Select at least one item');
        return;
      }
      next = selectedMaterials.filter((m) => m !== name);
    } else {
      next = [...selectedMaterials, name];
    }
    setSelectedMaterials(next);
    fetchPreview(vendorId, date, next, true);
  };

  const pickVendor = (v) => {
    setVendorId(v._id);
    setVendorQuery(v.name);
    setSuggestOpen(false);
    setHighlight(-1);
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!vendorId || !isValidDateStr(date)) {
      toast.error('Select date and vendor');
      return;
    }
    if (selectedMaterials.length === 0) {
      toast.error('Select at least one item');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/loads/sale-patty', {
        vendorId,
        date,
        materials: selectedMaterials,
        ...ratesPayload(rates),
      });
      setPreview(res.data);
      setRates(emptyRatesState(res.data.ratesUsed || ratesPayload(rates)));
      toast.success(res.data.load?.billGenerated ? 'Sale patty saved' : 'Sale patty generated');
      await openVendorBillPdf(res.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate sale patty');
    } finally {
      setSaving(false);
    }
  };

  const d = preview?.summary?.deductions;

  return (
    <div className="space-y-3 max-w-3xl">
      <div>
        <h1 className="page-title text-2xl font-bold text-primary-700">Sale Patty</h1>
        <p className="text-xs text-primary-500 mt-1">
          Pick a date, then a vendor who has sales that day — bill shows that day’s sales
        </p>
      </div>

      <div className="card !p-3.5 space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-primary-600 block">
              Date *
            </label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDate(shiftDateStr(date, -1))}
                className="px-2 py-0.5 text-xs rounded border border-primary-200 bg-surface text-primary-600 hover:bg-primary-50 transition cursor-pointer"
                title="Previous Day"
              >
                ◀ Prev Day
              </button>
              <button
                type="button"
                onClick={() => setDate(todayInputValue())}
                className="px-2 py-0.5 text-xs rounded border border-primary-200 bg-surface text-primary-600 hover:bg-primary-50 transition cursor-pointer"
                title="Today"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setDate(shiftDateStr(date, 1))}
                className="px-2 py-0.5 text-xs rounded border border-primary-200 bg-surface text-primary-600 hover:bg-primary-50 transition cursor-pointer"
                title="Next Day"
              >
                Next Day ▶
              </button>
            </div>
          </div>
          <input
            type="date"
            className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>

        <div className="relative">
          <label className="text-xs font-semibold text-primary-600 mb-1 block">
            Vendor *
          </label>
          <input
            className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
            value={vendorQuery}
            placeholder={
              vendors.length ? 'Type vendor name…' : 'No sales for any vendor on this date'
            }
            disabled={vendors.length === 0}
            autoComplete="off"
            onChange={(e) => {
              setVendorQuery(e.target.value);
              setVendorId('');
              setSuggestOpen(true);
            }}
            onFocus={() => {
              if (vendors.length > 0) setSuggestOpen(true);
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
          />
          {suggestOpen && suggestions.length > 0 && (
            <ul
              ref={vendorListRef}
              className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-primary-200 bg-surface shadow-lg text-sm"
            >
              {suggestions.map((v, idx) => (
                <li key={v._id}>
                  <button
                    type="button"
                    data-idx={idx}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${
                      idx === highlight
                        ? 'bg-primary-100 text-primary-900 font-medium'
                        : 'text-primary-700 hover:bg-primary-50'
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => pickVendor(v)}
                  >
                    <span>
                      <span className="font-semibold">{v.name}</span>
                      {v.nameTelugu ? <span className="text-primary-400 ml-1.5 text-xs">({v.nameTelugu})</span> : null}
                    </span>
                    {v.city ? <span className="text-primary-400 ml-2 text-xs uppercase font-normal">{v.city}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-primary-400 mt-1">
            Only vendors with a load on this date ({vendors.length})
          </p>
        </div>

        {/* Checkbox List of All and Individual Available Items below Vendor Field */}
        {vendorId && availableItems.length > 0 && (
          <div className="pt-2.5 border-t border-primary-100 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <label className="text-xs font-bold text-primary-700 uppercase tracking-wide block">
                  Select Items / వస్తువులు ({selectedMaterials.length}/{availableItems.length})
                </label>
                <p className="text-[11px] text-primary-500">
                  Choose which items to include in this Sale Patty bill
                </p>
              </div>
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-primary-800 bg-primary-100/70 hover:bg-primary-100 px-2.5 py-1 rounded-md border border-primary-200 select-none transition">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-primary-600 rounded cursor-pointer"
                  checked={isAllSelected}
                  onChange={handleToggleAll}
                />
                <span>All Items (అన్నీ)</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-0.5">
              {availableItems.map((item) => {
                const name = item.materialName;
                const isChecked = selectedMaterials.includes(name);
                return (
                  <label
                    key={name}
                    className={`flex items-start gap-2.5 p-2 rounded-lg border transition cursor-pointer select-none ${
                      isChecked
                        ? 'border-primary-400 bg-primary-50/80 text-primary-900 shadow-xs ring-1 ring-primary-300'
                        : 'border-primary-100 bg-surface/60 text-primary-400 hover:bg-primary-50/40 hover:border-primary-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="w-4 h-4 mt-0.5 accent-primary-600 rounded cursor-pointer shrink-0"
                      checked={isChecked}
                      onChange={() => handleToggleItem(name)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-bold uppercase truncate ${isChecked ? 'text-primary-800' : 'text-primary-500'}`}>
                          {name}
                        </span>
                        {item.totalAmount !== undefined && (
                          <span className={`text-xs font-semibold tabular-nums shrink-0 ${isChecked ? 'text-primary-700' : 'text-primary-400'}`}>
                            {formatCurrency(item.totalAmount)}
                          </span>
                        )}
                      </div>
                      {item.bagCount !== undefined && (
                        <div className={`text-[11px] mt-0.5 leading-tight ${isChecked ? 'text-primary-600' : 'text-primary-400'}`}>
                          {item.bagCount} bags · {formatKg(item.totalKg)}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {loadingPreview && (
        <div className="text-center py-6 text-primary-400 text-sm">Loading sales…</div>
      )}

      {preview && !loadingPreview && (
        <form onSubmit={handleGenerate} className="space-y-3">
          <div className="card !p-3.5 space-y-3">
            <div className="flex justify-between gap-3 items-start border-b border-primary-100 pb-2.5">
              <div>
                <h2 className="font-bold text-primary-800 text-sm sm:text-base">
                  {selected?.name || preview.vendor?.name}
                </h2>
                <p className="text-xs text-primary-500 mt-0.5">
                  Sales on {date} · {preview.saleCount || 0} sale(s) ·{' '}
                  {preview.summary?.totalBags || 0} bags
                </p>
              </div>
              {preview.load?.billGenerated && (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-primary-100 text-primary-800 border border-primary-300 uppercase tracking-wide">
                  Bill generated
                </span>
              )}
            </div>

            {preview.materials?.length === 0 ? (
              <p className="text-primary-400 text-sm py-3 text-center">
                No sales for this vendor on this date yet
              </p>
            ) : (
              <div className="space-y-2.5">
                {preview.materials.map((mat) => (
                  <div key={mat.materialName} className="rounded-lg border border-primary-100 bg-surface/50 p-2.5 space-y-1.5">
                    <h3 className="text-xs font-bold text-primary-700 uppercase tracking-wide">{mat.materialName}</h3>
                    <div className="space-y-1">
                      {mat.lines.map((line, i) => (
                        <div
                          key={i}
                          className="flex justify-between gap-3 text-sm text-primary-600 border-b border-primary-50 last:border-b-0 pb-1"
                        >
                          <span>
                            {line.bagCount} bags — {formatKg(line.totalKg)} —{' '}
                            {formatCurrency(line.ratePerKg)}/kg
                          </span>
                          <span className="font-semibold text-primary-800 tabular-nums">
                            {formatCurrency(line.totalAmount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card !p-3.5 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-primary-800 uppercase tracking-wide">Bill deductions</h3>
              <p className="text-xs text-primary-400 mt-0.5">
                Confirm rates before generate — toggle Per bag for each field
              </p>
            </div>
            <div className="hidden sm:grid grid-cols-[1fr_120px_80px] gap-2 text-xs font-semibold text-primary-500 uppercase tracking-wide border-b border-primary-100 pb-1.5">
              <span>Field</span>
              <span>Amount</span>
              <span className="text-center">Per bag</span>
            </div>
            {DEDUCTION_FIELDS.map((field) => {
              const perBag = !!rates[`${field.key}PerBag`];
              const isPct = field.isCommission && !perBag;
              return (
                <div
                  key={field.key}
                  className="grid grid-cols-[1fr_120px_80px] gap-2 items-center py-1 border-b border-primary-50 last:border-0"
                >
                  <div>
                    <p className="text-sm font-semibold text-primary-800">{field.telugu}</p>
                    <p className="text-xs text-primary-500 leading-tight">{field.label}</p>
                  </div>
                  <div className="relative">
                    <input
                      className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 pr-6 text-sm font-medium text-primary-700 tabular-nums focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
                      type="text"
                      inputMode="decimal"
                      value={rates[field.key]}
                      onChange={(e) =>
                        setRates({
                          ...rates,
                          [field.key]: e.target.value.replace(/[^\d.]/g, ''),
                        })
                      }
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-primary-400">
                      {isPct ? '%' : '₹'}
                    </span>
                  </div>
                  <label className="flex justify-center items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary-600 rounded cursor-pointer"
                      checked={perBag}
                      onChange={(e) =>
                        setRates({ ...rates, [`${field.key}PerBag`]: e.target.checked })
                      }
                    />
                  </label>
                </div>
              );
            })}

            <div className="pt-2.5 border-t border-primary-100 space-y-2">
              <h4 className="text-xs font-bold text-primary-700 uppercase tracking-wide">
                Bag less (తగ్గింపు / Bag tare weight deduction)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-primary-600 mb-1 block">
                    Below 50 kgs (kg/bag)
                  </label>
                  <div className="relative">
                    <input
                      className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 pr-8 text-sm font-medium text-primary-700 tabular-nums focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
                      type="text"
                      inputMode="decimal"
                      value={rates.bagLessUnder50 ?? '1'}
                      onChange={(e) =>
                        setRates({
                          ...rates,
                          bagLessUnder50: e.target.value.replace(/[^\d.]/g, ''),
                        })
                      }
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-primary-400 font-semibold">
                      kg
                    </span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-primary-600 mb-1 block">
                    Equal to or above 50 kgs (kg/bag)
                  </label>
                  <div className="relative">
                    <input
                      className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 pr-8 text-sm font-medium text-primary-700 tabular-nums focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
                      type="text"
                      inputMode="decimal"
                      value={rates.bagLessOver50 ?? '2'}
                      onChange={(e) =>
                        setRates({
                          ...rates,
                          bagLessOver50: e.target.value.replace(/[^\d.]/g, ''),
                        })
                      }
                    />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-primary-400 font-semibold">
                      kg
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {d && (
            <div className="card !p-3.5 space-y-2 text-sm">
              <div className="flex justify-between text-primary-600">
                <span className="font-medium">Gross Total</span>
                <span className="font-semibold tabular-nums text-primary-800">{formatCurrency(preview.summary.grossTotal)}</span>
              </div>
              <div className="flex justify-between text-primary-600">
                <span className="font-medium">Total Deductions</span>
                <span className="tabular-nums font-semibold text-red-600">-{formatCurrency(d.total)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-primary-900 pt-2 border-t border-primary-200">
                <span>Net Receivable</span>
                <span className="text-base font-bold text-primary-800 tabular-nums">{formatCurrency(preview.summary.receivable)}</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="submit"
              className="btn-primary !py-2 !px-4 !text-sm font-semibold flex items-center gap-1.5 shadow-xs"
              disabled={saving}
            >
              <FileText className="w-4 h-4" />
              {saving ? 'Saving…' : 'Generate / Print'}
            </button>
            {isOnline && (
              <button
                type="button"
                className="btn-secondary !py-2 !px-4 !text-sm font-semibold flex items-center gap-1.5 shadow-xs"
                onClick={async () => {
                  const vendorObj = preview.vendor || selected || {};
                  try {
                    const htmlString = await generateSingleVendorBillHtml(preview);
                    await sendWhatsAppBillPdf({
                      recipientPhone: vendorObj.mobile,
                      recipientName: vendorObj.name || 'Vendor',
                      htmlString,
                      filename: `Patti_Bill_${vendorObj.name || 'Vendor'}.pdf`,
                      caption: `Dear ${vendorObj.name || 'Vendor'}, your Sale Patti statement from JSR Traders is attached. Net Total: ${formatCurrency(preview.summary?.receivable)}. Thank you!`,
                    });
                  } catch (err) {
                    toast.error(err.message || 'Failed to share Patti');
                  }
                }}
              >
                <Share2 className="w-4 h-4 text-primary-600" />
                Share Patti
              </button>
            )}
            {preview.load?.billGenerated && (
              <button
                type="button"
                className="btn-secondary !py-2 !px-4 !text-sm font-semibold flex items-center gap-1.5 shadow-xs"
                onClick={() =>
                  openVendorBillPdf(preview).catch(() =>
                    toast.error('Failed to open Telugu bill PDF')
                  )
                }
              >
                Open PDF
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
