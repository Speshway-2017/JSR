import express from 'express';
import Load from '../models/Load.js';
import Material from '../models/Material.js';
import Vendor from '../models/Vendor.js';
import { auth } from '../middleware/auth.js';
import { enrichLoadStatus, enrichLoadsStatus, getAvailableKg, getLoadStockMap } from '../utils/loadStock.js';
import { buildLoadBill } from '../utils/loadBill.js';

const router = express.Router();
router.use(auth);

async function resolveMaterial({ materialId, materialName }) {
  if (materialId) {
    const byId = await Material.findById(materialId);
    if (byId) return byId;
  }
  const name = materialName?.trim();
  if (!name) return null;
  let material = await Material.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
  if (!material) material = await Material.create({ name });
  return material;
}

router.get('/', async (req, res) => {
  try {
    const { vendorId, status } = req.query;
    const filter = {};
    if (vendorId) filter.vendor = vendorId;

    const loads = await Load.find(filter)
      .populate('vendor', 'name city mobile')
      .populate('materials.material', 'name sellingPricePerKg')
      .sort({ createdAt: -1 });

    let enriched = await enrichLoadsStatus(loads);
    if (status === 'pending') {
      enriched = enriched.filter((l) => l.status === 'pending');
    } else if (status === 'sold_out') {
      enriched = enriched.filter((l) => l.status === 'sold_out');
    }
    res.json(enriched);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { vendorId, materials, notes, handlingCharges } = req.body;

    if (!vendorId || !materials?.length) {
      return res.status(400).json({ message: 'Vendor and materials are required' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const processed = [];
    let totalWeight = 0;

    for (const mat of materials) {
      const material = await resolveMaterial(mat);
      const totalKg = Number(mat.totalKg);
      if (!material || !totalKg || totalKg <= 0) {
        return res.status(400).json({ message: 'Each material needs a name and total weight' });
      }
      totalWeight += totalKg;
      processed.push({
        material: material._id,
        materialName: material.name,
        totalKg,
      });
    }

    const load = await Load.create({
      vendor: vendorId,
      materials: processed,
      totalWeight,
      handlingCharges: Math.max(0, Number(handlingCharges) || 0),
      notes: notes || '',
    });

    const populated = await Load.findById(load._id)
      .populate('vendor', 'name city mobile address creditBalance')
      .populate('materials.material', 'name');

    res.status(201).json(await enrichLoadStatus(populated));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/bill', async (req, res) => {
  try {
    const load = await Load.findById(req.params.id).populate(
      'vendor',
      'name city mobile address creditBalance'
    );
    if (!load) return res.status(404).json({ message: 'Load not found' });

    const bill = await buildLoadBill(load);
    res.json(bill);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Generate or regenerate vendor bill — saves charge rates on the load */
router.post('/:id/bill', async (req, res) => {
  try {
    const load = await Load.findById(req.params.id).populate(
      'vendor',
      'name city mobile address creditBalance'
    );
    if (!load) return res.status(404).json({ message: 'Load not found' });

    const snapshot = {
      labour: Math.max(0, Number(req.body.labour) || 0),
      aaseelu: Math.max(0, Number(req.body.aaseelu) || 0),
      bill: Math.max(0, Number(req.body.bill) || 0),
      unionCharges: Math.max(0, Number(req.body.unionCharges) || 0),
      commissionPercent: Math.min(100, Math.max(0, Number(req.body.commissionPercent) || 0)),
    };

    const wasGenerated = !!load.billGeneratedAt;
    load.billSnapshot = snapshot;
    load.billGeneratedAt = new Date();
    await load.save();

    const bill = await buildLoadBill(load, snapshot);
    res.status(wasGenerated ? 200 : 201).json(bill);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/stock', async (req, res) => {
  try {
    const load = await Load.findById(req.params.id).populate('materials.material', 'name sellingPricePerKg');
    if (!load) return res.status(404).json({ message: 'Load not found' });

    const stockMap = await getLoadStockMap(load._id);
    const items = load.materials.map((mat) => {
      const materialId = mat.material?._id || mat.material;
      const availableKg = getAvailableKg(stockMap, materialId);
      return {
        materialId,
        materialName: mat.materialName || mat.material?.name,
        sellingPricePerKg: mat.material?.sellingPricePerKg ?? 0,
        availableKg,
        originalKg: mat.totalKg,
      };
    }).filter((i) => i.availableKg > 0);

    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const load = await Load.findById(req.params.id)
      .populate('vendor', 'name city mobile address')
      .populate('materials.material', 'name sellingPricePerKg');
    if (!load) return res.status(404).json({ message: 'Load not found' });
    res.json(await enrichLoadStatus(load));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
