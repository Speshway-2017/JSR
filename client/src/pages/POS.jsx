import { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Banknote } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import PosMaterialInput from '../components/PosMaterialInput';
import { formatCurrency } from '../utils/format';
import { useDataRestored } from '../utils/useDataRestored';

const emptyItem = { materialId: '', materialName: '', quantityKg: '', pricePerKg: '' };

export default function POS() {
  const [materials, setMaterials] = useState([]);
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [customerName, setCustomerName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadMaterials = useCallback(() => {
    api.get('/materials').then((res) => setMaterials(res.data));
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  useDataRestored(loadMaterials);

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
        isPaid: true,
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
    <div className="space-y-3">
      <div>
        <h1 className="page-title text-2xl font-bold text-primary-700">POS Billing</h1>
        <p className="text-xs text-primary-500 mt-1">Bill customers — cash payment only</p>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2">
          <div className="card !p-0 overflow-visible border border-primary-200">
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-primary-100">
              <label className="text-xs font-semibold text-primary-600 shrink-0">Customer</label>
              <input
                className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition flex-1"
                placeholder="Walk-in Customer"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
              />
            </div>

            <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_90px_80px_36px] gap-2 px-4 py-2 bg-primary-50/80 border-b border-primary-200 text-xs font-semibold text-primary-700 uppercase tracking-wide">
              <span>Material</span>
              <span className="text-right">Qty (kg)</span>
              <span className="text-right">Amount</span>
              <span />
            </div>

            <div className="divide-y divide-primary-100">
              {items.map((item, idx) => {
                const itemTotal = getItemTotal(item);

                return (
                  <div
                    key={idx}
                    className="grid grid-cols-[minmax(0,1fr)_90px_80px_36px] gap-2 px-3 sm:px-4 py-2 items-center"
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
                      className="h-9 w-full rounded-lg border border-primary-200 bg-surface px-2.5 py-1 text-sm font-medium text-primary-700 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-200 transition text-right"
                      placeholder="kg"
                      min="0.1"
                      step="0.1"
                      value={item.quantityKg}
                      onChange={(e) => updateItem(idx, 'quantityKg', e.target.value)}
                      required
                    />

                    <p className="text-sm font-bold text-primary-800 text-right truncate">
                      {formatCurrency(itemTotal)}
                    </p>

                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                      aria-label="Remove item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-3 border-t border-primary-100">
              <button type="button" onClick={addItem} className="btn-secondary w-full !py-2 !text-sm font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="card sticky top-4 !p-4 border border-primary-200">
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-primary-100">
              <span className="text-xs font-semibold uppercase text-primary-600">Grand Total</span>
              <span className="text-2xl font-bold text-primary-800">{formatCurrency(grandTotal)}</span>
            </div>

            <div className="flex items-center gap-2 bg-accent-100/80 text-accent-700 border border-accent-200 rounded-lg px-3 py-2 mb-3">
              <Banknote className="w-4 h-4 shrink-0" />
              <span className="font-semibold text-xs">Cash payment only</span>
            </div>

            <button type="submit" className="btn-primary w-full !py-2.5 !text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer shadow-2xs" disabled={saving || grandTotal <= 0}>
              {saving ? 'Processing...' : 'Complete Sale'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
