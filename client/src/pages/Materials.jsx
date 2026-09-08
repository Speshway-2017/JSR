import { useCallback, useEffect, useState } from 'react';
import { Plus, Package, X, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import MDIModalWindow from '../components/mdi/MDIModalWindow';
import { useTeluguPreview } from '../hooks/useTeluguPreview';
import { useDataRestored } from '../utils/useDataRestored';

export default function Materials() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [name, setName] = useState('');
  const [nameTelugu, setNameTelugu] = useState('');
  const [saving, setSaving] = useState(false);
  const [isTeluguCustomized, setIsTeluguCustomized] = useState(false);

  const { telugu: liveTelugu, loading: teluguLoading } = useTeluguPreview(
    showForm ? name : ''
  );

  useEffect(() => {
    if (!showForm) return;
    if (!name.trim()) {
      setNameTelugu('');
      setIsTeluguCustomized(false);
      return;
    }
    if (!isTeluguCustomized) {
      if (teluguLoading && !liveTelugu) return;
      setNameTelugu(liveTelugu);
    }
  }, [liveTelugu, teluguLoading, showForm, name, isTeluguCustomized]);

  const fetchMaterials = useCallback(() => {
    api
      .get('/materials')
      .then((res) => setMaterials(res.data))
      .catch(() => toast.error('Failed to load product list'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchMaterials();
  }, [fetchMaterials]);

  useDataRestored(fetchMaterials);

  const openAdd = () => {
    setEditing(null);
    setName('');
    setNameTelugu('');
    setIsTeluguCustomized(false);
    setShowForm(true);
  };

  const openEdit = (mat) => {
    setEditing(mat);
    setName(mat.name);
    setNameTelugu(mat.nameTelugu || '');
    setIsTeluguCustomized(!!mat.nameTelugu);
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setName('');
    setNameTelugu('');
    setIsTeluguCustomized(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Product name is required');
      return;
    }

    const duplicate = materials.find(
      (m) =>
        m.name.trim().toLowerCase() === trimmed.toLowerCase() &&
        (!editing || m._id !== editing._id)
    );
    if (duplicate) {
      toast.error(`"${duplicate.name}" already exists`);
      return;
    }

    const payload = {
      name: trimmed,
      nameTelugu: nameTelugu.trim(),
    };

    setSaving(true);
    try {
      if (editing) {
        await api.put(`/materials/${editing._id}`, payload);
        toast.success('Product updated');
      } else {
        await api.post('/materials', payload);
        toast.success('Product added');
      }
      closeForm();
      fetchMaterials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (mat) => {
    if (!window.confirm(`Delete product "${mat.name}"?`)) return;
    try {
      await api.delete(`/materials/${mat._id}`);
      toast.success('Product deleted');
      fetchMaterials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete product');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Product List</h1>
          <p className="text-primary-400 text-sm mt-0.5">Add, edit, or delete products</p>
        </div>
        <button type="button" onClick={openAdd} className="btn-primary !py-2 !px-4 !text-sm">
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      <MDIModalWindow
        open={showForm}
        title={editing ? 'Edit Product' : 'Add Product'}
        iconName="Package"
        onClose={closeForm}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name (English) *</label>
            <input
              className="input-field"
              placeholder="e.g. Potato"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="label">Name (Telugu) / పేరు (తెలుగు)</label>
              {teluguLoading && <span className="text-xs text-primary-400">Translating...</span>}
            </div>
            <input
              className="input-field"
              placeholder="e.g. బంగాళాదుంప"
              value={nameTelugu}
              onChange={(e) => {
                setNameTelugu(e.target.value);
                setIsTeluguCustomized(true);
              }}
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={closeForm} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </MDIModalWindow>

      {loading ? (
        <div className="text-center py-20 text-primary-400">Loading products...</div>
      ) : materials.length === 0 ? (
        <div className="card text-center py-16">
          <Package className="w-12 h-12 text-primary-300 mx-auto mb-3" />
          <p className="text-primary-500 text-lg">No products yet</p>
          <p className="text-primary-400 mt-2">Click Add to create a product</p>
        </div>
      ) : (
        <div className="card !p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-primary-100 bg-primary-50/50">
                  <th className="text-left px-4 py-3 font-semibold text-primary-500">Item</th>
                  <th className="text-right px-4 py-3 font-semibold text-primary-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((mat) => (
                    <tr key={mat._id} className="border-b border-primary-50 hover:bg-primary-50/40">
                      <td className="px-4 py-3">
                        <p className="font-medium text-primary-800">{mat.name}</p>
                        {mat.nameTelugu ? (
                          <p className="text-xs text-primary-500 mt-0.5">{mat.nameTelugu}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEdit(mat)}
                            className="btn-secondary !py-1.5 !px-2.5 !text-xs"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(mat)}
                            className="btn-secondary !py-1.5 !px-2.5 !text-xs text-red-600 hover:bg-red-50"
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
