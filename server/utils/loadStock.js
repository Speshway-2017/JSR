import Load from '../models/Load.js';
import Sale from '../models/Sale.js';

/** Remaining kg per material for a single load */
export async function getLoadStockMap(loadId) {
  const [load, sales] = await Promise.all([
    Load.findById(loadId).select('materials.material materials.totalKg totalWeight'),
    Sale.find({ load: loadId }).select('lines.material lines.totalKg lines.bagCount'),
  ]);

  if (!load) return null;

  const stockMap = new Map();
  for (const mat of load.materials) {
    const key = mat.material?.toString();
    if (!key) continue;
    stockMap.set(key, Number(mat.totalKg || 0));
  }

  for (const sale of sales) {
    for (const line of sale.lines || []) {
      const key = line.material?.toString();
      if (!key) continue;
      stockMap.set(key, (stockMap.get(key) || 0) - Number(line.totalKg || 0));
    }
  }

  return stockMap;
}

export function getAvailableKg(stockMap, materialId) {
  return Number((Math.max(0, stockMap.get(materialId?.toString()) || 0)).toFixed(1));
}

/** Attach sold/remaining/status to a load document */
export async function enrichLoadStatus(load) {
  const loadObj = load.toObject ? load.toObject() : { ...load };
  const stockMap = await getLoadStockMap(loadObj._id);

  let remainingWeight = 0;
  let soldWeight = 0;

  const materials = (loadObj.materials || []).map((mat) => {
    const key = mat.material?._id?.toString() || mat.material?.toString();
    const original = Number(mat.totalKg || 0);
    const remaining = key ? getAvailableKg(stockMap, key) : 0;
    const sold = Number((original - remaining).toFixed(1));
    remainingWeight += remaining;
    soldWeight += sold;
    return {
      ...mat,
      remainingKg: remaining,
      soldKg: sold,
    };
  });

  remainingWeight = Number(remainingWeight.toFixed(1));
  soldWeight = Number(soldWeight.toFixed(1));
  const status = remainingWeight <= 0 ? 'sold_out' : 'pending';

  return {
    ...loadObj,
    materials,
    remainingWeight,
    soldWeight,
    status,
    billGenerated: !!loadObj.billGeneratedAt,
  };
}

export async function enrichLoadsStatus(loads) {
  return Promise.all(loads.map((load) => enrichLoadStatus(load)));
}
