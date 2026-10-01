import { useCallback, useEffect, useState } from 'react';
import { Plus, CalendarDays, X, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import MDIModalWindow from '../components/mdi/MDIModalWindow';
import { useDataRestored } from '../utils/useDataRestored';

export default function Schedules() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchSchedules = useCallback(() => {
    api
      .get('/schedules')
      .then((res) => setSchedules(res.data))
      .catch(() => toast.error('Failed to load schedule list'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  useDataRestored(fetchSchedules);

  const openAdd = () => {
    setEditing(null);
    setName('');
    setShowForm(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setName(row.name);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setName('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Schedule name is required');
      return;
    }

    const duplicate = schedules.find(
      (s) =>
        s.name.trim().toLowerCase() === trimmed.toLowerCase() &&
        (!editing || s._id !== editing._id)
    );
    if (duplicate) {
      toast.error(`"${duplicate.name}" already exists`);
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await api.put(`/schedules/${editing._id}`, { name: trimmed });
        toast.success('Schedule updated');
      } else {
        await api.post('/schedules', { name: trimmed });
        toast.success('Schedule added');
      }
      closeForm();
      fetchSchedules();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save schedule');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete schedule "${row.name}"?`)) return;
    try {
      await api.delete(`/schedules/${row._id}`);
      toast.success('Schedule deleted');
      fetchSchedules();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete schedule');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title text-2xl font-bold text-primary-700">Schedule List</h1>
          <p className="text-xs text-primary-500 mt-1">Create schedules by name for customers</p>
        </div>
        <button type="button" onClick={openAdd} className="btn-primary !py-1.5 !px-3.5 !text-sm font-semibold flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Schedule
        </button>
      </div>

      <MDIModalWindow
        open={showForm}
        title={editing ? 'Edit Schedule' : 'Add Schedule'}
        iconName="Calendar"
        onClose={closeForm}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">Schedule Name *</label>
            <input
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              placeholder="e.g. Morning Route"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="sticky bottom-0 bg-surface/95 backdrop-blur-xs pt-2.5 pb-0.5 border-t border-primary-100 flex gap-3 mt-2 z-10">
            <button type="button" onClick={closeForm} className="btn-secondary !py-2 !px-4 !text-sm font-semibold flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary !py-2 !px-4 !text-sm font-semibold flex-1" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </MDIModalWindow>

      {loading ? (
        <div className="text-center py-20 text-primary-400 text-xs">Loading schedules...</div>
      ) : schedules.length === 0 ? (
        <div className="card text-center py-16">
          <CalendarDays className="w-12 h-12 text-primary-300 mx-auto mb-3" />
          <p className="text-primary-700 text-base font-semibold">No schedules yet</p>
          <p className="text-primary-400 text-xs mt-1">Click Add Schedule to create a schedule name</p>
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden border border-primary-200">
          <div className="overflow-x-auto">
            <table className="w-full text-left table-fixed">
              <thead>
                <tr className="border-b border-primary-200 bg-primary-50/80">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-primary-700">Schedule</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-primary-700 w-[160px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((row) => (
                  <tr key={row._id} className="border-b border-primary-100 hover:bg-primary-50/40 transition">
                    <td className="px-4 py-2.5 font-bold text-primary-800 text-sm">{row.name}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="btn-secondary !py-1.5 !px-2.5 !text-xs font-semibold"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row)}
                          className="btn-secondary !py-1.5 !px-2.5 !text-xs font-semibold text-red-600 hover:bg-red-50"
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
        </div>
      )}
    </div>
  );
}
