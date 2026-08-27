import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Users, X, Pencil, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import Toggle from '../components/Toggle';
import { formatCurrency } from '../utils/format';
import { useTeluguPreview } from '../hooks/useTeluguPreview';
import { matchesSearchFields } from '../utils/search';
import { useDataRestored } from '../utils/useDataRestored';

const emptyForm = {
  name: '',
  nameTelugu: '',
  mobile: '',
  schedule: '',
  credit: '',
  handlingCharges: false,
};

const PAGE_SIZE = 20;

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState('');
  const [scheduleFilter, setScheduleFilter] = useState('');
  const [coolyFilter, setCoolyFilter] = useState('');
  const [page, setPage] = useState(1);
  const { telugu: liveTelugu, loading: teluguLoading } = useTeluguPreview(
    showForm ? form.name : ''
  );

  useEffect(() => {
    if (!showForm) return;
    setForm((prev) => {
      if (!prev.name.trim()) return { ...prev, nameTelugu: '' };
      if (teluguLoading && !liveTelugu) return prev;
      return { ...prev, nameTelugu: liveTelugu };
    });
  }, [liveTelugu, teluguLoading, showForm]);

  const fetchAll = useCallback(() => {
    Promise.all([api.get('/customers'), api.get('/schedules')])
      .then(([custRes, schedRes]) => {
        setCustomers(custRes.data);
        setSchedules(schedRes.data);
      })
      .catch(() => toast.error('Failed to load customer list'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useDataRestored(fetchAll);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name || '',
      nameTelugu: c.nameTelugu || '',
      mobile: c.mobile || '',
      schedule: c.schedule?._id || c.schedule || '',
      credit: '',
      handlingCharges: !!c.handlingCharges,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!form.schedule) {
      toast.error('Select a schedule');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        const { credit, ...rest } = form;
        await api.put(`/customers/${editing._id}`, rest);
        toast.success('Customer updated');
      } else {
        const creditAmount = form.credit === '' ? 0 : Number(form.credit);
        await api.post('/customers', {
          ...form,
          credit: Number.isFinite(creditAmount) ? Math.max(0, creditAmount) : 0,
        });
        toast.success('Customer added');
      }
      closeForm();
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save customer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete customer "${c.name}"?`)) return;
    try {
      await api.delete(`/customers/${c._id}`);
      toast.success('Customer deleted');
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete customer');
    }
  };

  const scheduleName = (c) => c.schedule?.name || '—';

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (scheduleFilter) {
        const sid = String(c.schedule?._id || c.schedule || '');
        if (sid !== scheduleFilter) return false;
      }
      if (coolyFilter === 'on' && !c.handlingCharges) return false;
      if (coolyFilter === 'off' && c.handlingCharges) return false;
      if (!query.trim()) return true;
      return matchesSearchFields(c, ['name', 'nameTelugu', 'mobile'], query);
    });
  }, [customers, query, scheduleFilter, coolyFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, scheduleFilter, coolyFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const pageButtons = () => {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
    const nums = new Set([1, pageCount, safePage - 1, safePage, safePage + 1]);
    return [...nums].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Customer List</h1>
          <p className="text-primary-400 text-sm mt-0.5">Add, edit, or delete customers</p>
        </div>
        <button type="button" onClick={openAdd} className="btn-primary !py-2 !px-4 !text-sm">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4">
          <form onSubmit={handleSubmit} className="card w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-primary-700">
                {editing ? 'Edit Customer' : 'Add Customer'}
              </h2>
              <button type="button" onClick={closeForm} className="p-2 hover:bg-primary-50 rounded-lg">
                <X className="w-5 h-5 text-primary-500" />
              </button>
            </div>
            <div>
              <label className="label">Name *</label>
              <input
                className="input-field"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoFocus
              />
              <p className="mt-1.5 min-h-[1.5rem] text-base text-primary-700 font-medium tracking-wide">
                {form.name.trim()
                  ? teluguLoading && !liveTelugu
                    ? '…'
                    : form.nameTelugu || liveTelugu || ''
                  : ''}
              </p>
              <p className="text-xs text-primary-400 -mt-1">తెలుగు</p>
            </div>
            <div>
              <label className="label">Phone</label>
              <input
                className="input-field"
                type="tel"
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Schedule *</label>
              <select
                className="input-field"
                value={form.schedule}
                onChange={(e) => setForm({ ...form, schedule: e.target.value })}
                required
              >
                <option value="">Select schedule</option>
                {schedules.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {schedules.length === 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  Create a schedule under Master → Schedule List first.
                </p>
              )}
            </div>
            {!editing && (
              <div>
                <label className="label">Credit</label>
                <input
                  className="input-field"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  value={form.credit}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d.]/g, '');
                    setForm({ ...form, credit: raw });
                  }}
                />
                <p className="text-xs text-primary-400 mt-1">
                  If entered, this becomes the customer’s credit balance.
                </p>
              </div>
            )}
            <Toggle
              checked={form.handlingCharges}
              onChange={(v) => setForm({ ...form, handlingCharges: v })}
              label="Cooly"
            />
            <div className="flex gap-3">
              <button type="button" onClick={closeForm} className="btn-secondary flex-1">
                Cancel
              </button>
              <button type="submit" className="btn-primary flex-1" disabled={saving || schedules.length === 0}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {customers.length > 0 && (
        <div className="card !p-3 sm:!p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[12rem]">
              <Search className="w-4 h-4 text-primary-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                className="input-field !pl-9 !h-12"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, తెలుగు or mobile..."
              />
            </div>
            <select
              className="input-field !h-12 !py-0 w-full sm:w-44"
              value={scheduleFilter}
              onChange={(e) => setScheduleFilter(e.target.value)}
            >
              <option value="">All schedules</option>
              {schedules.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              className="input-field !h-12 !py-0 w-full sm:w-36"
              value={coolyFilter}
              onChange={(e) => setCoolyFilter(e.target.value)}
            >
              <option value="">All cooly</option>
              <option value="on">Cooly on</option>
              <option value="off">Cooly off</option>
            </select>
          </div>
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
        <div className="card !p-0 overflow-hidden">
          {filtered.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-primary-400">No customers match this search</p>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-100 bg-primary-50/50">
                  <th className="text-left px-4 py-3 font-semibold text-primary-500">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-primary-500">Schedule</th>
                  <th className="text-left px-4 py-3 font-semibold text-primary-500">Mobile</th>
                  <th className="text-left px-4 py-3 font-semibold text-primary-500">Credit</th>
                  <th className="text-right px-4 py-3 font-semibold text-primary-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((c) => (
                  <tr key={c._id} className="border-b border-primary-50 hover:bg-primary-50/40">
                    <td className="px-4 py-3">
                      <Link
                        to={`/customers/${c._id}`}
                        className="font-medium text-primary-800 hover:text-primary-600"
                      >
                        {c.name}
                      </Link>
                      {c.nameTelugu ? (
                        <p className="text-xs text-primary-500 mt-0.5">{c.nameTelugu}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-primary-600">{scheduleName(c)}</td>
                    <td className="px-4 py-3 text-primary-500">{c.mobile || '—'}</td>
                    <td className="px-4 py-3 font-semibold text-accent-600">
                      {formatCurrency(c.creditBalance)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="btn-secondary !py-1.5 !px-2.5 !text-xs"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c)}
                          className="btn-secondary !py-1.5 !px-2.5 !text-xs text-red-600 hover:bg-red-50"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          {filtered.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-primary-100 bg-primary-50/40">
              <p className="text-xs text-primary-400">
                {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of{' '}
                {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="btn-secondary !py-1.5 !px-2 disabled:opacity-40"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {pageButtons().map((n, i, arr) => (
                  <span key={n} className="inline-flex items-center">
                    {i > 0 && arr[i - 1] !== n - 1 ? (
                      <span className="px-1 text-primary-300">…</span>
                    ) : null}
                    <button
                      type="button"
                      className={
                        n === safePage
                          ? 'btn-primary !py-1.5 !px-2.5 !text-xs min-w-[2rem] justify-center'
                          : 'btn-secondary !py-1.5 !px-2.5 !text-xs min-w-[2rem] justify-center'
                      }
                      onClick={() => setPage(n)}
                    >
                      {n}
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  className="btn-secondary !py-1.5 !px-2 disabled:opacity-40"
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
