import express from 'express';
import Vendor from '../models/Vendor.js';
import Customer from '../models/Customer.js';
import Material from '../models/Material.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import { auth, requireRole } from '../middleware/auth.js';
import { apiErrorMessage } from '../utils/apiError.js';
import { getAvailableKg, getMaterialStockMap } from '../utils/stock.js';

const router = express.Router();
router.use(auth);
router.use(requireRole('admin'));

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function dayKey(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(key) {
  const [, m, d] = key.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(d)} ${months[Number(m) - 1]}`;
}

function lastNDayKeys(n) {
  const keys = [];
  const today = startOfDay(new Date());
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    keys.push(dayKey(d));
  }
  return keys;
}

/** Business overview for admin dashboard charts */
router.get('/overview', async (_req, res) => {
  try {
    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const monthStart = startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    const trendStart = startOfDay(new Date());
    trendStart.setDate(trendStart.getDate() - 13);

    const [
      vendors,
      customers,
      materials,
      stockMap,
      sales,
      purchases,
      salesToday,
      salesMonth,
      purchasesMonth,
    ] = await Promise.all([
      Vendor.find().select('name creditBalance').lean(),
      Customer.find().select('name creditBalance').lean(),
      Material.find().select('name').sort({ name: 1 }).lean(),
      getMaterialStockMap(),
      Sale.find({ createdAt: { $gte: trendStart } })
        .populate('customer', 'name')
        .populate('vendor', 'name')
        .sort({ createdAt: -1 })
        .lean(),
      Purchase.find({ purchaseDate: { $gte: trendStart } })
        .populate('vendor', 'name')
        .lean(),
      Sale.find({ createdAt: { $gte: todayStart, $lte: todayEnd } })
        .select('totalAmount totalWeight totalBags')
        .lean(),
      Sale.find({ createdAt: { $gte: monthStart } })
        .select('totalAmount totalWeight')
        .lean(),
      Purchase.find({ purchaseDate: { $gte: monthStart } })
        .select('totalAmount totalWeight')
        .lean(),
    ]);

    const vendorPayable = vendors.reduce((s, v) => s + (Number(v.creditBalance) || 0), 0);
    const customerCredit = customers.reduce((s, c) => s + (Number(c.creditBalance) || 0), 0);

    const sumAmt = (rows) => rows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
    const sumKg = (rows) => rows.reduce((s, r) => s + (Number(r.totalWeight) || 0), 0);

    const dayKeys = lastNDayKeys(14);
    const salesByDay = Object.fromEntries(dayKeys.map((k) => [k, { amount: 0, kg: 0, count: 0 }]));
    const purchaseByDay = Object.fromEntries(dayKeys.map((k) => [k, { amount: 0, kg: 0, count: 0 }]));

    const materialSales = new Map();
    const customerSales = new Map();
    const vendorSales = new Map();

    for (const sale of sales) {
      const key = dayKey(sale.createdAt);
      if (salesByDay[key]) {
        salesByDay[key].amount += Number(sale.totalAmount) || 0;
        salesByDay[key].kg += Number(sale.totalWeight) || 0;
        salesByDay[key].count += 1;
      }

      const custId = sale.customer?._id?.toString() || sale.customer?.toString();
      if (custId) {
        const prev = customerSales.get(custId) || {
          id: custId,
          name: sale.customer?.name || 'Customer',
          amount: 0,
          kg: 0,
        };
        prev.amount += Number(sale.totalAmount) || 0;
        prev.kg += Number(sale.totalWeight) || 0;
        customerSales.set(custId, prev);
      }

      const vendId = sale.vendor?._id?.toString() || sale.vendor?.toString();
      if (vendId) {
        const prev = vendorSales.get(vendId) || {
          id: vendId,
          name: sale.vendor?.name || 'Vendor',
          amount: 0,
          kg: 0,
        };
        prev.amount += Number(sale.totalAmount) || 0;
        prev.kg += Number(sale.totalWeight) || 0;
        vendorSales.set(vendId, prev);
      }

      for (const line of sale.lines || []) {
        const name = line.materialName || 'Material';
        const prev = materialSales.get(name) || { name, amount: 0, kg: 0, bags: 0 };
        prev.amount += Number(line.totalAmount) || 0;
        prev.kg += Number(line.totalKg) || 0;
        prev.bags += Number(line.bagCount) || 0;
        materialSales.set(name, prev);
      }
    }

    for (const purchase of purchases) {
      const key = dayKey(purchase.purchaseDate || purchase.createdAt);
      if (purchaseByDay[key]) {
        purchaseByDay[key].amount += Number(purchase.totalAmount) || 0;
        purchaseByDay[key].kg += Number(purchase.totalWeight) || 0;
        purchaseByDay[key].count += 1;
      }
    }

    const salesTrend = dayKeys.map((key) => ({
      date: key,
      label: dayLabel(key),
      sales: Number(salesByDay[key].amount.toFixed(0)),
      salesKg: Number(salesByDay[key].kg.toFixed(1)),
      purchases: Number(purchaseByDay[key].amount.toFixed(0)),
      purchaseKg: Number(purchaseByDay[key].kg.toFixed(1)),
    }));

    const inventory = materials
      .map((m) => ({
        id: m._id,
        name: m.name,
        availableKg: Math.max(0, getAvailableKg(stockMap, m._id)),
      }))
      .filter((m) => m.availableKg > 0)
      .sort((a, b) => b.availableKg - a.availableKg)
      .slice(0, 10);

    const totalInventoryKg = materials.reduce(
      (s, m) => s + Math.max(0, getAvailableKg(stockMap, m._id)),
      0
    );

    const topMaterials = [...materialSales.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8)
      .map((m) => ({
        ...m,
        amount: Number(m.amount.toFixed(0)),
        kg: Number(m.kg.toFixed(1)),
      }));

    const topCustomers = [...customerSales.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
      .map((c) => ({ ...c, amount: Number(c.amount.toFixed(0)), kg: Number(c.kg.toFixed(1)) }));

    const topVendors = [...vendorSales.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
      .map((v) => ({ ...v, amount: Number(v.amount.toFixed(0)), kg: Number(v.kg.toFixed(1)) }));

    const recentSales = sales.slice(0, 8).map((s) => ({
      _id: s._id,
      totalAmount: s.totalAmount,
      totalWeight: s.totalWeight,
      createdAt: s.createdAt,
      customer: s.customer ? { _id: s.customer._id, name: s.customer.name } : null,
      vendor: s.vendor ? { _id: s.vendor._id, name: s.vendor.name } : null,
    }));

    const payables = [
      { name: 'Vendor payable', value: Number(vendorPayable.toFixed(0)), fill: '#9f8668' },
      { name: 'Customer credit', value: Number(customerCredit.toFixed(0)), fill: '#637d6c' },
    ];

    res.json({
      summary: {
        vendors: vendors.length,
        customers: customers.length,
        materials: materials.length,
        salesToday: salesToday.length,
        salesTodayAmount: Number(sumAmt(salesToday).toFixed(0)),
        salesMonthAmount: Number(sumAmt(salesMonth).toFixed(0)),
        salesMonthKg: Number(sumKg(salesMonth).toFixed(1)),
        purchasesMonthAmount: Number(sumAmt(purchasesMonth).toFixed(0)),
        purchasesMonthKg: Number(sumKg(purchasesMonth).toFixed(1)),
        vendorPayable: Number(vendorPayable.toFixed(0)),
        customerCredit: Number(customerCredit.toFixed(0)),
        inventoryKg: Number(totalInventoryKg.toFixed(1)),
      },
      salesTrend,
      topMaterials,
      topCustomers,
      topVendors,
      inventory,
      payables,
      recentSales,
    });
  } catch (error) {
    res.status(500).json({ message: apiErrorMessage(error) });
  }
});

export default router;
