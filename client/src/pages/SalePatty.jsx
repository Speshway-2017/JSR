import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatKg } from '../utils/format';
import { matchesSearchFields } from '../utils/search';
import { openVendorBillPdf } from '../utils/vendorBillPdf';
import { DEDUCTION_FIELDS, emptyRatesState, ratesPayload } from '../utils/deductionFields';
import { useDataRestored } from '../utils/useDataRestored';

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export default function SalePatty() {
  const [date, setDate] = useState(todayInputValue());
  const [vendors, setVendors] = useState([]);
  const [vendorQuery, setVendorQuery] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [preview, setPreview] = useState(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [rates, setRates] = useState(() => emptyRatesState());
  const [saving, setSaving] = useState(false);

  const selected = vendors.find((v) => v._id === vendorId);

  const suggestions = useMemo(() => {
    if (!vendorQuery.trim()) return vendors.slice(0, 12);
    return vendors
      .filter((v) => matchesSearchFields(v, ['name', 'nameTelugu', 'city', 'mobile'], vendorQuery))
      .slice(0, 12);
  }, [vendors, vendorQuery]);

  const loadVendors = useCallback(() => {
    api
      .get('/loads/vendors-by-date', { params: { date } })
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
    loadVendors();
  }, [date, loadVendors]);

  useDataRestored(loadVendors);

  useEffect(() => {
    if (!vendorId || !date) {
      setPreview(null);
      return;
    }
    setLoadingPreview(true);
    api
      .get('/loads/sale-patty', { params: { vendorId, date } })
      .then((res) => {
        setPreview(res.data);
        const source = res.data.load?.billGenerated
          ? res.data.ratesUsed || {}
          : res.data.defaults || {};
        setRates(emptyRatesState(source));
      })
      .catch((err) => {
        setPreview(null);
        toast.error(err.response?.data?.message || 'Failed to load sale patty');
      })
      .finally(() => setLoadingPreview(false));
  }, [vendorId, date]);

  const pickVendor = (v) => {
    setVendorId(v._id);
    setVendorQuery(v.name);
    setSuggestOpen(false);
    setHighlight(-1);
  };

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!vendorId || !date) {
      toast.error('Select date and vendor');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/loads/sale-patty', {
        vendorId,
        date,
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
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="page-title">Sale Patty</h1>
        <p className="text-primary-400 text-sm mt-0.5">
          Pick a date, then a vendor who has sales that day — bill shows that day’s sales
        </p>
      </div>

      <div className="card space-y-4">
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

        <div className="relative">
          <label className="label">Vendor *</label>
          <input
            className="input-field"
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
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' && suggestions.length) {
                e.preventDefault();
                setSuggestOpen(true);
                setHighlight((h) => (h < 0 ? 0 : Math.min(h + 1, suggestions.length - 1)));
              } else if (e.key === 'ArrowUp' && suggestions.length) {
                e.preventDefault();
                setHighlight((h) => (h <= 0 ? 0 : h - 1));
              } else if (e.key === 'Enter' && suggestOpen && suggestions.length) {
                e.preventDefault();
                pickVendor(suggestions[highlight >= 0 ? highlight : 0]);
              }
            }}
          />
          {suggestOpen && suggestions.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-xl border border-primary-200 bg-surface shadow-card">
              {suggestions.map((v, idx) => (
                <li key={v._id}>
                  <button
                    type="button"
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
                    {v.city ? <span className="text-primary-400 ml-2 text-xs">{v.city}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-primary-400 mt-1">
            Only vendors with a load on this date ({vendors.length})
          </p>
        </div>
      </div>

      {loadingPreview && (
        <div className="text-center py-10 text-primary-400 text-sm">Loading sales…</div>
      )}

      {preview && !loadingPreview && (
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="card space-y-3">
            <div className="flex justify-between gap-3 items-start">
              <div>
                <h2 className="font-bold text-primary-800 text-lg">
                  {selected?.name || preview.vendor?.name}
                </h2>
                <p className="text-sm text-primary-500">
                  Sales on {date} · {preview.saleCount || 0} sale(s) ·{' '}
                  {preview.summary?.totalBags || 0} bags
                </p>
              </div>
              {preview.load?.billGenerated && (
                <span className="text-xs font-semibold text-accent-600">Bill generated</span>
              )}
            </div>

            {preview.materials?.length === 0 ? (
              <p className="text-primary-400 text-sm py-4 text-center">
                No sales for this vendor on this date yet
              </p>
            ) : (
              <div className="space-y-4">
                {preview.materials.map((mat) => (
                  <div key={mat.materialName}>
                    <h3 className="font-semibold text-primary-700 mb-1.5">{mat.materialName}</h3>
                    <div className="space-y-1">
                      {mat.lines.map((line, i) => (
                        <div
                          key={i}
                          className="flex justify-between gap-3 text-sm text-primary-600 border-b border-primary-50 pb-1"
                        >
                          <span>
                            {line.bagCount} bags — {formatKg(line.totalKg)} —{' '}
                            {formatCurrency(line.ratePerKg)}/kg
                          </span>
                          <span className="font-semibold text-primary-800">
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

          <div className="card space-y-3">
            <div>
              <h3 className="font-semibold text-primary-800">Bill deductions</h3>
              <p className="text-xs text-primary-400 mt-0.5">
                Confirm rates before generate — toggle Per bag for each field
              </p>
            </div>
            <div className="hidden sm:grid grid-cols-[1fr_100px_88px] gap-2 text-xs font-semibold text-primary-400 uppercase">
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
                  className="grid grid-cols-[1fr_100px_88px] gap-2 items-center"
                >
                  <div>
                    <p className="text-sm font-medium text-primary-800">{field.telugu}</p>
                    <p className="text-xs text-primary-400">{field.label}</p>
                  </div>
                  <div className="relative">
                    <input
                      className="input-field !py-2"
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
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-primary-400">
                      {isPct ? '%' : '₹'}
                    </span>
                  </div>
                  <label className="flex justify-center">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary-600"
                      checked={perBag}
                      onChange={(e) =>
                        setRates({ ...rates, [`${field.key}PerBag`]: e.target.checked })
                      }
                    />
                  </label>
                </div>
              );
            })}

            <div className="pt-3 border-t border-primary-100 space-y-2">
              <h4 className="font-semibold text-primary-800 text-sm">Bag less (తగ్గింపు / Bag tare weight deduction)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label text-xs">Below 50 kgs (kg/bag)</label>
                  <div className="relative">
                    <input
                      className="input-field !py-2 pr-10"
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
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary-400 font-medium">
                      kg
                    </span>
                  </div>
                </div>
                <div>
                  <label className="label text-xs">Equal to or above 50 kgs (kg/bag)</label>
                  <div className="relative">
                    <input
                      className="input-field !py-2 pr-10"
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
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary-400 font-medium">
                      kg
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {d && (
            <div className="card space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-primary-500">Gross</span>
                <span className="font-semibold">{formatCurrency(preview.summary.grossTotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-primary-500">Deductions</span>
                <span>{formatCurrency(d.total)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-primary-800 pt-2 border-t border-primary-100">
                <span>Net Total</span>
                <span>{formatCurrency(preview.summary.receivable)}</span>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn-primary" disabled={saving}>
              <FileText className="w-4 h-4" />
              {saving ? 'Saving…' : 'Generate / Print'}
            </button>
            {preview.load?.billGenerated && (
              <button
                type="button"
                className="btn-secondary"
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
