import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Phone, MapPin, ChevronRight, X, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import MDIModalWindow from '../components/mdi/MDIModalWindow';
import { formatCurrency } from '../utils/format';
import { searchAndSortItems } from '../utils/search';
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
  const [query, setQuery] = useState('');
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

  const filteredVendors = useMemo(() => {
    return searchAndSortItems(vendors, ['name', 'nameTelugu'], query);
  }, [vendors, query]);

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
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title text-2xl font-bold text-primary-700">Vendors</h1>
          <p className="text-xs text-primary-500 mt-1">Suppliers who bring stock to admin</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary !py-1.5 !px-3.5 !text-sm font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs">
          <Plus className="w-4 h-4" /> Add Vendor
        </button>
      </div>

      <MDIModalWindow
        open={showForm}
        title="Add New Vendor"
        iconName="UserRound"
        onClose={() => setShowForm(false)}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">Vendor Name *</label>
            <input
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              placeholder="e.g. Manoj"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-semibold text-primary-600 mb-1 block">Mobile Number *</label>
              <input
                className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
                placeholder="e.g. 9876543210"
                type="tel"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-primary-600 mb-1 block">City *</label>
              <input
                className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
                placeholder="e.g. Hyderabad"
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                required
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">Address *</label>
            <textarea
              className="w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1.5 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition min-h-[50px] sm:min-h-[64px] resize-none"
              placeholder="Full address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              required
            />
          </div>
          <div className="sticky bottom-0 bg-surface/95 backdrop-blur-xs pt-2.5 pb-0.5 border-t border-primary-100 flex gap-3 mt-2 z-10">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary !py-2 !px-4 !text-sm font-semibold flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary !py-2 !px-4 !text-sm font-semibold flex-1" disabled={saving}>
              {saving ? 'Saving...' : 'Save Vendor'}
            </button>
          </div>
        </form>
      </MDIModalWindow>

      {vendors.length > 0 && (
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-primary-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            className="h-9 w-full rounded-lg border border-primary-200 bg-surface pl-9 pr-2.5 py-1 text-sm font-medium text-primary-700 placeholder:text-primary-300 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vendor name..."
          />
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-primary-400 text-xs">Loading vendors...</div>
      ) : vendors.length === 0 ? (
        <div className="card text-center py-16">
          <p className="text-primary-700 text-base font-semibold">No vendors yet</p>
          <p className="text-primary-400 text-xs mt-1">Click "Add Vendor" to get started</p>
        </div>
      ) : filteredVendors.length === 0 ? (
        <div className="card text-center py-12 text-primary-400 text-xs">
          No vendors match "{query}"
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredVendors.map((vendor) => (
            <button
              key={vendor._id}
              type="button"
              onClick={() => openWindow({ path: `/vendors/${vendor._id}`, title: `Vendor: ${vendor.name}` })}
              className="card !p-3.5 hover:shadow-md hover:border-primary-300 transition group text-left cursor-pointer w-full border border-primary-200 bg-surface"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-bold text-primary-800 group-hover:text-primary-600 transition">
                    {vendor.name}
                  </h3>
                  <div className="flex items-center gap-1.5 text-primary-600 text-xs mt-1">
                    <Phone className="w-3.5 h-3.5 text-primary-400" />
                    <span>{vendor.mobile}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-primary-600 text-xs mt-1">
                    <MapPin className="w-3.5 h-3.5 text-primary-400" />
                    <span>{vendor.city}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-primary-300 group-hover:text-primary-500 transition mt-1" />
              </div>
              <div className="mt-3 pt-2.5 border-t border-primary-100 flex items-center justify-between">
                <p className="text-xs font-semibold text-primary-500 uppercase tracking-wide">Payable Balance</p>
                <p className="text-sm font-bold text-accent-700">{formatCurrency(vendor.creditBalance)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
