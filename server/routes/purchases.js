import express from 'express';
import Purchase from '../models/Purchase.js';
import Vendor from '../models/Vendor.js';
import Material from '../models/Material.js';
import Transaction from '../models/Transaction.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(auth);
router.use(requireRole('admin'));

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveMaterial({ materialId, materialName }) {
  if (materialId) {
    const byId = await Material.findById(materialId);
    if (byId) return byId;
  }
  const name = materialName?.trim();
  if (!name) return null;
  let material = await Material.findOne({ name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } });
  if (!material) material = await Material.create({ name });
  return material;
}

router.get('/', async (req, res) => {
  try {
    const { vendorId, date } = req.query;
    const filter = {};
    if (vendorId) filter.vendor = vendorId;
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.purchaseDate = { $gte: start, $lte: end };
    }

    const purchases = await Purchase.find(filter)
      .populate('vendor', 'name city mobile')
      .sort({ purchaseDate: -1, createdAt: -1 });
    res.json(purchases);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { vendorId, purchaseDate, lines, notes } = req.body;
    if (!vendorId) {
      return res.status(400).json({ message: 'Vendor is required' });
    }
    if (!lines?.length) {
      return res.status(400).json({ message: 'Add at least one product line' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const when = purchaseDate ? new Date(purchaseDate) : new Date();
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ message: 'Invalid purchase date' });
    }
    when.setHours(12, 0, 0, 0);

    const processed = [];
    let totalAmount = 0;
    let totalWeight = 0;

    for (const line of lines) {
      const material = await resolveMaterial(line);
      const totalKg = Number(line.totalKg);
      const ratePerKg = Number(line.ratePerKg);
      if (!material || !totalKg || totalKg <= 0) {
        return res.status(400).json({ message: 'Each line needs product and weight' });
      }
      if (Number.isNaN(ratePerKg) || ratePerKg < 0) {
        return res.status(400).json({ message: 'Enter a valid rate per kg' });
      }
      const amount = Number((totalKg * ratePerKg).toFixed(2));
      totalAmount += amount;
      totalWeight += totalKg;
      processed.push({
        material: material._id,
        materialName: material.name,
        totalKg,
        ratePerKg,
        amount,
      });
    }

    totalAmount = Number(totalAmount.toFixed(2));
    totalWeight = Number(totalWeight.toFixed(1));

    const purchase = await Purchase.create({
      vendor: vendorId,
      purchaseDate: when,
      lines: processed,
      totalAmount,
      totalWeight,
      notes: notes || '',
    });

    vendor.creditBalance += totalAmount;
    await vendor.save();

    await Transaction.create({
      vendor: vendorId,
      type: 'vendor_credit',
      amount: totalAmount,
      description: `Purchase — ${processed.map((l) => l.materialName).join(', ')}`,
      balanceAfter: vendor.creditBalance,
      entryDate: when,
      source: 'purchase',
    });

    const populated = await Purchase.findById(purchase._id).populate(
      'vendor',
      'name city mobile creditBalance'
    );
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const purchase = await Purchase.findById(req.params.id).populate(
      'vendor',
      'name city mobile creditBalance'
    );
    if (!purchase) return res.status(404).json({ message: 'Purchase not found' });
    res.json(purchase);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
