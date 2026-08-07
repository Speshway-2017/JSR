import { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import MaterialAutocomplete from '../components/MaterialAutocomplete';
import { formatKg } from '../utils/format';

const emptyMaterial = { materialName: '', materialId: '', totalKg: '' };

export default function AddLoad() {
  const [vendors, setVendors] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [vendorId, setVendorId] = useState('');
  const [materialRows, setMaterialRows] = useState([{ ...emptyMaterial }]);
  const [handlingCharges, setHandlingCharges] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/vendors'), api.get('/materials')]).then(([v, m]) => {
      setVendors(v.data);
      setMaterials(m.data);
    });
  }, []);

  const totalWeight = materialRows.reduce((s, m) => s + (Number(m.totalKg) || 0), 0);

  const handleMaterialSelect = (idx, { materialId, materialName }) => {
    const updated = [...materialRows];
    updated[idx] = { ...updated[idx], materialId, materialName };
    setMaterialRows(updated);
  };

  const updateRow = (idx, field, value) => {
    const updated = [...materialRows];
    updated[idx] = { ...updated[idx], [field]: value };
    setMaterialRows(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vendorId) {
      toast.error('Select a vendor');
      return;
    }
    const valid = materialRows.filter((m) => m.materialName && Number(m.totalKg) > 0);
    if (!valid.length) {
      toast.error('Add at least one material with total weight');
      return;
    }

    setSaving(true);
    try {
      await api.post('/loads', {
        vendorId,
        materials: valid.map((m) => ({
          materialId: m.materialId || undefined,
          materialName: m.materialName,
          totalKg: Number(m.totalKg),
        })),
        handlingCharges: Number(handlingCharges) || 0,
        notes,
      });
      toast.success('Load saved — stock updated');
      setMaterialRows([{ ...emptyMaterial }]);
      setHandlingCharges('');
      setNotes('');
      setVendorId('');
      api.get('/materials').then((res) => setMaterials(res.data));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save load');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="page-title">Add Load</h1>
        <p className="text-primary-400 text-sm mt-0.5">Vendor brings stock — enter material and total weight</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card space-y-4">
          <div>
            <label className="label">Select Vendor *</label>
            <select className="input-field" value={vendorId} onChange={(e) => setVendorId(e.target.value)} required>
              <option value="">Choose vendor...</option>
              {vendors.map((v) => (
                <option key={v._id} value={v._id}>{v.name} — {v.city}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Handling Charges (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input-field"
              placeholder="Enter for this load"
              value={handlingCharges}
              onChange={(e) => setHandlingCharges(e.target.value)}
            />
            <p className="text-xs text-primary-400 mt-1">Entered manually for each load — used on vendor bill deductions</p>
          </div>
        </div>

        {materialRows.map((row, idx) => (
          <div key={idx} className="card space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-primary-700 flex items-center gap-2">
                <Package className="w-4 h-4" /> Material {idx + 1}
              </h3>
              {materialRows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setMaterialRows(materialRows.filter((_, i) => i !== idx))}
                  className="text-red-400 p-1.5 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <MaterialAutocomplete
              materials={materials}
              onMaterialsChange={setMaterials}
              value={row.materialName}
              materialId={row.materialId}
              onChange={(sel) => handleMaterialSelect(idx, sel)}
              required
            />
            <div>
              <label className="label">Total Weight (kg) *</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                className="input-field"
                placeholder="e.g. 250"
                value={row.totalKg}
                onChange={(e) => updateRow(idx, 'totalKg', e.target.value)}
                required
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setMaterialRows([...materialRows, { ...emptyMaterial }])}
          className="btn-secondary w-full !py-2.5"
        >
          <Plus className="w-4 h-4" /> Add Material
        </button>

        <div className="card space-y-3">
          <div>
            <label className="label">Notes</label>
            <input className="input-field" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
          <div className="flex justify-between items-center bg-primary-50 rounded-xl px-4 py-3">
            <span className="text-sm text-primary-500">Total weight</span>
            <span className="font-semibold text-primary-700">{formatKg(totalWeight)}</span>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={saving}>
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Load'}
          </button>
        </div>
      </form>
    </div>
  );
}
