import { useCallback, useEffect, useState } from 'react';
import { Save, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency } from '../utils/format';
import { DEDUCTION_FIELDS, emptyRatesState, ratesPayload } from '../utils/deductionFields';
import { useDataRestored } from '../utils/useDataRestored';

export default function PriceSettings() {
  const [form, setForm] = useState(() => emptyRatesState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(() => {
    api
      .get('/settings')
      .then((res) => setForm(emptyRatesState(res.data)))
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useDataRestored(fetchSettings);

  const perBagTotal = DEDUCTION_FIELDS.filter(
    (f) => form[`${f.key}PerBag`] && !(f.isCommission && !form[`${f.key}PerBag`])
  ).reduce((s, f) => s + (Number(form[f.key]) || 0), 0);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/settings', ratesPayload(form));
      setForm(emptyRatesState(res.data));
      toast.success('Price settings saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-16 text-primary-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-2.5 max-w-2xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-sm font-bold text-primary-800 flex items-center gap-1.5">
            <Settings className="w-4 h-4 text-emerald-600" /> Price Settings
          </h1>
          <p className="text-primary-400 text-[11px] mt-0.5">
            రైతుపట్టి deductions — toggle Per bag for each charge
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="card !p-3 space-y-2.5">
        <div className="hidden sm:grid grid-cols-[1fr_110px_90px] gap-2 px-1 text-[10px] font-semibold text-primary-500 uppercase tracking-wide border-b border-primary-100 pb-1.5">
          <span>Charge</span>
          <span>Amount</span>
          <span className="text-center">Per bag</span>
        </div>

        {DEDUCTION_FIELDS.map((field) => {
          const perBag = !!form[`${field.key}PerBag`];
          const isPct = field.isCommission && !perBag;
          return (
            <div
              key={field.key}
              className="grid grid-cols-1 sm:grid-cols-[1fr_110px_90px] gap-1.5 sm:gap-2 items-center border-b border-primary-50 pb-2"
            >
              <div>
                <p className="font-semibold text-xs text-primary-800">{field.label}</p>
                <p className="text-[11px] text-primary-500">{field.telugu}</p>
              </div>
              <div className="relative">
                {!isPct && (
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-400 text-xs">
                    ₹
                  </span>
                )}
                <input
                  type="number"
                  min="0"
                  max={isPct ? 100 : undefined}
                  step="0.01"
                  className={`h-8 w-full rounded-lg border border-primary-200 bg-surface py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition ${
                    isPct ? 'px-2.5 pr-6' : 'pl-6 pr-2.5'
                  }`}
                  value={form[field.key]}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                />
                {isPct && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-primary-400 text-xs">
                    %
                  </span>
                )}
              </div>
              <label className="flex items-center justify-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-3.5 h-3.5 accent-primary-600 rounded cursor-pointer"
                  checked={perBag}
                  onChange={(e) =>
                    setForm({ ...form, [`${field.key}PerBag`]: e.target.checked })
                  }
                />
                <span className="text-xs text-primary-600 sm:hidden">Per bag</span>
              </label>
              {field.isCommission && (
                <p className="sm:col-span-3 text-[10.5px] text-primary-400 -mt-1">
                  {perBag
                    ? 'Per bag: ₹ × bags'
                    : 'Off = % of sale value (default for commission)'}
                </p>
              )}
            </div>
          );
        })}

        <div className="bg-primary-50/80 border border-primary-100 rounded-lg px-3 py-1.5 flex justify-between items-center text-xs">
          <span className="text-primary-600 font-medium">Sum of per-bag rates</span>
          <span className="font-bold text-primary-800 tabular-nums">{formatCurrency(perBagTotal)}</span>
        </div>

        <div className="pt-2.5 border-t border-primary-100 space-y-2">
          <div>
            <h3 className="font-bold text-primary-800 text-xs">Sales Cooly (సేల్స్ కూలీ)</h3>
            <p className="text-[10.5px] text-primary-400">
              Default cooly rate per bag fetched automatically into Sales Entry when Cooly is applied
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">
                Sales Cooly (By Weight)
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-400 text-xs">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="h-8 w-full rounded-lg border border-primary-200 bg-surface pl-6 pr-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
                  value={form.salesCoolyRateByWeight ?? '17'}
                  onChange={(e) => setForm({ ...form, salesCoolyRateByWeight: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">
                Sales Cooly (By Bag)
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-400 text-xs">
                  ₹
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  className="h-8 w-full rounded-lg border border-primary-200 bg-surface pl-6 pr-2.5 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
                  value={form.salesCoolyRateByBag ?? '10'}
                  onChange={(e) => setForm({ ...form, salesCoolyRateByBag: e.target.value })}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="pt-2.5 border-t border-primary-100 space-y-2">
          <div>
            <h3 className="font-bold text-primary-800 text-xs">Bag less (తగ్గింపు / Bag tare deduction)</h3>
            <p className="text-[10.5px] text-primary-400">
              Default tare deduction in kg per bag subtracted from actual bag weight on రైతుపట్టి bills
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">
                Below 50 kgs (kg/bag)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 pr-8 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
                  value={form.bagLessUnder50 ?? '1'}
                  onChange={(e) => setForm({ ...form, bagLessUnder50: e.target.value })}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] text-primary-400 font-medium">
                  kg
                </span>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-primary-500 uppercase tracking-wide mb-0.5 block">
                Equal to or above 50 kgs (kg/bag)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2.5 pr-8 py-1 text-xs text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-100 transition"
                  value={form.bagLessOver50 ?? '2'}
                  onChange={(e) => setForm({ ...form, bagLessOver50: e.target.value })}
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10.5px] text-primary-400 font-medium">
                  kg
                </span>
              </div>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary !py-1.5 !px-4 !text-xs font-semibold flex items-center justify-center gap-1.5 w-full cursor-pointer shadow-2xs"
          disabled={saving}
        >
          <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
