import express from 'express';
import Load from '../models/Load.js';
import Material from '../models/Material.js';
import Vendor from '../models/Vendor.js';
import { auth, requireRole } from '../middleware/auth.js';
import { enrichLoadStatus, enrichLoadsStatus, getAvailableKg, getLoadStockMap } from '../utils/loadStock.js';
import { buildLoadBill, buildVendorDayBill, dayRange, normalizeRates, findOrCreateDayLoad } from '../utils/loadBill.js';
import Sale from '../models/Sale.js';

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

/** Vendors with sales on this calendar day (implies they brought load that day) */
router.get('/vendors-by-date', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ message: 'date is required (YYYY-MM-DD)' });
    }
    const { start, end } = dayRange(date);
    const vendorIds = await Sale.distinct('vendor', {
      createdAt: { $gte: start, $lte: end },
    });

    const vendors = await Vendor.find({ _id: { $in: vendorIds } }).sort({ name: 1 });
    const loads = await Load.find({
      vendor: { $in: vendorIds },
      $or: [
        { loadDate: { $gte: start, $lte: end } },
        { loadDate: { $exists: false }, createdAt: { $gte: start, $lte: end } },
      ],
    }).select('vendor billGeneratedAt loadDate');

    const loadByVendor = new Map();
    for (const load of loads) {
      const key = load.vendor.toString();
      if (!loadByVendor.has(key)) loadByVendor.set(key, load);
    }

    res.json(
      vendors.map((v) => {
        const load = loadByVendor.get(v._id.toString());
        return {
          ...v.toObject(),
          loadId: load?._id || null,
          loadDate: load?.loadDate || null,
          billGenerated: !!load?.billGeneratedAt,
        };
      })
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Sale Patty preview: vendor + date → that day's sales */
router.get('/sale-patty', async (req, res) => {
  try {
    const { vendorId, date } = req.query;
    if (!vendorId || !date) {
      return res.status(400).json({ message: 'vendorId and date are required' });
    }
    const { start, end } = dayRange(date);
    const saleCount = await Sale.countDocuments({
      vendor: vendorId,
      createdAt: { $gte: start, $lte: end },
    });
    if (!saleCount) {
      return res.status(404).json({ message: 'No sales for this vendor on the selected date' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const load = await findOrCreateDayLoad(vendorId, date);
    await load.populate('vendor', 'name nameTelugu city mobile address creditBalance');

    const bill = await buildVendorDayBill(load.vendor || vendor, load, date);
    res.json(bill);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Generate / update Sale Patty for vendor + date */
router.post('/sale-patty', async (req, res) => {
  try {
    const { vendorId, date } = req.body;
    if (!vendorId || !date) {
      return res.status(400).json({ message: 'vendorId and date are required' });
    }
    const { start, end } = dayRange(date);
    const saleCount = await Sale.countDocuments({
      vendor: vendorId,
      createdAt: { $gte: start, $lte: end },
    });
    if (!saleCount) {
      return res.status(404).json({ message: 'No sales for this vendor on the selected date' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const load = await findOrCreateDayLoad(vendorId, date);
    await load.populate('vendor', 'name nameTelugu city mobile address creditBalance');

    const snapshot = normalizeRates(req.body);

    const wasGenerated = !!load.billGeneratedAt;
    load.billSnapshot = snapshot;
    load.markModified('billSnapshot');
    load.billGeneratedAt = new Date();
    await load.save();

    const bill = await buildVendorDayBill(load.vendor || vendor, load, date, snapshot);
    res.status(wasGenerated ? 200 : 201).json(bill);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { vendorId, status, date } = req.query;
    const filter = {};
    if (vendorId) filter.vendor = vendorId;
    if (date) {
      const { start, end } = dayRange(date);
      filter.loadDate = { $gte: start, $lte: end };
    }

    const loads = await Load.find(filter)
      .populate('vendor', 'name nameTelugu city mobile')
      .populate('materials.material', 'name sellingPricePerKg')
      .sort({ loadDate: 1, createdAt: 1 });

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
    const { vendorId, loadDate, notes, handlingCharges, materials } = req.body;

    if (!vendorId) {
      return res.status(400).json({ message: 'Vendor is required' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const when = loadDate ? new Date(loadDate) : new Date();
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ message: 'Invalid load date' });
    }
    when.setHours(12, 0, 0, 0);

    // Optional legacy materials; new Purchase flow sends none
    const processed = [];
    let totalWeight = 0;
    if (materials?.length) {
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
    }

    const { start, end } = dayRange(when.toISOString().slice(0, 10));
    const existing = await Load.findOne({
      vendor: vendorId,
      loadDate: { $gte: start, $lte: end },
    });
    if (existing) {
      return res.status(400).json({ message: 'This vendor already has a load on that date' });
    }

    const load = await Load.create({
      vendor: vendorId,
      loadDate: when,
      materials: processed,
      totalWeight,
      handlingCharges: Math.max(0, Number(handlingCharges) || 0),
      notes: notes || '',
    });

    const populated = await Load.findById(load._id)
      .populate('vendor', 'name nameTelugu city mobile address creditBalance')
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
      'name nameTelugu city mobile address creditBalance'
    );
    if (!load) return res.status(404).json({ message: 'Load not found' });

    const bill = await buildLoadBill(load);
    res.json(bill);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/:id/bill', async (req, res) => {
  try {
    const load = await Load.findById(req.params.id).populate(
      'vendor',
      'name nameTelugu city mobile address creditBalance'
    );
    if (!load) return res.status(404).json({ message: 'Load not found' });

    const snapshot = normalizeRates(req.body);

    const wasGenerated = !!load.billGeneratedAt;
    load.billSnapshot = snapshot;
    load.markModified('billSnapshot');
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
    const load = await Load.findById(req.params.id).populate(
      'materials.material',
      'name sellingPricePerKg'
    );
    if (!load) return res.status(404).json({ message: 'Load not found' });

    // Arrival-only loads: expose full product catalog for selling
    if (!load.materials?.length) {
      const materials = await Material.find().sort({ name: 1 });
      return res.json(
        materials.map((m) => ({
          materialId: m._id,
          materialName: m.name,
          sellingPricePerKg: m.sellingPricePerKg ?? 10,
          availableKg: null,
          originalKg: null,
        }))
      );
    }

    const stockMap = await getLoadStockMap(load._id);
    const items = load.materials
      .map((mat) => {
        const materialId = mat.material?._id || mat.material;
        const availableKg = getAvailableKg(stockMap, materialId);
        return {
          materialId,
          materialName: mat.materialName || mat.material?.name,
          sellingPricePerKg: mat.material?.sellingPricePerKg ?? 0,
          availableKg,
          originalKg: mat.totalKg,
        };
      })
      .filter((i) => i.availableKg > 0);

    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const load = await Load.findById(req.params.id)
      .populate('vendor', 'name nameTelugu city mobile address')
      .populate('materials.material', 'name sellingPricePerKg');
    if (!load) return res.status(404).json({ message: 'Load not found' });
    res.json(await enrichLoadStatus(load));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
