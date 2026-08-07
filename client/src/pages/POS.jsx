import { useEffect, useState } from 'react';
import { Plus, Trash2, Banknote } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import PosMaterialInput from '../components/PosMaterialInput';
import { formatCurrency } from '../utils/format';

const emptyItem = { materialId: '', materialName: '', quantityKg: '', pricePerKg: '' };

export default function POS() {
  const [materials, setMaterials] = useState([]);
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [customerName, setCustomerName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/materials').then((res) => setMaterials(res.data));
  }, []);

  const addItem = () => setItems([...items, { ...emptyItem }]);

  const removeItem = (idx) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, field, value) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    setItems(updated);
  };

  const handleMaterialSelect = (idx, { materialId, materialName, pricePerKg }) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], materialId, materialName, pricePerKg };
    setItems(updated);
  };

  const getExcludedMaterialIds = (rowIdx) =>
    items.filter((_, i) => i !== rowIdx).map((i) => i.materialId).filter(Boolean);

  const getItemTotal = (item) => (Number(item.quantityKg) || 0) * (Number(item.pricePerKg) || 0);
  const grandTotal = items.reduce((sum, item) => sum + getItemTotal(item), 0);
  const getSelectedMaterial = (materialId) => materials.find((m) => m._id === materialId);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const activeRows = items.filter((i) => i.materialId || i.materialName || i.quantityKg);
    if (activeRows.some((i) => !i.materialId)) {
      toast.error('Select a material from the suggestions list');
      return;
    }

    const validItems = items.filter((i) => i.materialId && i.quantityKg);
    if (validItems.length === 0) {
      toast.error('Add at least one item with material and quantity');
      return;
    }

    const missingPrice = validItems.find((i) => !Number(i.pricePerKg));
    if (missingPrice) {
      toast.error('Selected material has no selling price. Set it on the Materials page.');
      return;
    }

    const requestedQtyByMaterial = new Map();
    for (const item of validItems) {
      const requestedQty = (requestedQtyByMaterial.get(item.materialId) || 0) + Number(item.quantityKg);
      requestedQtyByMaterial.set(item.materialId, requestedQty);
      const material = getSelectedMaterial(item.materialId);
      if (material && requestedQty > Number(material.availableKg || 0)) {
        toast.error(`${material.name} has only ${material.availableKg || 0} kg available`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await api.post('/sales', {
        customerName: customerName || 'Walk-in Customer',
        items: validItems.map((i) => ({
          materialId: i.materialId,
          quantityKg: Number(i.quantityKg),
          pricePerKg: Number(i.pricePerKg),
        })),
      });
      const sale = res.data;
      const itemSummary = sale.items
        .map((item) => `${item.materialName}: ${item.quantityKg} kg`)
        .join(' · ');
      toast.success(
        `${formatCurrency(sale.totalAmount)} received in cash${itemSummary ? ` — ${itemSummary}` : ''}`,
        { duration: 5000 }
      );
      setItems([{ ...emptyItem }]);
      setCustomerName('');
      api.get('/materials').then((res) => setMaterials(res.data));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sale failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">POS Billing</h1>
        <p className="text-primary-400 text-sm mt-0.5">Bill customers — cash payment only</p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <div className="card !p-0 overflow-visible">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-primary-100">
              <label className="text-xs font-medium text-primary-400 shrink-0">Customer</label>
              <input
                className="input-field !py-2 !text-sm flex-1"
                placeholder="Walk-in Customer"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_80px_72px_32px] gap-2 px-4 py-2 bg-primary-50/80 border-b border-primary-100 text-xs font-medium text-primary-400 uppercase tracking-wide">
              <span>Material</span>
              <span className="text-right">Qty</span>
              <span className="text-right">Amount</span>
              <span />
            </div>

            <div className="divide-y divide-primary-100">
              {items.map((item, idx) => {
                const itemTotal = getItemTotal(item);

                return (
                  <div
                    key={idx}
                    className="grid grid-cols-[minmax(0,1fr)_72px_64px_32px] gap-2 px-3 sm:px-4 py-2 items-center"
                  >
                    <PosMaterialInput
                      materials={materials}
                      materialId={item.materialId}
                      materialName={item.materialName}
                      excludeIds={getExcludedMaterialIds(idx)}
                      onChange={(selection) => handleMaterialSelect(idx, selection)}
                    />

                    <input
                      type="number"
                      className="input-field !py-1.5 !px-2 !text-sm w-full text-right"
                      placeholder="kg"
                      min="0.1"
                      step="0.1"
                      value={item.quantityKg}
                      onChange={(e) => updateItem(idx, 'quantityKg', e.target.value)}
                      required
                    />

                    <p className="text-sm font-semibold text-primary-700 text-right truncate">
                      {formatCurrency(itemTotal)}
                    </p>

                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      className="p-1 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-3 border-t border-primary-100">
              <button type="button" onClick={addItem} className="btn-secondary w-full !py-2 !text-sm">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="card sticky top-4 !p-4">
            <div className="flex justify-between items-center mb-4">
              <span className="text-sm font-medium text-primary-500">Grand Total</span>
              <span className="text-2xl font-bold text-primary-700">{formatCurrency(grandTotal)}</span>
            </div>

            <div className="flex items-center gap-2 bg-accent-100/80 text-accent-600 rounded-lg px-3 py-2 mb-4">
              <Banknote className="w-4 h-4 shrink-0" />
              <span className="font-medium text-xs">Cash payment only</span>
            </div>

            <button type="submit" className="btn-primary w-full !py-3" disabled={saving || grandTotal <= 0}>
              {saving ? 'Processing...' : 'Complete Sale'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
