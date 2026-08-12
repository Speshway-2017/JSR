import express from 'express';
import Load from '../models/Load.js';
import Purchase from '../models/Purchase.js';
import Sale from '../models/Sale.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(auth);
router.use(requireRole('admin'));

const parseDate = (dateStr, endOfDay = false) => {
  const d = new Date(dateStr);
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Inventory History = incoming stock
 * - Purchases
 * - Load from sales (vendor with sales that day = brought load)
 * - Legacy Load.materials lines (if any)
 */
router.get('/history', async (req, res) => {
  try {
    const { startDate, endDate, vendorId, materialId } = req.query;

    const today = new Date().toISOString().slice(0, 10);
    const start = parseDate(startDate || today);
    const end = parseDate(endDate || startDate || today, true);

    if (start > end) {
      return res.status(400).json({ message: 'Start date must be before or equal to end date' });
    }

    const purchaseFilter = { purchaseDate: { $gte: start, $lte: end } };
    const saleFilter = { createdAt: { $gte: start, $lte: end } };
    const loadFilter = {
      $or: [
        { loadDate: { $gte: start, $lte: end } },
        { loadDate: { $exists: false }, createdAt: { $gte: start, $lte: end } },
      ],
    };
    if (vendorId) {
      purchaseFilter.vendor = vendorId;
      saleFilter.vendor = vendorId;
      loadFilter.vendor = vendorId;
    }

    const [purchases, sales, loads] = await Promise.all([
      Purchase.find(purchaseFilter)
        .populate('vendor', 'name city')
        .sort({ purchaseDate: -1, createdAt: -1 }),
      Sale.find(saleFilter)
        .populate('vendor', 'name city')
        .sort({ createdAt: -1 }),
      Load.find(loadFilter)
        .populate('vendor', 'name city')
        .populate('materials.material', 'name')
        .sort({ loadDate: -1, createdAt: -1 }),
    ]);

    const rows = [];

    for (const purchase of purchases) {
      for (const line of purchase.lines || []) {
        const matId = line.material?.toString?.() || String(line.material || '');
        if (materialId && matId !== materialId) continue;

        rows.push({
          id: `purchase-${purchase._id}-${line._id}`,
          date: purchase.purchaseDate || purchase.createdAt,
          source: 'purchase',
          materialName: line.materialName,
          materialId: line.material,
          vendorName: purchase.vendor?.name || 'Unknown',
          vendorId: purchase.vendor?._id || purchase.vendor,
          totalWeight: Number(line.totalKg) || 0,
          bagCount: 0,
          ratePerKg: Number(line.ratePerKg) || 0,
          amount: Number(line.amount) || 0,
          handlingCharges: 0,
          purchaseId: purchase._id,
        });
      }
    }

    // Sales ⇒ vendor brought load that day (group by day + vendor + material)
    const saleLoadMap = new Map();
    for (const sale of sales) {
      const vId = sale.vendor?._id?.toString() || sale.vendor?.toString();
      if (!vId) continue;
      const d = new Date(sale.createdAt);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const day = `${yyyy}-${mm}-${dd}`;

      for (const line of sale.lines || []) {
        const matId = line.material?.toString?.() || String(line.material || '');
        if (materialId && matId !== materialId) continue;

        const key = `${day}__${vId}__${matId || line.materialName}`;
        const existing = saleLoadMap.get(key) || {
          id: `sale-load-${key}`,
          date: new Date(`${day}T12:00:00`),
          source: 'load',
          materialName: line.materialName,
          materialId: line.material,
          vendorName: sale.vendor?.name || 'Unknown',
          vendorId: sale.vendor?._id || sale.vendor,
          totalWeight: 0,
          bagCount: 0,
          ratePerKg: 0,
          amount: 0,
          handlingCharges: 0,
        };

        existing.totalWeight += Number(line.totalKg) || 0;
        existing.bagCount += Number(line.bagCount) || 0;
        existing.amount += Number(line.totalAmount) || 0;
        saleLoadMap.set(key, existing);
      }
    }

    for (const row of saleLoadMap.values()) {
      row.totalWeight = Number(row.totalWeight.toFixed(1));
      row.amount = Number(row.amount.toFixed(2));
      if (row.totalWeight > 0) {
        row.ratePerKg = Number((row.amount / row.totalWeight).toFixed(2));
      }
      rows.push(row);
    }

    // Legacy load materials only (skip empty auto-loads)
    for (const load of loads) {
      for (const mat of load.materials || []) {
        if (!(Number(mat.totalKg) > 0)) continue;
        const matId = mat.material?._id?.toString() || mat.material?.toString();
        if (materialId && matId !== materialId) continue;

        rows.push({
          id: `load-${load._id}-${mat._id}`,
          date: load.loadDate || load.createdAt,
          source: 'load',
          materialName: mat.materialName || mat.material?.name || '—',
          materialId: mat.material?._id || mat.material,
          vendorName: load.vendor?.name || 'Unknown',
          vendorId: load.vendor?._id || load.vendor,
          totalWeight: Number(mat.totalKg) || 0,
          bagCount: 0,
          ratePerKg: 0,
          amount: 0,
          handlingCharges: load.handlingCharges || 0,
          loadId: load._id,
        });
      }
    }

    rows.sort((a, b) => new Date(b.date) - new Date(a.date));

    const summary = rows.reduce(
      (acc, row) => ({
        totalWeight: acc.totalWeight + (Number(row.totalWeight) || 0),
        totalAmount: acc.totalAmount + (Number(row.amount) || 0),
        totalBags: acc.totalBags + (Number(row.bagCount) || 0),
      }),
      { totalWeight: 0, totalAmount: 0, totalBags: 0 }
    );

    res.json({
      startDate: start,
      endDate: end,
      rows,
      summary: {
        totalWeight: Number(summary.totalWeight.toFixed(1)),
        totalAmount: Number(summary.totalAmount.toFixed(2)),
        totalBags: summary.totalBags,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
