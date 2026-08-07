import { useEffect, useState } from 'react';
import { Save, Settings } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency } from '../utils/format';

const BAG_FIELDS = [
  { key: 'labour', label: 'Labour', hint: 'Per bag' },
  { key: 'aaseelu', label: 'Aaseelu', hint: 'Per bag' },
  { key: 'bill', label: 'Bill', hint: 'Per bag' },
  { key: 'unionCharges', label: 'Union Charges', hint: 'Per bag' },
];

export default function PriceSettings() {
  const [form, setForm] = useState({
    labour: '',
    aaseelu: '',
    bill: '',
    unionCharges: '',
    commissionPercent: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/settings')
      .then((res) => {
        setForm({
          labour: res.data.labour ?? 0,
          aaseelu: res.data.aaseelu ?? 0,
          bill: res.data.bill ?? 0,
          unionCharges: res.data.unionCharges ?? 0,
          commissionPercent: res.data.commissionPercent ?? 0,
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const perBagTotal =
    (Number(form.labour) || 0) +
    (Number(form.aaseelu) || 0) +
    (Number(form.bill) || 0) +
    (Number(form.unionCharges) || 0);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/settings', {
        labour: Number(form.labour) || 0,
        aaseelu: Number(form.aaseelu) || 0,
        bill: Number(form.bill) || 0,
        unionCharges: Number(form.unionCharges) || 0,
        commissionPercent: Number(form.commissionPercent) || 0,
      });
      setForm({
        labour: res.data.labour,
        aaseelu: res.data.aaseelu,
        bill: res.data.bill,
        unionCharges: res.data.unionCharges,
        commissionPercent: res.data.commissionPercent,
      });
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
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="page-title flex items-center gap-2">
          <Settings className="w-7 h-7 text-primary-500" /> Price Settings
        </h1>
        <p className="text-primary-400 text-sm mt-0.5">
          Charges deducted on vendor load bills
        </p>
      </div>

      <form onSubmit={handleSave} className="card space-y-4">
        {BAG_FIELDS.map(({ key, label, hint }) => (
          <div key={key}>
            <label className="label">
              {label} <span className="font-normal text-primary-400">({hint})</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary-400">₹</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="input-field pl-8"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </div>
          </div>
        ))}

        <div className="bg-primary-50 rounded-xl px-4 py-3 flex justify-between items-center">
          <span className="text-sm text-primary-500">Total per bag</span>
          <span className="font-semibold text-primary-700">{formatCurrency(perBagTotal)}</span>
        </div>

        <div className="border-t border-primary-100 pt-4">
          <label className="label">
            Commission <span className="font-normal text-primary-400">(% of sale value)</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              className="input-field pr-10"
              value={form.commissionPercent}
              onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-primary-400">%</span>
          </div>
          <p className="text-xs text-primary-400 mt-1">Deducted from total sale amount on the vendor bill</p>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
