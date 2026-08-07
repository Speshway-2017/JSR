import { useEffect, useState } from 'react';
import { Plus, Package, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatKg } from '../utils/format';

export default function Materials() {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchMaterials = () => {
    api.get('/materials').then((res) => {
      setMaterials(res.data);
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMaterials();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/materials', { name: newName });
      toast.success('Material added!');
      setNewName('');
      setShowForm(false);
      fetchMaterials();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add material');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Materials</h1>
          <p className="text-primary-500 mt-1">View materials and available stock</p>
        </div>
        <button type="button" onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="w-5 h-5" /> Add Material
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-primary-800">Add Material</h2>
              <button type="button" onClick={() => setShowForm(false)} className="p-2 hover:bg-primary-50 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="label">Material Name *</label>
                <input
                  className="input-field"
                  placeholder="e.g. Mirchi"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
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
          <p className="text-primary-500 text-lg">No materials yet</p>
          <p className="text-primary-400 mt-2">Materials are auto-created when adding loads, or add them here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {materials.map((mat) => {
            const qty = mat.availableKg || 0;
            return (
              <div key={mat._id} className="card flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary-100 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-primary-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-primary-800 text-lg truncate">{mat.name}</h3>
                  <p className="text-sm text-primary-400 mt-0.5">Available quantity</p>
                  <p className={`text-xl font-bold mt-1 ${qty > 0 ? 'text-primary-700' : 'text-red-500'}`}>
                    {formatKg(qty)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
