import Sale from '../models/Sale.js';
import Load from '../models/Load.js';
import PriceSettings from '../models/PriceSettings.js';
import { enrichLoadStatus } from './loadStock.js';
import {
  buildDeductionsFromRates,
  emptyRatesFromSettings,
  migrateLegacySettings,
  DEDUCTION_FIELDS,
} from './deductionFields.js';

export { DEDUCTION_FIELDS };

export function dayRange(dateStr) {
  const start = new Date(dateStr);
  start.setHours(0, 0, 0, 0);
  const end = new Date(dateStr);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Ensure a Load row exists for vendor + calendar day (bill container; sales imply load). */
export async function findOrCreateDayLoad(vendorId, dateStr) {
  const { start, end } = dayRange(dateStr);
  let load = await Load.findOne({
    vendor: vendorId,
    $or: [
      { loadDate: { $gte: start, $lte: end } },
      { loadDate: { $exists: false }, createdAt: { $gte: start, $lte: end } },
    ],
  });
  if (load) return load;

  const when = new Date(dateStr);
  if (Number.isNaN(when.getTime())) {
    throw new Error('Invalid date');
  }
  when.setHours(12, 0, 0, 0);

  load = await Load.create({
    vendor: vendorId,
    loadDate: when,
    materials: [],
    totalWeight: 0,
  });
  return load;
}

/** Normalize any rates payload (new or legacy) into full deduction rates */
export function normalizeRates(raw = {}, settingsDoc = null) {
  const settings = emptyRatesFromSettings(migrateLegacySettings(settingsDoc || {}));
  const incoming = { ...raw };

  // Legacy aliases → new keys
  if (incoming.cooly === undefined && incoming.labour !== undefined) {
    incoming.cooly = incoming.labour;
  }
  if (incoming.cooly === undefined && incoming.handlingCharges !== undefined) {
    incoming.cooly = Number(incoming.labour || 0) + Number(incoming.handlingCharges || 0);
  }
  if (incoming.rusumu === undefined && incoming.bill !== undefined) {
    incoming.rusumu = incoming.bill;
  }
  if (incoming.union === undefined && incoming.unionCharges !== undefined) {
    incoming.union = incoming.unionCharges;
  }
  if (incoming.commission === undefined && incoming.commissionPercent !== undefined) {
    incoming.commission = incoming.commissionPercent;
    if (incoming.commissionPerBag === undefined) incoming.commissionPerBag = false;
  }

  const rates = { ...settings };
  for (const f of DEDUCTION_FIELDS) {
    if (incoming[f.key] !== undefined) rates[f.key] = Math.max(0, Number(incoming[f.key]) || 0);
    const flag = `${f.key}PerBag`;
    if (incoming[flag] !== undefined) rates[flag] = !!incoming[flag];
  }
  if (incoming.bagLessUnder50 !== undefined) {
    rates.bagLessUnder50 = Math.max(0, Number(incoming.bagLessUnder50) || 0);
  }
  if (incoming.bagLessOver50 !== undefined) {
    rates.bagLessOver50 = Math.max(0, Number(incoming.bagLessOver50) || 0);
  }
  return rates;
}

export function buildDeductions({ grossTotal, totalBags, rates, handlingCharges }) {
  const normalized = normalizeRates({
    ...rates,
    // fold old handling into cooly if cooly not set
    cooly:
      rates?.cooly !== undefined
        ? rates.cooly
        : Number(rates?.labour || 0) + Number(handlingCharges || 0),
  });
  return buildDeductionsFromRates({ grossTotal, totalBags, rates: normalized });
}

/**
 * Vendor bill bag tare:
 * - bag >= 50kg → bill kg − rates.bagLessOver50 (default 2)
 * - bag < 50kg → bill kg − rates.bagLessUnder50 (default 1)
 */
export function billKgForBag(grossKg, rates = {}) {
  const kgs = Number(grossKg) || 0;
  if (kgs <= 0) return 0;
  const under50 =
    rates.bagLessUnder50 !== undefined && rates.bagLessUnder50 !== null
      ? Number(rates.bagLessUnder50)
      : 1;
  const over50 =
    rates.bagLessOver50 !== undefined && rates.bagLessOver50 !== null
      ? Number(rates.bagLessOver50)
      : 2;
  const tare = kgs >= 50 ? over50 : under50;
  return Math.max(0, Number((kgs - tare).toFixed(1)));
}

/** Expand a sale line into per-bag gross weights (synthesizes equal bags if only totals exist). */
function lineBagGrossWeights(line) {
  const bags = line.bags || [];
  const weights = [];
  if (bags.length) {
    for (const bag of bags) {
      const kgs = Number(bag.kgs);
      if (kgs > 0) weights.push(kgs);
    }
  } else if (Number(line.totalKg) > 0) {
    const n = Math.max(1, Math.floor(Number(line.bagCount) || 1));
    const each = Number(line.totalKg) / n;
    for (let i = 0; i < n; i++) weights.push(each);
  }
  return weights;
}

/** Billed totals for one sale line after per-bag tare. */
function lineVendorBillTotals(line, rates = {}) {
  const rate = Number(line.ratePerKg) || 0;
  const grossWeights = lineBagGrossWeights(line);
  let totalKg = 0;
  for (const kgs of grossWeights) {
    totalKg += billKgForBag(kgs, rates);
  }
  totalKg = Number(totalKg.toFixed(1));
  return {
    materialName: line.materialName,
    bagCount: grossWeights.length,
    totalKg,
    ratePerKg: rate,
    totalAmount: Number((totalKg * rate).toFixed(2)),
  };
}

/**
 * Flat bag weights + per-material rows for రైతుపట్టి (tare applied).
 * Each rateLine includes bags: [{ bagNo, billKg, grossKg }].
 */
export function extractSaleDetails(sales, rates = {}) {
  const bagWeights = [];
  const groupMap = new Map();

  for (const sale of sales) {
    for (const line of sale.lines || []) {
      const rate = Number(line.ratePerKg) || 0;
      const key = `${line.materialName}__${rate}`;
      const grossWeights = lineBagGrossWeights(line);
      if (!grossWeights.length) continue;

      const existing = groupMap.get(key) || {
        materialName: line.materialName,
        ratePerKg: rate,
        bags: [],
        bagCount: 0,
        totalKg: 0,
        totalAmount: 0,
      };

      for (const kgs of grossWeights) {
        const billKg = billKgForBag(kgs, rates);
        existing.bags.push({
          bagNo: existing.bags.length + 1,
          billKg,
          grossKg: Number(Number(kgs).toFixed(1)),
        });
        bagWeights.push(billKg);
        existing.totalKg += billKg;
      }

      existing.bagCount = existing.bags.length;
      existing.totalKg = Number(existing.totalKg.toFixed(1));
      existing.totalAmount = Number((existing.totalKg * rate).toFixed(2));
      groupMap.set(key, existing);
    }
  }

  const rateLines = Array.from(groupMap.values()).sort(
    (a, b) => a.materialName.localeCompare(b.materialName) || a.ratePerKg - b.ratePerKg
  );

  return { bagWeights, rateLines };
}

export function groupSalesMaterials(sales, rates = {}) {
  const groupMap = new Map();
  for (const sale of sales) {
    for (const line of sale.lines || []) {
      const billed = lineVendorBillTotals(line, rates);
      if (billed.bagCount <= 0) continue;
      const key = `${billed.materialName}__${Number(billed.ratePerKg)}`;
      const existing = groupMap.get(key) || {
        materialName: billed.materialName,
        ratePerKg: billed.ratePerKg,
        bagCount: 0,
        totalKg: 0,
        totalAmount: 0,
      };
      existing.bagCount += billed.bagCount;
      existing.totalKg += billed.totalKg;
      existing.totalAmount += billed.totalAmount;
      groupMap.set(key, existing);
    }
  }

  const groups = Array.from(groupMap.values()).sort(
    (a, b) => a.materialName.localeCompare(b.materialName) || a.ratePerKg - b.ratePerKg
  );

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
  return { byMaterial, grossTotal, totalBags };
}

export async function buildLoadBill(load, ratesOverride) {
  const [sales, settings, enriched] = await Promise.all([
    Sale.find({ load: load._id }).sort({ createdAt: 1 }),
    PriceSettings.findOne(),
    enrichLoadStatus(load),
  ]);

  const defaults = emptyRatesFromSettings(migrateLegacySettings(settings));
  const rates = normalizeRates(ratesOverride || load.billSnapshot || defaults, settings);

  const { byMaterial, grossTotal, totalBags } = groupSalesMaterials(sales, rates);
  const { bagWeights, rateLines } = extractSaleDetails(sales, rates);

  const deductions = buildDeductions({
    grossTotal,
    totalBags,
    rates,
    handlingCharges: load.handlingCharges,
  });

  const receivable = Number((grossTotal - deductions.total).toFixed(2));

  return {
    load: {
      _id: enriched._id,
      createdAt: enriched.createdAt,
      loadDate: enriched.loadDate || enriched.createdAt,
      totalWeight: enriched.totalWeight,
      remainingWeight: enriched.remainingWeight,
      soldWeight: enriched.soldWeight,
      status: enriched.status,
      handlingCharges: enriched.handlingCharges,
      materials: enriched.materials,
      billGenerated: !!load.billGeneratedAt,
      billGeneratedAt: load.billGeneratedAt || null,
    },
    vendor: load.vendor,
    materials: byMaterial,
    bagWeights,
    rateLines,
    ratesUsed: rates,
    defaults,
    summary: {
      totalBags,
      grossTotal: Number(grossTotal.toFixed(2)),
      deductions,
      receivable,
    },
  };
}

/**
 * Sale Patty: bill from sales of a vendor on a calendar day.
 * Requires a load arrival for that vendor on that day.
 */
export async function buildVendorDayBill(vendor, load, dateStr, ratesOverride) {
  const { start, end } = dayRange(dateStr);
  const [sales, settings] = await Promise.all([
    Sale.find({
      vendor: vendor._id || vendor,
      createdAt: { $gte: start, $lte: end },
    }).sort({ createdAt: 1 }),
    PriceSettings.findOne(),
  ]);

  const defaults = emptyRatesFromSettings(migrateLegacySettings(settings));
  const rates = normalizeRates(ratesOverride || load.billSnapshot || defaults, settings);

  const { byMaterial, grossTotal, totalBags } = groupSalesMaterials(sales, rates);
  const { bagWeights, rateLines } = extractSaleDetails(sales, rates);
  const enriched = await enrichLoadStatus(load);

  const deductions = buildDeductions({
    grossTotal,
    totalBags,
    rates,
    handlingCharges: load.handlingCharges || 0,
  });

  const receivable = Number((grossTotal - deductions.total).toFixed(2));

  return {
    date: dateStr,
    load: {
      _id: enriched._id,
      createdAt: enriched.createdAt,
      loadDate: enriched.loadDate || enriched.createdAt,
      totalWeight: enriched.totalWeight,
      soldWeight: enriched.soldWeight,
      status: enriched.status,
      handlingCharges: enriched.handlingCharges,
      billGenerated: !!load.billGeneratedAt,
      billGeneratedAt: load.billGeneratedAt || null,
    },
    vendor,
    materials: byMaterial,
    bagWeights,
    rateLines,
    saleCount: sales.length,
    ratesUsed: rates,
    defaults,
    summary: {
      totalBags,
      grossTotal: Number(grossTotal.toFixed(2)),
      deductions,
      receivable,
    },
  };
}
