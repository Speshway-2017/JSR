import { useEffect, useState, useRef } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api';
import { formatCurrency, formatDate, formatKg } from '../utils/format';
import { openCustomerSaleBillPdf } from '../utils/customerSaleBillPdf';

const emptyLine = () => ({
  materialId: '',
  materialName: '',
  ratePerKg: '',
  bags: [''],
});

export default function Sell() {
  const [customers, setCustomers] = useState([]);
  const [pendingLoads, setPendingLoads] = useState([]);
  const [loadStock, setLoadStock] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [loadId, setLoadId] = useState('');
  const [lines, setLines] = useState([emptyLine()]);
  const [handlingCharges, setHandlingCharges] = useState('');
  const [saving, setSaving] = useState(false);
  const [focusTarget, setFocusTarget] = useState(null);
  const bagInputRefs = useRef({});

  useEffect(() => {
    if (!focusTarget) return;
    const el = bagInputRefs.current[`${focusTarget.lineIdx}-${focusTarget.bagIdx}`];
    if (el) {
      el.focus();
      setFocusTarget(null);
    }
  }, [lines, focusTarget]);

  const handleBagEnter = (e, lineIdx, bagIdx) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const weight = Number(lines[lineIdx].bags[bagIdx]);
    if (!weight || weight <= 0) {
      toast.error('Enter bag weight first');
      return;
    }

    const bags = lines[lineIdx].bags;
    if (bagIdx === bags.length - 1) {
      updateLine(lineIdx, { bags: [...bags, ''] });
    }
    setFocusTarget({ lineIdx, bagIdx: bagIdx + 1 });
  };

  const customer = customers.find((c) => c._id === customerId);
  const hasHandling = !!customer?.handlingCharges;
  const selectedLoad = pendingLoads.find((l) => l._id === loadId);

  const refreshPendingLoads = () =>
    api.get('/loads?status=pending').then((res) => setPendingLoads(res.data));

  useEffect(() => {
    Promise.all([api.get('/customers'), refreshPendingLoads()]).then(([c]) => {
      setCustomers(c.data);
    });
  }, []);

  useEffect(() => {
    if (!loadId) {
      setLoadStock([]);
      return;
    }
    api
      .get(`/loads/${loadId}/stock`)
      .then((res) => setLoadStock(res.data))
      .catch(() => setLoadStock([]));
  }, [loadId]);

  const updateLine = (idx, patch) => {
    const updated = [...lines];
    updated[idx] = { ...updated[idx], ...patch };
    setLines(updated);
  };

  const selectMaterial = (idx, materialId) => {
    const mat = loadStock.find((m) => String(m.materialId) === String(materialId));
    updateLine(idx, {
      materialId,
      materialName: mat?.materialName || '',
      ratePerKg: mat?.sellingPricePerKg ?? '',
    });
  };

  const updateBag = (lineIdx, bagIdx, value) => {
    const updated = [...lines];
    const bags = [...updated[lineIdx].bags];
    bags[bagIdx] = value;
    updated[lineIdx] = { ...updated[lineIdx], bags };
    setLines(updated);
  };

  const lineTotals = (line) => {
    const bags = line.bags.map(Number).filter((n) => n > 0);
    const totalKg = bags.reduce((s, n) => s + n, 0);
    const amount = totalKg * (Number(line.ratePerKg) || 0);
    return { bagCount: bags.length, totalKg, amount };
  };

  const materialsTotal = lines.reduce((s, l) => s + lineTotals(l).amount, 0);
  const handling = hasHandling ? Number(handlingCharges) || 0 : 0;
  const grandTotal = materialsTotal + handling;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customerId || !loadId) {
      toast.error('Select customer and load');
      return;
    }

    const payloadLines = [];
    for (const line of lines) {
      if (!line.materialId) continue;
      const bags = line.bags.map((kgs) => ({ kgs: Number(kgs) })).filter((b) => b.kgs > 0);
      if (!bags.length) {
        toast.error('Enter bag weights for each material line');
        return;
      }
      if (line.ratePerKg === '' || Number(line.ratePerKg) < 0) {
        toast.error('Enter rate for each line');
        return;
      }
      payloadLines.push({
        materialId: line.materialId,
        ratePerKg: Number(line.ratePerKg),
        bags,
      });
    }

    if (!payloadLines.length) {
      toast.error('Add at least one material line');
      return;
    }

    setSaving(true);
    try {
      const res = await api.post('/sales', {
        customerId,
        loadId,
        lines: payloadLines,
        handlingCharges: handling,
      });
      toast.success(`Sale saved — credit ${formatCurrency(res.data.totalAmount)}`, { duration: 4000 });
      openCustomerSaleBillPdf(res.data);
      setLines([emptyLine()]);
      setHandlingCharges('');
      setCustomerId('');
      setLoadId('');
      setLoadStock([]);
      refreshPendingLoads();
      api.get('/customers').then((r) => setCustomers(r.data));
    } catch (err) {
      toast.error(err.response?.data?.message || 'Sale failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Sell to Customer</h1>
        <p className="text-primary-400 text-sm mt-0.5">Select customer & pending load — enter bag weights and rate</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-4xl">
        <div className="card grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Customer *</label>
            <select className="input-field" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
              <option value="">Choose customer...</option>
              {customers.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name} — {c.city} {c.creditBalance > 0 ? `(due ${formatCurrency(c.creditBalance)})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Pending Load *</label>
            <select
              className="input-field"
              value={loadId}
              onChange={(e) => {
                setLoadId(e.target.value);
                setLines([emptyLine()]);
              }}
              required
            >
              <option value="">Choose pending load...</option>
              {pendingLoads.map((load) => (
                <option key={load._id} value={load._id}>
                  {load.vendor?.name} — {formatDate(load.createdAt)} — {formatKg(load.remainingWeight)} left
                </option>
              ))}
            </select>
            {selectedLoad && (
              <p className="text-xs text-primary-400 mt-1">
                Materials: {selectedLoad.materials?.map((m) => `${m.materialName} (${formatKg(m.remainingKg)} left)`).join(', ')}
              </p>
            )}
          </div>
        </div>

        {lines.map((line, idx) => {
          const totals = lineTotals(line);
          return (
            <div key={idx} className="card space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-primary-700 text-sm">Price line {idx + 1}</h3>
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-red-400 p-1 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
                <div>
                  <label className="label">Material *</label>
                  <select
                    className="input-field"
                    value={line.materialId}
                    onChange={(e) => selectMaterial(idx, e.target.value)}
                    required
                    disabled={!loadId}
                  >
                    <option value="">{loadId ? 'Select...' : 'Select load first'}</option>
                    {loadStock.map((m) => (
                      <option key={String(m.materialId)} value={m.materialId}>
                        {m.materialName} — {m.availableKg} kg left
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Rate ₹/kg *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="input-field"
                    value={line.ratePerKg}
                    onChange={(e) => updateLine(idx, { ratePerKg: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label">Bag weights (kg)</label>
                <p className="text-xs text-primary-400 mb-2">Type weight and press Enter to add the next bag</p>
                <div className="flex flex-wrap gap-2">
                  {line.bags.map((bag, bIdx) => (
                    <input
                      key={bIdx}
                      ref={(el) => {
                        bagInputRefs.current[`${idx}-${bIdx}`] = el;
                      }}
                      type="number"
                      min="0.1"
                      step="0.1"
                      className="input-field !w-24 !py-2"
                      placeholder={`Bag ${bIdx + 1}`}
                      value={bag}
                      onChange={(e) => updateBag(idx, bIdx, e.target.value)}
                      onKeyDown={(e) => handleBagEnter(e, idx, bIdx)}
                    />
                  ))}
                </div>
              </div>

              <p className="text-sm text-primary-500">
                {totals.bagCount} bags · {totals.totalKg.toFixed(1)} kg · {formatCurrency(totals.amount)}
              </p>
            </div>
          );
        })}

        <button type="button" onClick={() => setLines([...lines, emptyLine()])} className="btn-secondary w-full !py-2.5">
          <Plus className="w-4 h-4" /> Add Price Line
        </button>
        <p className="text-xs text-primary-400 -mt-2">
          Use a new price line when the same material is sold at a different rate (e.g. ₹42 and ₹40)
        </p>

        {hasHandling && (
          <div className="card">
            <label className="label">Handling Charges (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input-field"
              value={handlingCharges}
              onChange={(e) => setHandlingCharges(e.target.value)}
              placeholder="Customer handling charges"
            />
          </div>
        )}

        <div className="card space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-primary-500">Materials</span>
            <span className="font-medium text-primary-700">{formatCurrency(materialsTotal)}</span>
          </div>
          {hasHandling && (
            <div className="flex justify-between text-sm">
              <span className="text-primary-500">Handling</span>
              <span className="font-medium text-primary-700">{formatCurrency(handling)}</span>
            </div>
          )}
          <div className="flex justify-between items-center border-t border-primary-100 pt-3">
            <span className="font-semibold text-primary-700">Customer credit</span>
            <span className="text-2xl font-bold text-primary-700">{formatCurrency(grandTotal)}</span>
          </div>
          <button type="submit" className="btn-primary w-full" disabled={saving || grandTotal <= 0}>
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Complete Sale'}
          </button>
        </div>
      </form>
    </div>
  );
}
