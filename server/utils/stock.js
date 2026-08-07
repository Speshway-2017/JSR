import Load from '../models/Load.js';
import Sale from '../models/Sale.js';

/** Global stock per material (all vendors) */
export async function getMaterialStockMap() {
  const [loads, sales] = await Promise.all([
    Load.find().select('materials.material materials.totalKg'),
    Sale.find().select('lines.material lines.totalKg items.material items.quantityKg').lean(),
  ]);

  const stockMap = new Map();

  for (const load of loads) {
    for (const mat of load.materials) {
      const key = mat.material?.toString();
      if (!key) continue;
      stockMap.set(key, (stockMap.get(key) || 0) + Number(mat.totalKg || 0));
    }
  }

  for (const sale of sales) {
    const lines = sale.lines?.length
      ? sale.lines
      : (sale.items || []).map((item) => ({
          material: item.material,
          totalKg: item.quantityKg,
        }));
    for (const line of lines) {
      const key = line.material?.toString();
      if (!key) continue;
      stockMap.set(key, (stockMap.get(key) || 0) - Number(line.totalKg || 0));
    }
  }

  return stockMap;
}

/** Stock for one vendor per material */
export async function getVendorStockMap(vendorId) {
  const [loads, sales] = await Promise.all([
    Load.find({ vendor: vendorId }).select('materials.material materials.totalKg'),
    Sale.find({ vendor: vendorId }).select('lines.material lines.totalKg items.material items.quantityKg').lean(),
  ]);

  const stockMap = new Map();

  for (const load of loads) {
    for (const mat of load.materials) {
      const key = mat.material?.toString();
      if (!key) continue;
      stockMap.set(key, (stockMap.get(key) || 0) + Number(mat.totalKg || 0));
    }
  }

  for (const sale of sales) {
    const lines = sale.lines?.length
      ? sale.lines
      : (sale.items || []).map((item) => ({
          material: item.material,
          totalKg: item.quantityKg,
        }));
    for (const line of lines) {
      const key = line.material?.toString();
      if (!key) continue;
      stockMap.set(key, (stockMap.get(key) || 0) - Number(line.totalKg || 0));
    }
  }

  return stockMap;
}

export function getAvailableKg(stockMap, materialId) {
  return Number((stockMap.get(materialId?.toString()) || 0).toFixed(1));
}
