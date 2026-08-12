import express from 'express';
import Sale from '../models/Sale.js';
import Material from '../models/Material.js';
import Customer from '../models/Customer.js';
import Vendor from '../models/Vendor.js';
import Load from '../models/Load.js';
import Transaction from '../models/Transaction.js';
import { auth, requireRole } from '../middleware/auth.js';
import { getAvailableKg, getLoadStockMap } from '../utils/loadStock.js';
import { findOrCreateDayLoad, dayRange } from '../utils/loadBill.js';

const router = express.Router();
router.use(auth);
router.use(requireRole('admin'));

router.get('/', async (req, res) => {
  try {
    const { customerId, vendorId, loadId, date } = req.query;
    const filter = {};
    if (customerId) filter.customer = customerId;
    if (vendorId) filter.vendor = vendorId;
    if (loadId) filter.load = loadId;

    if (date && !loadId) {
      const { start, end } = dayRange(date);
      filter.createdAt = { $gte: start, $lte: end };
    }

    const sales = await Sale.find(filter)
      .populate('customer', 'name nameTelugu city state creditBalance')
      .populate('vendor', 'name nameTelugu city')
      .populate('load', 'createdAt loadDate totalWeight')
      .sort({ createdAt: 1 });
    res.json(sales);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const parseDate = (dateStr, endOfDay = false) => {
  const d = new Date(dateStr);
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d;
};

/** Flat report: one row per material per sale (prices merged) */
router.get('/report', async (req, res) => {
  try {
    const { startDate, endDate, customerId, materialId } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const start = parseDate(startDate || today);
    const end = parseDate(endDate || startDate || today, true);

    if (start > end) {
      return res.status(400).json({ message: 'Start date must be before or equal to end date' });
    }

    const filter = { createdAt: { $gte: start, $lte: end } };
    if (customerId) filter.customer = customerId;

    const sales = await Sale.find(filter)
      .populate('customer', 'name nameTelugu city state')
      .sort({ createdAt: -1 });

    const rows = [];

    for (const sale of sales) {
      const byMaterial = new Map();

      for (const line of sale.lines || []) {
        const matId = line.material?.toString() || line.materialName;
        if (materialId && line.material?.toString() !== materialId) continue;

        const key = line.materialName;
        const existing = byMaterial.get(key) || {
          materialName: line.materialName,
          materialId: line.material,
          bagCount: 0,
          totalWeight: 0,
          totalAmount: 0,
        };
        existing.bagCount += Number(line.bagCount) || 0;
        existing.totalWeight += Number(line.totalKg) || 0;
        existing.totalAmount += Number(line.totalAmount) || 0;
        byMaterial.set(key, existing);
      }

      for (const mat of byMaterial.values()) {
        rows.push({
          id: `${sale._id}-${mat.materialName}`,
          saleId: sale._id,
          date: sale.createdAt,
          customerName: sale.customer?.name || 'Unknown',
          customerId: sale.customer?._id || sale.customer,
          materialName: mat.materialName,
          materialId: mat.materialId,
          bagCount: mat.bagCount,
          totalWeight: Number(mat.totalWeight.toFixed(1)),
          totalAmount: Number(mat.totalAmount.toFixed(2)),
        });
      }
    }

    const summary = rows.reduce(
      (acc, row) => ({
        totalBags: acc.totalBags + row.bagCount,
        totalWeight: acc.totalWeight + row.totalWeight,
        totalAmount: acc.totalAmount + row.totalAmount,
      }),
      { totalBags: 0, totalWeight: 0, totalAmount: 0 }
    );
    summary.totalWeight = Number(summary.totalWeight.toFixed(1));
    summary.totalAmount = Number(summary.totalAmount.toFixed(2));

    res.json({
      startDate: start,
      endDate: end,
      rows,
      summary,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { customerId, loadId, vendorId, date, lines, handlingCharges } = req.body;

    if (!customerId || !lines?.length) {
      return res.status(400).json({ message: 'Customer and sale lines are required' });
    }
    if (!loadId && !vendorId) {
      return res.status(400).json({ message: 'Vendor is required' });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const saleDate = date || new Date().toISOString().slice(0, 10);
    let load = null;
    if (loadId) {
      load = await Load.findById(loadId);
      if (!load) return res.status(404).json({ message: 'Load not found' });
    } else {
      load = await findOrCreateDayLoad(vendorId, saleDate);
    }

    const vendor = await Vendor.findById(load.vendor);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const stockMap = await getLoadStockMap(load._id);
    const arrivalOnly = !(load.materials || []).length;
    const requestedByMaterial = new Map();
    const processedLines = [];
    let materialsTotal = 0;
    let totalBags = 0;
    let totalWeight = 0;

    for (const line of lines) {
      const { materialId, materialName, ratePerKg, bags, bagCount, totalKg } = line;

      let material = materialId ? await Material.findById(materialId) : null;
      if (!material && materialName) {
        material = await Material.findOne({ name: { $regex: new RegExp(`^${materialName.trim()}$`, 'i') } });
      }
      if (!material) {
        return res.status(404).json({ message: `Material not found: ${materialName || materialId}` });
      }

      if (!arrivalOnly) {
        const onLoad = load.materials.some(
          (m) => m.material?.toString() === material._id.toString()
        );
        if (!onLoad) {
          return res.status(400).json({ message: `${material.name} is not on this load` });
        }
      }

      let bagEntries = [];
      let lineBagCount = 0;
      let lineKg = 0;

      if (bags?.length) {
        bagEntries = bags.map((b) => ({ kgs: Number(b.kgs) })).filter((b) => b.kgs > 0);
        lineBagCount = bagEntries.length;
        lineKg = bagEntries.reduce((s, b) => s + b.kgs, 0);
      } else if (totalKg != null && Number(totalKg) > 0) {
        // Desktop-style entry: Bags count + Qty (kg)
        lineKg = Number(totalKg);
        lineBagCount = Math.max(1, Math.floor(Number(bagCount) || 1));
        const each = Number((lineKg / lineBagCount).toFixed(3));
        bagEntries = Array.from({ length: lineBagCount }, (_, i) =>
          i === lineBagCount - 1
            ? { kgs: Number((lineKg - each * (lineBagCount - 1)).toFixed(3)) }
            : { kgs: each }
        );
      }

      if (!bagEntries.length || lineKg <= 0) {
        return res.status(400).json({ message: 'Enter bags and quantity (kg)' });
      }

      const rate = Number(ratePerKg);
      if (rate < 0 || Number.isNaN(rate)) {
        return res.status(400).json({ message: 'Enter a valid rate per kg' });
      }

      if (!arrivalOnly) {
        const nextRequested = (requestedByMaterial.get(material._id.toString()) || 0) + lineKg;
        requestedByMaterial.set(material._id.toString(), nextRequested);
        const available = getAvailableKg(stockMap, material._id);
        if (nextRequested > available) {
          return res.status(400).json({
            message: `${material.name} has only ${available} kg left on this load`,
          });
        }
      }

      const totalAmount = Number((lineKg * rate).toFixed(2));
      materialsTotal += totalAmount;
      totalBags += lineBagCount;
      totalWeight += lineKg;

      processedLines.push({
        material: material._id,
        materialName: material.name,
        ratePerKg: rate,
        bags: bagEntries,
        bagCount: lineBagCount,
        totalKg: lineKg,
        totalAmount,
      });
    }

    const customerHasHandling = !!customer.handlingCharges;
    const handlingAmount = customerHasHandling ? Math.max(0, Number(handlingCharges) || 0) : 0;
    const saleTotal = Number((materialsTotal + handlingAmount).toFixed(2));

    const when = new Date(saleDate);
    if (!Number.isNaN(when.getTime())) {
      const now = new Date();
      when.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    }

    const sale = await Sale.create({
      customer: customerId,
      vendor: vendor._id,
      load: load._id,
      lines: processedLines,
      handlingCharges: handlingAmount,
      totalAmount: saleTotal,
      totalBags,
      totalWeight,
      createdAt: Number.isNaN(when.getTime()) ? undefined : when,
    });

    customer.creditBalance += saleTotal;
    await customer.save();

    vendor.creditBalance += materialsTotal;
    await vendor.save();

    await Transaction.create({
      customer: customerId,
      type: 'customer_credit',
      amount: saleTotal,
      description: `Sale - ${processedLines.map((l) => l.materialName).join(', ')}`,
      sale: sale._id,
      balanceAfter: customer.creditBalance,
    });

    await Transaction.create({
      vendor: vendor._id,
      type: 'vendor_credit',
      amount: materialsTotal,
      description: `Sale to ${customer.name} - ${processedLines.map((l) => l.materialName).join(', ')}`,
      sale: sale._id,
      balanceAfter: vendor.creditBalance,
    });

    const populated = await Sale.findById(sale._id)
      .populate('customer', 'name nameTelugu city state mobile address creditBalance')
      .populate('vendor', 'name nameTelugu city creditBalance')
      .populate('load', 'createdAt totalWeight');

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate('customer', 'name nameTelugu city state mobile address')
      .populate('vendor', 'name nameTelugu city mobile')
      .populate('load', 'createdAt totalWeight handlingCharges');
    if (!sale) return res.status(404).json({ message: 'Sale not found' });
    res.json(sale);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
