import { useEffect, useState } from 'react';
import { Save, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency } from '../utils/format';
import { DEDUCTION_FIELDS, emptyRatesState, ratesPayload } from '../utils/deductionFields';

export default function PriceSettings() {
  const [form, setForm] = useState(() => emptyRatesState());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/settings')
      .then((res) => setForm(emptyRatesState(res.data)))
      .catch(() => toast.error('Failed to load settings'))
      .finally(() => setLoading(false));
  }, []);

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
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-16 text-primary-400">Loading settings...</div>;
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Settings className="w-7 h-7 text-primary-500" /> Price Settings
        </h1>
        <p className="text-primary-400 text-sm mt-0.5">
          రైతుపట్టి deductions — toggle Per bag for each charge
        </p>
      </div>

      <form onSubmit={handleSave} className="card space-y-3">
        <div className="hidden sm:grid grid-cols-[1fr_120px_100px] gap-3 px-1 text-xs font-semibold text-primary-400 uppercase tracking-wide">
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
              className="grid grid-cols-1 sm:grid-cols-[1fr_120px_100px] gap-2 sm:gap-3 items-center border-b border-primary-50 pb-3"
            >
              <div>
                <p className="font-medium text-primary-800">{field.label}</p>
                <p className="text-sm text-primary-500">{field.telugu}</p>
              </div>
              <div className="relative">
                {!isPct && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-400 text-sm">
                    ₹
                  </span>
                )}
                <input
                  type="number"
                  min="0"
                  max={isPct ? 100 : undefined}
                  step="0.01"
                  className={`input-field !py-2 ${isPct ? 'pr-8' : 'pl-7'}`}
                  value={form[field.key]}
                  onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                />
                {isPct && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-primary-400 text-sm">
                    %
                  </span>
                )}
              </div>
              <label className="flex items-center justify-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-primary-600"
                  checked={perBag}
                  onChange={(e) =>
                    setForm({ ...form, [`${field.key}PerBag`]: e.target.checked })
                  }
                />
                <span className="text-sm text-primary-600 sm:hidden">Per bag</span>
              </label>
              {field.isCommission && (
                <p className="sm:col-span-3 text-xs text-primary-400 -mt-1">
                  {perBag
                    ? 'Per bag: ₹ × bags'
                    : 'Off = % of sale value (default for commission)'}
                </p>
              )}
            </div>
          );
        })}

        <div className="bg-primary-50 rounded-xl px-4 py-3 flex justify-between items-center">
          <span className="text-sm text-primary-500">Sum of per-bag rates</span>
          <span className="font-semibold text-primary-700">{formatCurrency(perBagTotal)}</span>
        </div>

        <div className="pt-3 border-t border-primary-100 space-y-3">
          <div>
            <h3 className="font-semibold text-primary-800 text-sm">Bag less (తగ్గింపు / Bag tare weight deduction)</h3>
            <p className="text-xs text-primary-400">
              Default tare deduction in kg per bag subtracted from actual bag weight on రైతుపట్టి bills
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label text-xs">Below 50 kgs (kg/bag)</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className="input-field !py-2 pr-10"
                  value={form.bagLessUnder50 ?? '1'}
                  onChange={(e) => setForm({ ...form, bagLessUnder50: e.target.value })}
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
                  type="number"
                  min="0"
                  step="0.1"
                  className="input-field !py-2 pr-10"
                  value={form.bagLessOver50 ?? '2'}
                  onChange={(e) => setForm({ ...form, bagLessOver50: e.target.value })}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary-400 font-medium">
                  kg
                </span>
              </div>
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
