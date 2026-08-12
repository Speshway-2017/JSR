import { useEffect, useState } from 'react';
import { Plus, Package, X, Trash2, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';

export default function SalesMaterials() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchMaterials = () => {
    api
      .get('/sales-materials')
      .then((res) => setMaterials(res.data))
      .catch(() => toast.error('Failed to load sales materials'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMaterials();
  }, []);

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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Sales Materials</h1>
          <p className="text-primary-500 mt-1">
            Materials used when creating sales bag orders
          </p>
        </div>
        <button type="button" onClick={openAdd} className="btn-primary">
          <Plus className="w-5 h-5" /> Add Material
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-primary-800">
                {editing ? 'Edit Material' : 'Add Material'}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="p-2 hover:bg-primary-50 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Material Name *</label>
                <input
                  className="input-field"
                  placeholder="e.g. Mirchi"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={closeForm} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? 'Saving...' : editing ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-primary-400">Loading materials...</div>
      ) : materials.length === 0 ? (
        <div className="card text-center py-16">
          <Package className="w-12 h-12 text-primary-300 mx-auto mb-3" />
          <p className="text-primary-500 text-lg">No sales materials yet</p>
          <p className="text-primary-400 mt-2">
            Add materials here, then pick them while creating sales orders
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {materials.map((mat) => (
            <div key={mat._id} className="card flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-primary-600" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-primary-800 text-lg truncate">{mat.name}</h3>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(mat)}
                  className="p-2 rounded-lg text-primary-500 hover:bg-primary-50"
                  title="Edit"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(mat)}
                  className="p-2 rounded-lg text-red-500 hover:bg-red-50"
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
