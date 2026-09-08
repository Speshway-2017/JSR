import express from 'express';
import Vendor from '../models/Vendor.js';
import Load from '../models/Load.js';
import Sale from '../models/Sale.js';
import Transaction from '../models/Transaction.js';
import PriceSettings from '../models/PriceSettings.js';
import { auth, requireRole } from '../middleware/auth.js';
import { getVendorStockMap, getAvailableKg } from '../utils/stock.js';
import { enrichLoadsStatus } from '../utils/loadStock.js';
import {
  buildDeductionsFromRates,
  emptyRatesFromSettings,
  migrateLegacySettings,
} from '../utils/deductionFields.js';
import { groupSalesMaterials, extractSaleDetails } from '../utils/loadBill.js';

const router = express.Router();
router.use(auth);
router.use(requireRole('admin'));

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
    const { name, nameTelugu, mobile, city, address } = req.body;
    if (!name || !mobile || !city || !address) {
      return res.status(400).json({ message: 'All fields are required' });
    }
    const vendor = await Vendor.create({
      name,
      nameTelugu: String(nameTelugu || '').trim(),
      mobile,
      city,
      address,
    });
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

    const { byMaterial, grossTotal, totalBags } = groupSalesMaterials(sales);
    const { bagWeights, rateLines } = extractSaleDetails(sales);
    const rates = emptyRatesFromSettings(migrateLegacySettings(settings));
    const deductions = buildDeductionsFromRates({ grossTotal, totalBags, rates });

    const receivable = Number((grossTotal - deductions.total).toFixed(2));

    res.json({
      vendor: {
        _id: vendor._id,
        name: vendor.name,
        nameTelugu: vendor.nameTelugu || '',
        mobile: vendor.mobile,
        city: vendor.city,
        address: vendor.address,
        creditBalance: vendor.creditBalance,
      },
      startDate: startDate || null,
      endDate: endDate || null,
      materials: byMaterial,
      bagWeights,
      rateLines,
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
      .sort({ createdAt: 1 });

    const enrichedLoads = await enrichLoadsStatus(loads);

    const sales = await Sale.find({ vendor: vendor._id })
      .populate('customer', 'name nameTelugu city')
      .populate('load', 'createdAt totalWeight')
      .sort({ createdAt: 1 });

    const transactions = await Transaction.find({ vendor: vendor._id }).sort({ createdAt: 1 });

    res.json({ vendor, loads: enrichedLoads, sales, transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, nameTelugu, mobile, city, address } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (nameTelugu !== undefined) updates.nameTelugu = String(nameTelugu || '').trim();
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
