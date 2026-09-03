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

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveHandling({ handlingCharges, coolyRate, coolyPerBag, totalBags }) {
  const perBag = !!coolyPerBag;
  const rateRaw = coolyRate !== undefined && coolyRate !== null && coolyRate !== ''
    ? coolyRate
    : handlingCharges;
  const rate = Math.max(0, Number(rateRaw) || 0);
  const handlingAmount = perBag
    ? Number((rate * Math.max(0, Number(totalBags) || 0)).toFixed(2))
    : rate;
  return { handlingAmount, coolyRate: rate, coolyPerBag: perBag };
}

async function processSaleLines(lines, load, { extraStockMap } = {}) {
  const stockMap = extraStockMap || (await getLoadStockMap(load._id));
  const arrivalOnly = !(load.materials || []).length;
  const requestedByMaterial = new Map();
  const processedLines = [];
  let materialsTotal = 0;
  let totalBags = 0;
  let totalWeight = 0;

  for (const line of lines) {
    const { materialId, materialName, saleType, ratePerKg, bags, bagCount, totalKg } = line;
    const isByBag = saleType === 'by_bag';

    let material = materialId ? await Material.findById(materialId).catch(() => null) : null;
    if (!material && materialName) {
      material = await Material.findOne({ name: { $regex: new RegExp(`^${escapeRegex(materialName.trim())}$`, 'i') } });
    }
    if (!material) {
      const err = new Error(`Material not found: ${materialName || materialId}`);
      err.status = 400;
      throw err;
    }

    if (!arrivalOnly) {
      const onLoad = load.materials.some((m) => m.material?.toString() === material._id.toString());
      if (!onLoad) {
        const err = new Error(`${material.name} is not on this load`);
        err.status = 400;
        throw err;
      }
    }

    let bagEntries = [];
    let lineBagCount = 0;
    let lineKg = 0;

    if (isByBag) {
      lineBagCount = Math.max(1, Math.floor(Number(bagCount) || 1));
      lineKg = 0;
      bagEntries = [];
    } else if (bags?.length) {
      bagEntries = bags.map((b) => ({ kgs: Number(b.kgs) })).filter((b) => b.kgs > 0);
      lineBagCount = bagEntries.length;
      lineKg = bagEntries.reduce((s, b) => s + b.kgs, 0);
    } else if (totalKg != null && Number(totalKg) > 0) {
      lineKg = Number(totalKg);
      lineBagCount = Math.max(1, Math.floor(Number(bagCount) || 1));
      const each = Number((lineKg / lineBagCount).toFixed(3));
      bagEntries = Array.from({ length: lineBagCount }, (_, i) =>
        i === lineBagCount - 1
          ? { kgs: Number((lineKg - each * (lineBagCount - 1)).toFixed(3)) }
          : { kgs: each }
      );
    }

    if (isByBag) {
      if (lineBagCount <= 0) {
        const err = new Error('Enter valid number of bags');
        err.status = 400;
        throw err;
      }
    } else if (!bagEntries.length || lineKg <= 0) {
      const err = new Error('Enter bags and quantity (kg)');
      err.status = 400;
      throw err;
    }

    const rate = Number(ratePerKg);
    if (rate < 0 || Number.isNaN(rate)) {
      const err = new Error(isByBag ? 'Enter a valid rate per bag' : 'Enter a valid rate per kg');
      err.status = 400;
      throw err;
    }

    if (!arrivalOnly && !isByBag) {
      const nextRequested = (requestedByMaterial.get(material._id.toString()) || 0) + lineKg;
      requestedByMaterial.set(material._id.toString(), nextRequested);
      const available = getAvailableKg(stockMap, material._id);
      if (nextRequested > available) {
        const err = new Error(`${material.name} has only ${available} kg left on this load`);
        err.status = 400;
        throw err;
      }
    }

    const totalAmount = isByBag
      ? Number((lineBagCount * rate).toFixed(2))
      : Number((lineKg * rate).toFixed(2));

    materialsTotal += totalAmount;
    totalBags += lineBagCount;
    totalWeight += lineKg;

    if (rate > 0) {
      await Material.findByIdAndUpdate(material._id, { sellingPricePerKg: rate });
    }

    processedLines.push({
      material: material._id,
      materialName: material.name,
      saleType: isByBag ? 'by_bag' : 'by_weight',
      ratePerKg: rate,
      bags: bagEntries,
      bagCount: lineBagCount,
      totalKg: lineKg,
      totalAmount,
    });
  }

  return { processedLines, materialsTotal, totalBags, totalWeight };
}

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

function bagKgList(line) {
  const fromBags = (line.bags || [])
    .map((b) => Number(b.kgs))
    .filter((n) => n > 0)
    .map((n) => Number(Number.isInteger(n) ? n : n.toFixed(1)));
  if (fromBags.length) return fromBags;
  const kg = Number(line.totalKg) || 0;
  return kg > 0 ? [Number(Number.isInteger(kg) ? kg : kg.toFixed(1))] : [];
}

/** Day-wise packing sheet: product columns, customer + bag weights, rate groups. */
router.get('/report-2', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const { start, end } = dayRange(date);

    const sales = await Sale.find({ createdAt: { $gte: start, $lte: end } })
      .populate('customer', 'name nameTelugu')
      .populate('lines.material', 'name nameTelugu')
      .sort({ createdAt: 1 })
      .lean();

    const materials = new Map();

    for (const sale of sales) {
      const customerName = sale.customer?.name || '—';
      const customerId = String(sale.customer?._id || sale.customer || '');
      for (const line of sale.lines || []) {
        const matDoc = line.material && typeof line.material === 'object' ? line.material : null;
        const materialId = String(matDoc?._id || line.material || line.materialName || '');
        const materialName = matDoc?.name || line.materialName || 'Item';
        const materialNameTelugu = matDoc?.nameTelugu || '';
        if (!materials.has(materialId)) {
          materials.set(materialId, {
            materialId,
            materialName,
            materialNameTelugu,
            entries: [],
            bagCount: 0,
            totalKg: 0,
          });
        }
        const mat = materials.get(materialId);
        const rate = Number(line.ratePerKg != null ? line.ratePerKg : line.rate) || 0;
        const isByBag = line.saleType === 'by_bag' || (line.bagCount > 0 && (!line.bags || line.bags.length === 0) && Number(line.totalKg) === 0);
        const bags = bagKgList(line);
        const count = Number(line.bagCount) || bags.length || 1;
        const lineTotalKg = Number(line.totalKg) || (typeof bags[0] === 'number' ? bags.reduce((s, n) => s + n, 0) : 0);

        let lineAmount = Number(line.totalAmount) || 0;
        if (!lineAmount) {
          lineAmount = isByBag ? count * rate : lineTotalKg * rate;
        }

        const bagStrList = isByBag || bags.length === 0
          ? [`${count} ${count === 1 ? 'Bag' : 'Bags'}`]
          : bags;

        mat.entries.push({
          saleId: sale._id,
          customerId,
          name: customerName,
          bags: bagStrList,
          rate,
          amount: Math.round(lineAmount),
        });

        mat.bagCount += count;
        mat.totalKg += lineTotalKg;
      }
    }

    const columns = [...materials.values()].map((mat) => ({
      materialId: mat.materialId,
      materialName: mat.materialName,
      materialNameTelugu: mat.materialNameTelugu,
      bagCount: mat.bagCount,
      totalKg: Number(mat.totalKg.toFixed(1)),
      entries: mat.entries,
      rateGroups: [
        {
          rate: 0,
          entries: mat.entries,
        },
      ],
    }));

    res.json({ date: start, columns });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Flat report: one row per material per sale (prices merged) */
router.get('/report', async (req, res) => {
  try {
    const { startDate, endDate, customerId, materialId, rate } = req.query;
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
        if (materialId && line.material?.toString() !== materialId) continue;
        const lineRate = Number(line.ratePerKg) || 0;
        if (rate !== undefined && rate !== '' && Number(rate) !== lineRate) continue;

        const key = `${line.materialName}|${lineRate}`;
        const existing = byMaterial.get(key) || {
          materialName: line.materialName,
          materialId: line.material,
          ratePerKg: lineRate,
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
          id: `${sale._id}-${mat.materialName}-${mat.ratePerKg}`,
          saleId: sale._id,
          date: sale.createdAt,
          customerName: sale.customer?.name || 'Unknown',
          customerId: sale.customer?._id || sale.customer,
          materialName: mat.materialName,
          materialId: mat.materialId,
          ratePerKg: mat.ratePerKg,
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
    const { customerId, loadId, vendorId, date, lines, handlingCharges, coolyRate, coolyPerBag } =
      req.body;

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
    let processed;
    try {
      processed = await processSaleLines(lines, load, { extraStockMap: stockMap });
    } catch (err) {
      return res.status(err.status || 500).json({ message: err.message });
    }
    const { processedLines, materialsTotal, totalBags, totalWeight } = processed;

    const { handlingAmount, coolyRate: savedCoolyRate, coolyPerBag: savedCoolyPerBag } =
      resolveHandling({
        customer,
        handlingCharges,
        coolyRate,
        coolyPerBag,
        totalBags,
      });
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
      coolyRate: savedCoolyRate,
      coolyPerBag: savedCoolyPerBag,
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

router.put('/:id', async (req, res) => {
  try {
    const existing = await Sale.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Sale not found' });

    const { customerId, loadId, vendorId, date, lines, handlingCharges, coolyRate, coolyPerBag } =
      req.body;
    if (!lines?.length) {
      return res.status(400).json({ message: 'Sale lines are required' });
    }

    const nextCustomerId = customerId || existing.customer.toString();
    const customer = await Customer.findById(nextCustomerId);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const saleDate = date || existing.createdAt.toISOString().slice(0, 10);
    let load = null;
    if (loadId) {
      load = await Load.findById(loadId);
      if (!load) return res.status(404).json({ message: 'Load not found' });
    } else if (vendorId) {
      load = await findOrCreateDayLoad(vendorId, saleDate);
    } else {
      load = await Load.findById(existing.load);
      if (!load) return res.status(404).json({ message: 'Load not found' });
    }

    const vendor = await Vendor.findById(load.vendor);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    const oldVendor = await Vendor.findById(existing.vendor);
    const oldCustomer = await Customer.findById(existing.customer);

    const stockMap = await getLoadStockMap(load._id);
    const sameLoad = load._id.toString() === existing.load?.toString();
    if (sameLoad) {
      for (const line of existing.lines || []) {
        const key = line.material?.toString();
        if (!key) continue;
        stockMap.set(key, (stockMap.get(key) || 0) + Number(line.totalKg || 0));
      }
    }

    let processed;
    try {
      processed = await processSaleLines(lines, load, { extraStockMap: stockMap });
    } catch (err) {
      return res.status(err.status || 500).json({ message: err.message });
    }
    const { processedLines, materialsTotal, totalBags, totalWeight } = processed;

    const { handlingAmount, coolyRate: savedCoolyRate, coolyPerBag: savedCoolyPerBag } =
      resolveHandling({
        customer,
        handlingCharges,
        coolyRate,
        coolyPerBag,
        totalBags,
      });
    const saleTotal = Number((materialsTotal + handlingAmount).toFixed(2));
    const oldMaterialsTotal = Number(
      (existing.lines || []).reduce((s, l) => s + (Number(l.totalAmount) || 0), 0).toFixed(2)
    );
    const oldSaleTotal = Number(existing.totalAmount || 0);

    existing.customer = customer._id;
    existing.vendor = vendor._id;
    existing.load = load._id;
    existing.lines = processedLines;
    existing.handlingCharges = handlingAmount;
    existing.coolyRate = savedCoolyRate;
    existing.coolyPerBag = savedCoolyPerBag;
    existing.totalAmount = saleTotal;
    existing.totalBags = totalBags;
    existing.totalWeight = totalWeight;
    await existing.save();

    if (oldCustomer) {
      if (oldCustomer._id.toString() === customer._id.toString()) {
        oldCustomer.creditBalance = Math.max(0, oldCustomer.creditBalance - oldSaleTotal + saleTotal);
        await oldCustomer.save();
      } else {
        oldCustomer.creditBalance = Math.max(0, oldCustomer.creditBalance - oldSaleTotal);
        await oldCustomer.save();
        customer.creditBalance += saleTotal;
        await customer.save();
      }
    } else {
      customer.creditBalance += saleTotal;
      await customer.save();
    }

    const refreshedCustomer = await Customer.findById(customer._id);

    if (oldVendor && oldVendor._id.toString() !== vendor._id.toString()) {
      oldVendor.creditBalance = Math.max(0, oldVendor.creditBalance - oldMaterialsTotal);
      await oldVendor.save();
      vendor.creditBalance += materialsTotal;
      await vendor.save();
    } else if (oldVendor) {
      oldVendor.creditBalance = Math.max(0, oldVendor.creditBalance - oldMaterialsTotal + materialsTotal);
      await oldVendor.save();
    } else {
      vendor.creditBalance += materialsTotal;
      await vendor.save();
    }

    const desc = `Sale - ${processedLines.map((l) => l.materialName).join(', ')}`;
    await Transaction.updateMany(
      { sale: existing._id, type: 'customer_credit' },
      {
        $set: {
          customer: customer._id,
          amount: saleTotal,
          description: desc,
          balanceAfter: refreshedCustomer.creditBalance,
        },
      }
    );
    const vendorNow = await Vendor.findById(vendor._id);
    await Transaction.updateMany(
      { sale: existing._id, type: 'vendor_credit' },
      {
        $set: {
          vendor: vendor._id,
          amount: materialsTotal,
          description: `Sale to ${customer.name} - ${processedLines.map((l) => l.materialName).join(', ')}`,
          balanceAfter: vendorNow?.creditBalance || 0,
        },
      }
    );

    const populated = await Sale.findById(existing._id)
      .populate('customer', 'name nameTelugu city state mobile address creditBalance')
      .populate('vendor', 'name nameTelugu city creditBalance')
      .populate('load', 'createdAt totalWeight');

    res.json(populated);
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

export default router;
