import { useCallback, useEffect, useState } from 'react';
import { Plus, Package, X, Trash2, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { useDataRestored } from '../utils/useDataRestored';
import MDIModalWindow from '../components/mdi/MDIModalWindow';

export default function SalesMaterials() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchMaterials = useCallback(() => {
    api
      .get('/sales-materials')
      .then((res) => setMaterials(res.data))
      .catch(() => toast.error('Failed to load sales materials'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  useDataRestored(fetchMaterials);

  const openAdd = () => {
    setEditing(null);
    setNewName('');
    setShowForm(true);
  };

  const openEdit = (mat) => {
    setEditing(mat);
    setNewName(mat.name);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setNewName('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      toast.error('Material name is required');
      return;
    }

    const duplicate = materials.find(
      (m) =>
        m.name.trim().toLowerCase() === trimmed.toLowerCase() &&
        (!editing || m._id !== editing._id)
    );
    if (duplicate) {
      toast.error(`"${duplicate.name}" already exists (capitalization ignored)`);
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        await api.put(`/sales-materials/${editing._id}`, { name: trimmed });
        toast.success('Material updated');
      } else {
        await api.post('/sales-materials', { name: trimmed });
        toast.success('Material added');
      }
      closeForm();
      fetchMaterials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save material');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (mat) => {
    if (!window.confirm(`Delete "${mat.name}" from sales materials?`)) return;
    try {
      await api.delete(`/sales-materials/${mat._id}`);
      toast.success('Material deleted');
      fetchMaterials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title text-2xl font-bold text-primary-700">Sales Materials</h1>
          <p className="text-xs text-primary-500 mt-1">
            Materials used when creating sales bag orders
          </p>
        </div>
        <button type="button" onClick={openAdd} className="btn-primary !py-1.5 !px-3.5 !text-sm font-semibold flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> Add Material
        </button>
      </div>

      <MDIModalWindow
        open={showForm}
        title={editing ? 'Edit Material' : 'Add Material'}
        iconName="Package"
        onClose={closeForm}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-primary-600 mb-1 block">Material Name *</label>
            <input
              className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition"
              placeholder="e.g. Mirchi"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="sticky bottom-0 bg-surface/95 backdrop-blur-xs pt-2.5 pb-0.5 border-t border-primary-100 flex gap-3 mt-2 z-10">
            <button type="button" onClick={closeForm} className="btn-secondary !py-2 !px-4 !text-sm font-semibold flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary !py-2 !px-4 !text-sm font-semibold flex-1" disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </MDIModalWindow>

      {loading ? (
        <div className="text-center py-20 text-primary-400 text-xs">Loading materials...</div>
      ) : materials.length === 0 ? (
        <div className="card text-center py-16">
          <Package className="w-12 h-12 text-primary-300 mx-auto mb-3" />
          <p className="text-primary-700 text-base font-semibold">No sales materials yet</p>
          <p className="text-primary-400 text-xs mt-1">
            Add materials here, then pick them while creating sales orders
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {materials.map((mat) => (
            <div key={mat._id} className="card !p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center shrink-0 border border-primary-200">
                <Package className="w-5 h-5 text-primary-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-primary-800 text-sm truncate">{mat.name}</h3>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(mat)}
                  className="p-1.5 rounded-lg text-primary-600 hover:bg-primary-50 transition cursor-pointer"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(mat)}
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
