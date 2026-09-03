import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Phone, MapPin, ChevronRight, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import MDIModalWindow from '../components/mdi/MDIModalWindow';
import { formatCurrency } from '../utils/format';
import { useDataRestored } from '../utils/useDataRestored';
import { useMDI } from '../context/MDIContext';

const emptyForm = {
  name: '',
  nameTelugu: '',
  mobile: '',
  city: '',
  address: '',
};

export default function Vendors() {
  const { openWindow } = useMDI();
  const [vendors, setVendors] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const fetchVendors = useCallback(() => {
    api.get('/vendors').then((res) => setVendors(res.data)).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  useDataRestored(fetchVendors);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/vendors', form);
      toast.success('Vendor added successfully!');
      setForm(emptyForm);
      setShowForm(false);
      fetchVendors();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add vendor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Vendors</h1>
          <p className="text-primary-500 mt-1">Suppliers who bring stock to admin</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-5 h-5" /> Add Vendor
        </button>
      </div>

      <MDIModalWindow
        open={showForm}
        title="Add New Vendor"
        iconName="UserRound"
        onClose={() => setShowForm(false)}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Vendor Name *</label>
            <input
              className="input-field"
              placeholder="e.g. Manoj"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Mobile Number *</label>
            <input
              className="input-field"
              placeholder="e.g. 9876543210"
              type="tel"
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">City *</label>
            <input
              className="input-field"
              placeholder="e.g. Hyderabad"
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Address *</label>
            <textarea
              className="input-field min-h-[80px] resize-none"
              placeholder="Full address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              required
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving...' : 'Save Vendor'}
            </button>
          </div>
        </form>
      </MDIModalWindow>

      {loading ? (
        <div className="text-center py-20 text-primary-400">Loading vendors...</div>
      ) : vendors.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-primary-500 text-lg">No vendors yet</p>
          <p className="text-primary-400 mt-2">Click "Add Vendor" to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vendors.map((vendor) => (
            <button
              key={vendor._id}
              type="button"
              onClick={() => openWindow({ path: `/vendors/${vendor._id}`, title: `Vendor: ${vendor.name}` })}
              className="card hover:shadow-lg hover:border-primary-200 transition group text-left cursor-pointer w-full"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold text-primary-800 group-hover:text-primary-600">
                    {vendor.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-primary-500 mt-1">
                    <Phone className="w-4 h-4" />
                    <span className="text-sm">{vendor.mobile}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-primary-500 mt-1">
                    <MapPin className="w-4 h-4" />
                    <span className="text-sm">{vendor.city}</span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-primary-300 group-hover:text-primary-500 mt-1" />
              </div>
              <div className="mt-4 pt-4 border-t border-primary-100">
                <p className="text-xs text-primary-400">Payable Balance</p>
                <p className="font-bold text-accent-600">{formatCurrency(vendor.creditBalance)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
