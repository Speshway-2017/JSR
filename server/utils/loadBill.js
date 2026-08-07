import Sale from '../models/Sale.js';
import PriceSettings from '../models/PriceSettings.js';
import { enrichLoadStatus } from './loadStock.js';

export function buildDeductions({ grossTotal, totalBags, handlingCharges, rates }) {
  const labour = Math.max(0, Number(rates.labour) || 0);
  const aaseelu = Math.max(0, Number(rates.aaseelu) || 0);
  const bill = Math.max(0, Number(rates.bill) || 0);
  const unionCharges = Math.max(0, Number(rates.unionCharges) || 0);
  const commissionPercent = Math.min(100, Math.max(0, Number(rates.commissionPercent) || 0));

  const bagChargesTotal = Number(((labour + aaseelu + bill + unionCharges) * totalBags).toFixed(2));
  const commission = Number(((grossTotal * commissionPercent) / 100).toFixed(2));
  const handling = Number(handlingCharges || 0);

  return {
    handlingCharges: Number(handling.toFixed(2)),
    labour: Number((labour * totalBags).toFixed(2)),
    aaseelu: Number((aaseelu * totalBags).toFixed(2)),
    bill: Number((bill * totalBags).toFixed(2)),
    unionCharges: Number((unionCharges * totalBags).toFixed(2)),
    commissionPercent,
    commission,
    perBagRates: { labour, aaseelu, bill, unionCharges },
    bagChargesTotal,
    total: Number((handling + bagChargesTotal + commission).toFixed(2)),
  };
}

export async function buildLoadBill(load, ratesOverride) {
  const [sales, settings, enriched] = await Promise.all([
    Sale.find({ load: load._id }).sort({ createdAt: 1 }),
    PriceSettings.findOne(),
    enrichLoadStatus(load),
  ]);

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

  const rates =
    ratesOverride ||
    load.billSnapshot || {
      labour: settings?.labour || 0,
      aaseelu: settings?.aaseelu || 0,
      bill: settings?.bill || 0,
      unionCharges: settings?.unionCharges || 0,
      commissionPercent: settings?.commissionPercent || 0,
    };

  const deductions = buildDeductions({
    grossTotal,
    totalBags,
    handlingCharges: load.handlingCharges,
    rates,
  });

  const receivable = Number((grossTotal - deductions.total).toFixed(2));

  return {
    load: {
      _id: enriched._id,
      createdAt: enriched.createdAt,
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
    ratesUsed: {
      labour: deductions.perBagRates.labour,
      aaseelu: deductions.perBagRates.aaseelu,
      bill: deductions.perBagRates.bill,
      unionCharges: deductions.perBagRates.unionCharges,
      commissionPercent: deductions.commissionPercent,
    },
    defaults: {
      labour: Number(settings?.labour || 0),
      aaseelu: Number(settings?.aaseelu || 0),
      bill: Number(settings?.bill || 0),
      unionCharges: Number(settings?.unionCharges || 0),
      commissionPercent: Number(settings?.commissionPercent || 0),
    },
    summary: {
      totalBags,
      grossTotal: Number(grossTotal.toFixed(2)),
      deductions,
      receivable,
    },
  };
}
