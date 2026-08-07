import express from 'express';
import Vendor from '../models/Vendor.js';
import Load from '../models/Load.js';
import Sale from '../models/Sale.js';
import Transaction from '../models/Transaction.js';
import PriceSettings from '../models/PriceSettings.js';
import { auth } from '../middleware/auth.js';
import { getVendorStockMap, getAvailableKg } from '../utils/stock.js';
import { enrichLoadsStatus } from '../utils/loadStock.js';

const router = express.Router();
router.use(auth);

router.get('/', async (_req, res) => {
  try {
    const vendors = await Vendor.find().sort({ name: 1 });
    res.json(vendors);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, mobile, city, address } = req.body;
    if (!name || !mobile || !city || !address) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    const vendor = await Vendor.create({ name, mobile, city, address });
    res.status(201).json(vendor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/bill', async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const { startDate, endDate } = req.query;
    const saleFilter = { vendor: vendor._id };
    const loadFilter = { vendor: vendor._id };

    if (startDate || endDate) {
      const range = {};
      if (startDate) range.$gte = new Date(`${startDate}T00:00:00.000`);
      if (endDate) range.$lte = new Date(`${endDate}T23:59:59.999`);
      saleFilter.createdAt = range;
      loadFilter.createdAt = range;
    }

    const [sales, loads, settings] = await Promise.all([
      Sale.find(saleFilter).sort({ createdAt: 1 }),
      Load.find(loadFilter),
      PriceSettings.findOne(),
    ]);

    // Group by materialName + ratePerKg
    const groupMap = new Map();
    for (const sale of sales) {
      for (const line of sale.lines || []) {
        const key = `${line.materialName}__${Number(line.ratePerKg)}`;
        const existing = groupMap.get(key) || {
          materialName: line.materialName,
          ratePerKg: line.ratePerKg,
          bagCount: 0,
          totalKg: 0,
          totalAmount: 0,
        };
        existing.bagCount += line.bagCount;
        existing.totalKg += line.totalKg;
        existing.totalAmount += line.totalAmount;
        groupMap.set(key, existing);
      }
    }

    const groups = Array.from(groupMap.values()).sort((a, b) =>
      a.materialName.localeCompare(b.materialName) || a.ratePerKg - b.ratePerKg
    );

    // Nest under material for bill display
    const byMaterial = [];
    for (const g of groups) {
      let mat = byMaterial.find((m) => m.materialName === g.materialName);
      if (!mat) {
        mat = { materialName: g.materialName, lines: [] };
        byMaterial.push(mat);
      }
      mat.lines.push({
        bagCount: g.bagCount,
        totalKg: Number(g.totalKg.toFixed(1)),
        ratePerKg: g.ratePerKg,
        totalAmount: Number(g.totalAmount.toFixed(2)),
      });
    }

    const grossTotal = groups.reduce((s, g) => s + g.totalAmount, 0);
    const totalBags = groups.reduce((s, g) => s + g.bagCount, 0);
    const handlingCharges = loads.reduce((s, l) => s + Number(l.handlingCharges || 0), 0);

    const labour = Number(settings?.labour || 0);
    const aaseelu = Number(settings?.aaseelu || 0);
    const bill = Number(settings?.bill || 0);
    const unionCharges = Number(settings?.unionCharges || 0);
    const commissionPercent = Number(settings?.commissionPercent || 0);
    const perBagTotal = labour + aaseelu + bill + unionCharges;
    const bagChargesTotal = Number((perBagTotal * totalBags).toFixed(2));
    const commission = Number(((grossTotal * commissionPercent) / 100).toFixed(2));

    const deductions = {
      handlingCharges: Number(handlingCharges.toFixed(2)),
      labour: Number((labour * totalBags).toFixed(2)),
      aaseelu: Number((aaseelu * totalBags).toFixed(2)),
      bill: Number((bill * totalBags).toFixed(2)),
      unionCharges: Number((unionCharges * totalBags).toFixed(2)),
      commissionPercent,
      commission,
      perBagRates: { labour, aaseelu, bill, unionCharges },
      bagChargesTotal,
      total: Number((handlingCharges + bagChargesTotal + commission).toFixed(2)),
    };

    const receivable = Number((grossTotal - deductions.total).toFixed(2));

    res.json({
      vendor: {
        _id: vendor._id,
        name: vendor.name,
        mobile: vendor.mobile,
        city: vendor.city,
        address: vendor.address,
        creditBalance: vendor.creditBalance,
      },
      startDate: startDate || null,
      endDate: endDate || null,
      materials: byMaterial,
      summary: {
        totalBags,
        grossTotal: Number(grossTotal.toFixed(2)),
        deductions,
        receivable,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/stock', async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    const stockMap = await getVendorStockMap(vendor._id);
    const items = [];
    for (const [materialId, kg] of stockMap.entries()) {
      if (kg > 0) items.push({ materialId, availableKg: getAvailableKg(stockMap, materialId) });
    }
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const loads = await Load.find({ vendor: vendor._id })
      .populate('materials.material', 'name sellingPricePerKg')
      .sort({ createdAt: -1 });

    const enrichedLoads = await enrichLoadsStatus(loads);

    const sales = await Sale.find({ vendor: vendor._id })
      .populate('customer', 'name city')
      .populate('load', 'createdAt totalWeight')
      .sort({ createdAt: -1 });

    const transactions = await Transaction.find({ vendor: vendor._id }).sort({ createdAt: -1 });

    res.json({ vendor, loads: enrichedLoads, sales, transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, mobile, city, address } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (mobile !== undefined) updates.mobile = mobile;
    if (city !== undefined) updates.city = city;
    if (address !== undefined) updates.address = address;

    const vendor = await Vendor.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    res.json(vendor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const vendor = await Vendor.findByIdAndDelete(req.params.id);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
    res.json({ message: 'Vendor deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
