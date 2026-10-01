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
      bagEntries = bags.map((b) => ({ kgs: Number(b.kgs != null ? b.kgs : b) })).filter((b) => b.kgs > 0);
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

async function getNextSerialNo(start, end) {
  const maxSale = await Sale.findOne({ createdAt: { $gte: start, $lte: end }, serialNo: { $ne: null } })
    .sort({ serialNo: -1 })
    .lean();
  if (maxSale && typeof maxSale.serialNo === 'number' && maxSale.serialNo > 0) {
    return maxSale.serialNo + 1;
  }
  const count = await Sale.countDocuments({ createdAt: { $gte: start, $lte: end } });
  return count + 1;
}

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
      .sort({ serialNo: 1, createdAt: 1 });

    let maxSeq = 0;
    for (const s of sales) {
      if (typeof s.serialNo === 'number' && s.serialNo > 0) {
        maxSeq = Math.max(maxSeq, s.serialNo);
      } else {
        maxSeq += 1;
        s.serialNo = maxSeq;
        Sale.updateOne({ _id: s._id }, { $set: { serialNo: maxSeq } }).catch(() => {});
      }
    }

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

/** Day-wise packing sheet: vendor columns, vegetable sub-sections, customer + bag weights. */
router.get('/report-2', async (req, res) => {
  try {
    const { date, cashOnly, isCash: isCashParam } = req.query;
    const { start, end } = dayRange(date || new Date().toISOString().slice(0, 10));

    const filter = { createdAt: { $gte: start, $lte: end } };
    if (cashOnly === 'true' || cashOnly === true || isCashParam === 'true' || isCashParam === true) {
      filter.$or = [{ isCashSale: true }, { customer: null }, { customerName: 'Cash' }];
    }

    const sales = await Sale.find(filter)
      .populate('customer', 'name nameTelugu')
      .populate('vendor', 'name nameTelugu')
      .populate('lines.material', 'name nameTelugu')
      .sort({ serialNo: 1, createdAt: 1 })
      .lean();

    const vendorsMap = new Map();

    for (const sale of sales) {
      const vendorDoc = sale.vendor && typeof sale.vendor === 'object' ? sale.vendor : null;
      const vendorId = String(vendorDoc?._id || sale.vendor || 'unknown');
      const vendorName = vendorDoc?.name || 'Unknown Vendor';
      const vendorNameTelugu = vendorDoc?.nameTelugu || '';

      const isCash = sale.isCashSale || !sale.customer || sale.customerName === 'Cash';
      const customerName = isCash ? 'Cash' : (sale.customer?.name || sale.customerName || 'Cash');
      const customerId = isCash ? 'cash' : String(sale.customer?._id || sale.customer || 'cash');

      if (!vendorsMap.has(vendorId)) {
        vendorsMap.set(vendorId, {
          vendorId,
          vendorName,
          vendorNameTelugu,
          materialsMap: new Map(),
          bagCount: 0,
          totalKg: 0,
          totalAmount: 0,
        });
      }
      const vendObj = vendorsMap.get(vendorId);

      for (const line of sale.lines || []) {
        const matDoc = line.material && typeof line.material === 'object' ? line.material : null;
        const materialId = String(matDoc?._id || line.material || line.materialName || '');
        const materialName = matDoc?.name || line.materialName || 'Item';
        const materialNameTelugu = matDoc?.nameTelugu || '';

        if (!vendObj.materialsMap.has(materialId)) {
          vendObj.materialsMap.set(materialId, {
            materialId,
            materialName,
            materialNameTelugu,
            entries: [],
            bagCount: 0,
            totalKg: 0,
            totalAmount: 0,
          });
        }
        const matObj = vendObj.materialsMap.get(materialId);

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

        matObj.entries.push({
          saleId: sale._id,
          serialNo: sale.serialNo != null ? sale.serialNo : 0,
          createdAt: sale.createdAt,
          customerId,
          name: customerName,
          bags: bagStrList,
          count,
          weight: Number(lineTotalKg.toFixed(1)),
          rate,
          amount: Math.round(lineAmount),
        });

        matObj.bagCount += count;
        matObj.totalKg += lineTotalKg;
        matObj.totalAmount += lineAmount;

        vendObj.bagCount += count;
        vendObj.totalKg += lineTotalKg;
        vendObj.totalAmount += lineAmount;
      }
    }

    const materialSummaryMap = new Map();

    const columns = [...vendorsMap.values()]
      .sort((a, b) => String(a.vendorName || '').localeCompare(String(b.vendorName || ''), 'en', { sensitivity: 'base', numeric: true }))
      .map((vend) => ({
        vendorId: vend.vendorId,
        vendorName: vend.vendorName,
        vendorNameTelugu: vend.vendorNameTelugu,
        bagCount: vend.bagCount,
        totalKg: Number(vend.totalKg.toFixed(1)),
        totalAmount: Math.round(vend.totalAmount || 0),
        materials: [...vend.materialsMap.values()]
          .sort((a, b) => String(a.materialName || '').localeCompare(String(b.materialName || ''), 'en', { sensitivity: 'base', numeric: true }))
          .map((mat) => {
            const matKey = mat.materialName || mat.materialId;
            if (!materialSummaryMap.has(matKey)) {
              materialSummaryMap.set(matKey, {
                materialId: mat.materialId,
                materialName: mat.materialName,
                materialNameTelugu: mat.materialNameTelugu,
                bagCount: 0,
                totalKg: 0,
                totalAmount: 0,
              });
            }
            const sMat = materialSummaryMap.get(matKey);
            sMat.bagCount += mat.bagCount;
            sMat.totalKg += mat.totalKg;
            sMat.totalAmount += mat.totalAmount;

            return {
              materialId: mat.materialId,
              materialName: mat.materialName,
              materialNameTelugu: mat.materialNameTelugu,
              bagCount: mat.bagCount,
              totalKg: Number(mat.totalKg.toFixed(1)),
              totalAmount: Math.round(mat.totalAmount || 0),
              entries: mat.entries,
            };
          }),
      }));

    const materialSummary = [...materialSummaryMap.values()]
      .sort((a, b) => String(a.materialName || '').localeCompare(String(b.materialName || ''), 'en', { sensitivity: 'base', numeric: true }))
      .map((m) => ({
        materialId: m.materialId,
        materialName: m.materialName,
        materialNameTelugu: m.materialNameTelugu,
        bagCount: m.bagCount,
        totalKg: Number(m.totalKg.toFixed(1)),
        totalAmount: Math.round(m.totalAmount || 0),
      }));

    const totalBags = columns.reduce((acc, c) => acc + (c.bagCount || 0), 0);
    const totalWeight = Number(columns.reduce((acc, c) => acc + (c.totalKg || 0), 0).toFixed(1));
    const totalAmount = Math.round(columns.reduce((acc, c) => acc + (c.totalAmount || 0), 0));

    const isCashReport = cashOnly === 'true' || cashOnly === true || isCashParam === 'true' || isCashParam === true;
    res.json({ date: start, columns, totalBags, totalWeight, totalAmount, materialSummary, isCashReport });
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
      .sort({ createdAt: 1 });

    const rows = [];

    for (const sale of sales) {
      const byMaterial = new Map();

      for (const line of sale.lines || []) {
        if (materialId && line.material?.toString() !== materialId) continue;
        const lineRate = Number(line.ratePerKg) || 0;
        if (rate !== undefined && rate !== '' && Number(rate) !== lineRate) continue;

        const key = `${line.materialName}|${lineRate}`;
        const isByBag = line.saleType === 'by_bag' || (line.bagCount > 0 && (!line.bags || line.bags.length === 0) && Number(line.totalKg) === 0);
        const lineBags = isByBag ? [] : bagKgList(line);

        const existing = byMaterial.get(key) || {
          materialName: line.materialName,
          materialId: line.material,
          ratePerKg: lineRate,
          saleType: isByBag ? 'by_bag' : 'by_weight',
          bagCount: 0,
          totalWeight: 0,
          totalAmount: 0,
          bags: [],
        };
        existing.bagCount += Number(line.bagCount) || 0;
        existing.totalWeight += Number(line.totalKg) || 0;
        existing.totalAmount += Number(line.totalAmount) || 0;
        if (lineBags.length) {
          existing.bags.push(...lineBags);
        }
        byMaterial.set(key, existing);
      }

      for (const mat of byMaterial.values()) {
        rows.push({
          id: `${sale._id}-${mat.materialName}-${mat.ratePerKg}`,
          saleId: sale._id,
          date: sale.createdAt,
          customerName: (sale.isCashSale || !sale.customer) ? 'Cash' : (sale.customer?.name || sale.customerName || 'Unknown'),
          customerId: (sale.isCashSale || !sale.customer) ? 'cash' : (sale.customer?._id || sale.customer || 'cash'),
          materialName: mat.materialName,
          materialId: mat.materialId,
          ratePerKg: mat.ratePerKg,
          bagCount: mat.bagCount,
          totalWeight: Number(mat.totalWeight.toFixed(1)),
          totalAmount: Number(mat.totalAmount.toFixed(2)),
          saleType: mat.saleType,
          bags: mat.bags || [],
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
    const { customerId, loadId, vendorId, date, lines, handlingCharges, coolyRate, coolyPerBag, isPaid, paymentType, isCashSale, customerName } =
      req.body;

    const isCash = !!isCashSale || customerId === 'cash' || String(customerId || '').toLowerCase() === 'cash' || customerName?.toLowerCase() === 'cash';

    if ((!customerId && !isCash) || !lines?.length) {
      return res.status(400).json({ message: 'Customer and sale lines are required' });
    }
    if (!loadId && !vendorId) {
      return res.status(400).json({ message: 'Vendor is required' });
    }

    let customer = null;
    if (!isCash) {
      customer = await Customer.findById(customerId);
      if (!customer) return res.status(404).json({ message: 'Customer not found' });
    }

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

    const { start: dayStart, end: dayEnd } = dayRange(saleDate);
    const nextSerialNo = await getNextSerialNo(dayStart, dayEnd);

    const isPaidBool = isCash ? true : !!isPaid;
    const paymentTypeVal = isCash ? 'Cash' : (paymentType || 'Cash');
    const paidAmountVal = isPaidBool ? saleTotal : 0;

    const sale = await Sale.create({
      customer: isCash ? null : customer._id,
      isCashSale: isCash,
      customerName: isCash ? 'Cash' : (customer?.name || ''),
      vendor: vendor._id,
      load: load._id,
      lines: processedLines,
      handlingCharges: handlingAmount,
      coolyRate: savedCoolyRate,
      coolyPerBag: savedCoolyPerBag,
      totalAmount: saleTotal,
      totalBags,
      totalWeight,
      serialNo: nextSerialNo,
      isPaid: isPaidBool,
      paymentType: paymentTypeVal,
      paidAmount: paidAmountVal,
      createdAt: Number.isNaN(when.getTime()) ? undefined : when,
    });

    if (!isCash) {
      if (!isPaidBool) {
        customer.creditBalance += saleTotal;
        await customer.save();
      }

      await Transaction.create({
        customer: customer._id,
        type: 'customer_credit',
        amount: saleTotal,
        description: `Sale${isPaidBool ? ' (Paid Direct)' : ''} - ${processedLines.map((l) => l.materialName).join(', ')}`,
        sale: sale._id,
        entryDate: when,
        balanceAfter: customer.creditBalance,
      });

      if (isPaidBool) {
        await Transaction.create({
          customer: customer._id,
          type: 'customer_payment',
          amount: saleTotal,
          cashSide: 'credit',
          paymentType: paymentTypeVal,
          description: `Direct Payment for Sale - ${processedLines.map((l) => l.materialName).join(', ')}`,
          sale: sale._id,
          entryDate: when,
          source: 'Direct Sale Payment',
          balanceAfter: customer.creditBalance,
        });
      }
    } else {
      // Direct spot Cash Sale: Cash received into business
      await Transaction.create({
        type: 'customer_payment',
        cashSide: 'credit',
        amount: saleTotal,
        paymentType: 'Cash',
        source: 'cash_entry',
        description: `Cash Sale — ${processedLines.map((l) => l.materialName).join(', ')}`,
        reason: 'Direct Cash Sale',
        sale: sale._id,
        entryDate: when,
      });
    }

    vendor.creditBalance += materialsTotal;
    await vendor.save();

    await Transaction.create({
      vendor: vendor._id,
      type: 'vendor_credit',
      amount: materialsTotal,
      description: `Sale to ${isCash ? 'Cash' : customer.name} - ${processedLines.map((l) => l.materialName).join(', ')}`,
      sale: sale._id,
      entryDate: when,
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
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const existing = await Sale.findById(req.params.id);
      if (!existing) return res.status(404).json({ message: 'Sale not found' });

      const { customerId, loadId, vendorId, date, lines, handlingCharges, coolyRate, coolyPerBag, isPaid, paymentType, isCashSale, customerName } =
        req.body;
      if (!lines?.length) {
        return res.status(400).json({ message: 'Sale lines are required' });
      }

      const isCash = isCashSale === true || customerId === 'cash' || String(customerId || '').toLowerCase() === 'cash' || customerName?.toLowerCase() === 'cash';

      let customer = null;
      if (!isCash) {
        const nextCustomerId = customerId || (existing.customer ? existing.customer.toString() : null);
        if (nextCustomerId && nextCustomerId !== 'cash') {
          customer = await Customer.findById(nextCustomerId);
        }
        if (!customer) return res.status(404).json({ message: 'Customer not found' });
      }

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
      const oldCustomer = existing.customer ? await Customer.findById(existing.customer) : null;

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

      const wasPaid = existing.isCashSale || !existing.customer || !!existing.isPaid;
      const nowPaid = isCash ? true : (isPaid !== undefined ? !!isPaid : wasPaid);
      const paymentTypeVal = isCash ? 'Cash' : (paymentType || existing.paymentType || 'Cash');

      existing.customer = isCash ? null : customer._id;
      existing.isCashSale = isCash;
      existing.customerName = isCash ? 'Cash' : (customer?.name || '');
      existing.vendor = vendor._id;
      existing.load = load._id;
      existing.lines = processedLines;
      existing.handlingCharges = handlingAmount;
      existing.coolyRate = savedCoolyRate;
      existing.coolyPerBag = savedCoolyPerBag;
      existing.totalAmount = saleTotal;
      existing.totalBags = totalBags;
      existing.totalWeight = totalWeight;
      existing.isPaid = nowPaid;
      existing.paymentType = paymentTypeVal;
      existing.paidAmount = nowPaid ? saleTotal : 0;
      if (date) {
        const parsedDate = new Date(date);
        if (!isNaN(parsedDate.getTime())) {
          existing.createdAt = parsedDate;
        }
      }
      await existing.save();

      if (oldCustomer && !isCash) {
        if (oldCustomer._id.toString() === customer._id.toString()) {
          if (!wasPaid && !nowPaid) {
            oldCustomer.creditBalance = Math.max(0, Number((oldCustomer.creditBalance - oldSaleTotal + saleTotal).toFixed(2)));
          } else if (!wasPaid && nowPaid) {
            oldCustomer.creditBalance = Math.max(0, Number((oldCustomer.creditBalance - oldSaleTotal).toFixed(2)));
          } else if (wasPaid && !nowPaid) {
            oldCustomer.creditBalance = Number((oldCustomer.creditBalance + saleTotal).toFixed(2));
          }
          await oldCustomer.save();
        } else {
          if (!wasPaid) {
            oldCustomer.creditBalance = Math.max(0, Number((oldCustomer.creditBalance - oldSaleTotal).toFixed(2)));
            await oldCustomer.save();
          }
          if (!nowPaid) {
            customer.creditBalance = Number((customer.creditBalance + saleTotal).toFixed(2));
            await customer.save();
          }
        }
      } else if (oldCustomer && isCash) {
        if (!wasPaid) {
          oldCustomer.creditBalance = Math.max(0, Number((oldCustomer.creditBalance - oldSaleTotal).toFixed(2)));
          await oldCustomer.save();
        }
      } else if (!isCash && !nowPaid) {
        customer.creditBalance = Number((customer.creditBalance + saleTotal).toFixed(2));
        await customer.save();
      }

      const refreshedCustomer = customer ? await Customer.findById(customer._id) : null;

      if (oldVendor && oldVendor._id.toString() !== vendor._id.toString()) {
        oldVendor.creditBalance = Math.max(0, Number((oldVendor.creditBalance - oldMaterialsTotal).toFixed(2)));
        await oldVendor.save();
        vendor.creditBalance = Number((vendor.creditBalance + materialsTotal).toFixed(2));
        await vendor.save();
      } else if (oldVendor) {
        oldVendor.creditBalance = Math.max(0, Number((oldVendor.creditBalance - oldMaterialsTotal + materialsTotal).toFixed(2)));
        await oldVendor.save();
      } else {
        vendor.creditBalance = Number((vendor.creditBalance + materialsTotal).toFixed(2));
        await vendor.save();
      }

      if (isCash) {
        await Transaction.deleteMany({ sale: existing._id, type: 'customer_credit' });
        const existingPayTx = await Transaction.findOne({ sale: existing._id, type: 'customer_payment' });
        if (existingPayTx) {
          existingPayTx.customer = null;
          existingPayTx.amount = saleTotal;
          existingPayTx.cashSide = 'credit';
          existingPayTx.paymentType = 'Cash';
          existingPayTx.source = 'cash_entry';
          existingPayTx.description = `Cash Sale — ${processedLines.map((l) => l.materialName).join(', ')}`;
          existingPayTx.reason = 'Direct Cash Sale';
          existingPayTx.entryDate = existing.createdAt;
          existingPayTx.balanceAfter = 0;
          await existingPayTx.save();
        } else {
          await Transaction.create({
            type: 'customer_payment',
            cashSide: 'credit',
            amount: saleTotal,
            paymentType: 'Cash',
            source: 'cash_entry',
            description: `Cash Sale — ${processedLines.map((l) => l.materialName).join(', ')}`,
            reason: 'Direct Cash Sale',
            sale: existing._id,
            entryDate: existing.createdAt,
          });
        }
      } else {
        const desc = `Sale${nowPaid ? ' (Paid Direct)' : ''} - ${processedLines.map((l) => l.materialName).join(', ')}`;
        await Transaction.updateMany(
          { sale: existing._id, type: 'customer_credit' },
          {
            $set: {
              customer: customer._id,
              amount: saleTotal,
              description: desc,
              entryDate: existing.createdAt,
              balanceAfter: refreshedCustomer?.creditBalance || 0,
            },
          }
        );

        if (nowPaid) {
          const existingPayTx = await Transaction.findOne({ sale: existing._id, type: 'customer_payment' });
          if (existingPayTx) {
            existingPayTx.customer = customer._id;
            existingPayTx.amount = saleTotal;
            existingPayTx.paymentType = paymentTypeVal;
            existingPayTx.entryDate = existing.createdAt;
            existingPayTx.balanceAfter = refreshedCustomer?.creditBalance || 0;
            await existingPayTx.save();
          } else {
            await Transaction.create({
              customer: customer._id,
              type: 'customer_payment',
              amount: saleTotal,
              paymentType: paymentTypeVal,
              description: `Direct Payment for Sale - ${processedLines.map((l) => l.materialName).join(', ')}`,
              sale: existing._id,
              entryDate: existing.createdAt,
              source: 'Direct Sale Payment',
              balanceAfter: refreshedCustomer?.creditBalance || 0,
            });
          }
        } else {
          await Transaction.deleteMany({ sale: existing._id, type: 'customer_payment' });
        }
      }

      const vendorNow = await Vendor.findById(vendor._id);
      await Transaction.updateMany(
        { sale: existing._id, type: 'vendor_credit' },
        {
          $set: {
            vendor: vendor._id,
            amount: materialsTotal,
            description: `Sale to ${isCash ? 'Cash' : customer.name} - ${processedLines.map((l) => l.materialName).join(', ')}`,
            entryDate: existing.createdAt,
            balanceAfter: vendorNow?.creditBalance || 0,
          },
        }
      );

      const populated = await Sale.findById(existing._id)
        .populate('customer', 'name nameTelugu city state mobile address creditBalance')
        .populate('vendor', 'name nameTelugu city creditBalance')
        .populate('load', 'createdAt totalWeight');

      return res.json(populated);
    } catch (error) {
      if (error.name === 'VersionError' && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 50 * attempt));
        continue;
      }
      return res.status(error.status || 400).json({ message: error.message });
    }
  }
});

router.patch('/:id/toggle-paid', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });

    const targetIsPaid = req.body.isPaid !== undefined ? !!req.body.isPaid : !sale.isPaid;
    const paymentTypeVal = req.body.paymentType || sale.paymentType || 'Cash';

    if (sale.isPaid === targetIsPaid) {
      return res.json(sale);
    }

    const customer = await Customer.findById(sale.customer);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    sale.isPaid = targetIsPaid;
    sale.paymentType = paymentTypeVal;
    sale.paidAmount = targetIsPaid ? sale.totalAmount : 0;
    await sale.save();

    if (targetIsPaid) {
      // Unpaid -> Paid: Subtract from customer credit balance since it's paid direct
      customer.creditBalance = Math.max(0, Number((customer.creditBalance - sale.totalAmount).toFixed(2)));
      await customer.save();

      // Create a customer_payment transaction
      await Transaction.create({
        customer: customer._id,
        type: 'customer_payment',
        amount: sale.totalAmount,
        paymentType: paymentTypeVal,
        description: `Direct Payment for Sale #${sale.serialNo || ''}`,
        sale: sale._id,
        entryDate: sale.createdAt,
        source: 'Direct Sale Payment',
        balanceAfter: customer.creditBalance,
      });

      // Update customer credit transaction description
      await Transaction.updateMany(
        { sale: sale._id, type: 'customer_credit' },
        { $set: { description: `Sale (Paid Direct) - ${(sale.lines || []).map((l) => l.materialName).join(', ')}` } }
      );
    } else {
      // Paid -> Unpaid: Re-add to customer credit balance
      customer.creditBalance = Number((customer.creditBalance + sale.totalAmount).toFixed(2));
      await customer.save();

      // Delete the customer_payment transaction
      await Transaction.deleteMany({ sale: sale._id, type: 'customer_payment' });

      // Reset customer credit transaction description
      await Transaction.updateMany(
        { sale: sale._id, type: 'customer_credit' },
        { $set: { description: `Sale - ${(sale.lines || []).map((l) => l.materialName).join(', ')}` } }
      );
    }

    const populated = await Sale.findById(sale._id)
      .populate('customer', 'name nameTelugu city state mobile address creditBalance')
      .populate('vendor', 'name nameTelugu city creditBalance')
      .populate('load', 'createdAt totalWeight');

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to toggle paid status' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ message: 'Sale not found' });

    if (sale.customer && !sale.isPaid) {
      const customer = await Customer.findById(sale.customer);
      if (customer) {
        customer.creditBalance = Math.max(0, Number((customer.creditBalance - (Number(sale.totalAmount) || 0)).toFixed(2)));
        await customer.save();
      }
    }

    if (sale.vendor) {
      const vendor = await Vendor.findById(sale.vendor);
      if (vendor) {
        const materialsTotal = (sale.lines || []).reduce((s, l) => s + (Number(l.totalAmount) || 0), 0);
        vendor.creditBalance = Math.max(0, Number((vendor.creditBalance - materialsTotal).toFixed(2)));
        await vendor.save();
      }
    }

    await Transaction.deleteMany({ sale: sale._id });
    await Sale.findByIdAndDelete(req.params.id);

    res.json({ message: 'Sale entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Failed to delete sale entry' });
  }
});

export default router;


