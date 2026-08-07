import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import Toggle from '../components/Toggle';
import { STATE_NAMES, getCitiesForState } from '../data/indiaLocations';
import { formatCurrency } from '../utils/format';

const emptyForm = {
  name: '',
  mobile: '',
  state: '',
  city: '',
  address: '',
  handlingCharges: false,
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const fetchCustomers = () => {
    api.get('/customers').then((res) => setCustomers(res.data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const cities = getCitiesForState(form.state);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/customers', form);
      toast.success('Customer added');
      setForm(emptyForm);
      setShowForm(false);
      fetchCustomers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="text-primary-400 text-sm mt-0.5">Buyers who purchase on credit</p>
        </div>
        <button type="button" onClick={() => setShowForm(true)} className="btn-primary !py-2 !px-4 !text-sm">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="card w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary-700">Add Customer</h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 hover:bg-primary-50 rounded-lg">
                <X className="w-5 h-5 text-primary-500" />
              </button>
            </div>
            <div>
              <label className="label">Name *</label>
              <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="label">Mobile</label>
              <input className="input-field" type="tel" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} />
            </div>
            <div>
              <label className="label">State *</label>
              <select
                className="input-field"
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value, city: '' })}
                required
              >
                <option value="">Select state</option>
                {STATE_NAMES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">City *</label>
              <select
                className="input-field"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                required
                disabled={!form.state}
              >
                <option value="">Select city</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Address</label>
              <textarea className="input-field min-h-[72px] resize-none" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <Toggle
              checked={form.handlingCharges}
              onChange={(v) => setForm({ ...form, handlingCharges: v })}
              label="Handling Charges Applicable"
            />
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" className="btn-primary flex-1" disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-primary-400">Loading...</div>
      ) : customers.length === 0 ? (
        <div className="card text-center py-12">
          <Users className="w-10 h-10 text-primary-300 mx-auto mb-2" />
          <p className="text-primary-400 text-sm">No customers yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {customers.map((c) => (
            <Link key={c._id} to={`/customers/${c._id}`} className="card hover:border-primary-200 transition group">
              <h3 className="font-semibold text-primary-700 group-hover:text-primary-600">{c.name}</h3>
              <p className="text-sm text-primary-400 mt-1">{c.city}, {c.state}</p>
              {c.mobile && <p className="text-sm text-primary-500 mt-0.5">{c.mobile}</p>}
              <p className="mt-3 text-sm">
                <span className="text-primary-400">Credit: </span>
                <span className="font-semibold text-accent-600">{formatCurrency(c.creditBalance)}</span>
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
