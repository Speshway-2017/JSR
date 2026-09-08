import express from 'express';
import Customer from '../models/Customer.js';
import Vendor from '../models/Vendor.js';
import Sale from '../models/Sale.js';
import Transaction from '../models/Transaction.js';
import { auth, requireRole } from '../middleware/auth.js';
import { apiErrorMessage } from '../utils/apiError.js';
import {
  txWhen,
  startOfDay,
  endOfDay,
  cashPaid,
  lessAmount,
  creditAmount,
  balanceDelta,
  particulars,
} from '../utils/customerLedger.js';

const router = express.Router();
router.use(auth);
router.use(requireRole('admin'));

/** Ledger for Customer or Vendor: sales, cash received/paid, running balance. */
router.get('/ledger', async (req, res) => {
  try {
    const { customerId, vendorId, partyType, startDate, endDate } = req.query;
    const isVendor = partyType === 'vendor' || (!customerId && !!vendorId);
    const targetId = isVendor ? vendorId : customerId;

    if (!targetId) {
      return res.status(400).json({ message: isVendor ? 'Select a vendor' : 'Select a customer' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Select a date range' });
    }

    const start = startOfDay(startDate);
    const end = endOfDay(endDate);
    if (start > end) {
      return res.status(400).json({ message: 'Start date must be before or equal to end date' });
    }

    if (isVendor) {
      const vendor = await Vendor.findById(vendorId);
      if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

      const [txs, sales] = await Promise.all([
        Transaction.find({ vendor: vendorId })
          .populate('sale', 'totalAmount createdAt lines totalBags totalWeight')
          .sort({ createdAt: 1 })
          .lean(),
        Sale.find({ vendor: vendorId })
          .populate('customer', 'name nameTelugu')
          .sort({ createdAt: 1 })
          .lean(),
      ]);

      const items = [];
      for (const tx of txs) {
        items.push({
          date: txWhen(tx),
          created: new Date(tx.createdAt),
          kind: tx.type === 'vendor_payment' ? 'paid' : 'other',
          particulars: tx.description || (tx.type === 'vendor_payment' ? 'Payment to Vendor' : 'Transaction'),
          saleAmt: 0,
          paidAmt: Number(tx.amount || 0),
          lessAmt: 0,
          delta: -Number(tx.amount || 0),
          saleId: tx.sale?._id ? String(tx.sale._id) : tx.sale ? String(tx.sale) : null,
        });
      }

      for (const sale of sales) {
        const saleAmt = Number(sale.lines?.reduce((s, l) => s + (l.totalAmount || 0), 0) || 0);
        const mats = sale.lines
          ?.map((l) => {
            const bags = Number(l.bagCount) || (Array.isArray(l.bags) ? l.bags.length : 0) || 0;
            const weight = Number(l.totalKg) || (Array.isArray(l.bags) ? l.bags.reduce((s, b) => s + (Number(b?.kgs || b) || 0), 0) : 0) || 0;
            const name = l.materialName || 'Item';
            const details = [];
            if (bags) details.push(`${bags} ${bags === 1 ? 'bag' : 'bags'}`);
            if (weight) details.push(`${weight % 1 === 0 ? weight : Number(weight.toFixed(1))} kg`);
            return details.length ? `${name} (${details.join(', ')})` : name;
          })
          .filter(Boolean)
          .join(' · ');
        items.push({
          date: new Date(sale.createdAt),
          created: new Date(sale.createdAt),
          kind: 'sale',
          particulars: `Sale to ${sale.customer?.name || 'Customer'}${mats ? ` (${mats})` : ''}`,
          saleAmt,
          paidAmt: 0,
          lessAmt: 0,
          delta: saleAmt,
          saleId: String(sale._id),
        });
      }

      items.sort((a, b) => a.date - b.date || a.created - b.created);

      let running = 0;
      let openingBalance = 0;
      const rows = [];

      for (const item of items) {
        if (item.date < start) {
          running += item.delta;
          openingBalance = running;
          continue;
        }
        if (item.date > end) break;

        running += item.delta;
        rows.push({
          id: `${item.kind}-${item.date.getTime()}-${Math.random().toString(36).slice(2, 6)}`,
          date: item.date,
          kind: item.kind,
          particulars: item.particulars,
          sale: item.saleAmt,
          paid: item.paidAmt,
          less: item.lessAmt,
          balance: Number(running.toFixed(2)),
          saleId: item.saleId,
        });
      }

      const totals = rows.reduce(
        (acc, r) => ({
          sale: acc.sale + r.sale,
          paid: acc.paid + r.paid,
          less: acc.less + r.less,
        }),
        { sale: 0, paid: 0, less: 0 }
      );

      return res.json({
        partyType: 'vendor',
        customer: {
          _id: vendor._id,
          name: vendor.name,
          nameTelugu: vendor.nameTelugu || '',
          schedule: null,
          creditBalance: vendor.creditBalance,
        },
        startDate: start,
        endDate: end,
        openingBalance: Number(openingBalance.toFixed(2)),
        closingBalance: Number(running.toFixed(2)),
        totals: {
          sale: Number(totals.sale.toFixed(2)),
          paid: Number(totals.paid.toFixed(2)),
          less: Number(totals.less.toFixed(2)),
        },
        rows,
      });
    }

    const customer = await Customer.findById(customerId).populate('schedule', 'name');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const txs = await Transaction.find({
      customer: customerId,
      type: { $in: ['customer_credit', 'customer_payment'] },
    })
      .populate('sale', 'totalAmount createdAt lines totalBags totalWeight')
      .sort({ createdAt: 1 })
      .lean();

    const ordered = txs.sort((a, b) => txWhen(a) - txWhen(b) || new Date(a.createdAt) - new Date(b.createdAt));

    let running = 0;
    let openingBalance = 0;
    const rows = [];

    for (const tx of ordered) {
      const when = txWhen(tx);
      const delta = balanceDelta(tx);
      const saleAmt = creditAmount(tx);
      const paid = cashPaid(tx);
      const less = lessAmount(tx);

      if (when < start) {
        running += delta;
        openingBalance = running;
        continue;
      }
      if (when > end) break;

      running += delta;
      rows.push({
        id: tx._id,
        date: when,
        kind: tx.sale ? 'sale' : tx.type === 'customer_payment' ? 'payment' : 'debit',
        particulars: particulars(tx),
        sale: saleAmt,
        paid,
        less,
        balance: Number(running.toFixed(2)),
        saleId: tx.sale?._id ? String(tx.sale._id) : tx.sale ? String(tx.sale) : null,
      });
    }

    const totals = rows.reduce(
      (acc, r) => ({
        sale: acc.sale + r.sale,
        paid: acc.paid + r.paid,
        less: acc.less + r.less,
      }),
      { sale: 0, paid: 0, less: 0 }
    );

    res.json({
      partyType: 'customer',
      customer: {
        _id: customer._id,
        name: customer.name,
        nameTelugu: customer.nameTelugu || '',
        schedule: customer.schedule,
        creditBalance: customer.creditBalance,
      },
      startDate: start,
      endDate: end,
      openingBalance: Number(openingBalance.toFixed(2)),
      closingBalance: Number(running.toFixed(2)),
      totals: {
        sale: Number(totals.sale.toFixed(2)),
        paid: Number(totals.paid.toFixed(2)),
        less: Number(totals.less.toFixed(2)),
      },
      rows,
    });
  } catch (error) {
    res.status(500).json({ message: apiErrorMessage(error) });
  }
});

/** Outstanding as of a date, optional schedule filter. */
router.get('/outstanding', async (req, res) => {
  try {
    const { date, scheduleId } = req.query;
    if (!date) {
      return res.status(400).json({ message: 'Select a date' });
    }

    const start = startOfDay(date);
    const end = endOfDay(date);

    const custFilter = {};
    if (scheduleId) custFilter.schedule = scheduleId;

    const customers = await Customer.find(custFilter).populate('schedule', 'name').sort({ name: 1 }).lean();
    const ids = customers.map((c) => c._id);

    const txs = await Transaction.find({
      customer: { $in: ids },
      type: { $in: ['customer_credit', 'customer_payment'] },
    }).lean();

    const byCustomer = new Map();
    for (const tx of txs) {
      const cid = tx.customer?.toString();
      if (!cid) continue;
      if (!byCustomer.has(cid)) byCustomer.set(cid, []);
      byCustomer.get(cid).push(tx);
    }

    const rows = [];
    let sumOpening = 0;
    let sumSales = 0;
    let sumPaid = 0;
    let sumLess = 0;
    let sumClosing = 0;

    for (const customer of customers) {
      const list = (byCustomer.get(customer._id.toString()) || []).sort(
        (a, b) => txWhen(a) - txWhen(b) || new Date(a.createdAt) - new Date(b.createdAt)
      );

      let opening = 0;
      let daySales = 0;
      let dayPaid = 0;
      let dayLess = 0;
      let closing = 0;

      for (const tx of list) {
        const when = txWhen(tx);
        if (when < start) {
          opening += balanceDelta(tx);
        } else if (when <= end) {
          daySales += creditAmount(tx);
          dayPaid += cashPaid(tx);
          dayLess += lessAmount(tx);
          closing += balanceDelta(tx);
        }
      }
      closing = opening + closing;

      if (opening === 0 && closing === 0 && daySales === 0 && dayPaid === 0 && dayLess === 0) {
        continue;
      }

      sumOpening += opening;
      sumSales += daySales;
      sumPaid += dayPaid;
      sumLess += dayLess;
      sumClosing += closing;

      rows.push({
        customerId: customer._id,
        name: customer.name,
        nameTelugu: customer.nameTelugu || '',
        schedule: customer.schedule?.name || '',
        scheduleId: customer.schedule?._id || customer.schedule || null,
        opening: Number(opening.toFixed(2)),
        sales: Number(daySales.toFixed(2)),
        paid: Number(dayPaid.toFixed(2)),
        less: Number(dayLess.toFixed(2)),
        closing: Number(closing.toFixed(2)),
      });
    }

    res.json({
      date: start,
      rows,
      totals: {
        opening: Number(sumOpening.toFixed(2)),
        sales: Number(sumSales.toFixed(2)),
        paid: Number(sumPaid.toFixed(2)),
        less: Number(sumLess.toFixed(2)),
        closing: Number(sumClosing.toFixed(2)),
      },
    });
  } catch (error) {
    res.status(500).json({ message: apiErrorMessage(error) });
  }
});

/** Date-range customer statements for Bill Print (all customers). */
/** Sales-only customer statements for Sales Entry print. */
router.get('/sales-bills', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Select a date range' });
    }

    const start = startOfDay(startDate);
    const end = endOfDay(endDate);
    if (start > end) {
      return res.status(400).json({ message: 'Start date must be before or equal to end date' });
    }

    const sales = await Sale.find({ createdAt: { $gte: start, $lte: end } })
      .populate('customer', 'name nameTelugu')
      .populate('vendor', 'name city mobile')
      .sort({ createdAt: 1 })
      .lean();

    const byCustomer = new Map();

    for (const sale of sales) {
      const cid = sale.customer?._id || sale.customer;
      if (!cid) continue;
      const key = String(cid);

      if (!byCustomer.has(key)) {
        byCustomer.set(key, {
          customerId: key,
          name: sale.customer?.name || '—',
          nameTelugu: sale.customer?.nameTelugu || '',
          sales: [],
        });
      }

      const bucket = byCustomer.get(key);
      const vId = sale.vendor?._id ? String(sale.vendor._id) : String(sale.vendor || '');
      const vName = sale.vendor?.name || '';
      const lines = sale.lines || [];

      if (lines.length) {
        const coolyTotal = Number(sale.handlingCharges) || 0;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const lineCooly = i === 0 ? coolyTotal : 0;
          bucket.sales.push({
            saleId: String(sale._id),
            lineId: String(line._id || ''),
            date: sale.createdAt,
            material: line.materialName || 'Item',
            materialId: line.material ? String(line.material) : '',
            vendorId: vId,
            vendorName: vName,
            bags: Number(line.bagCount) || (line.bags?.length) || 0,
            weight: Number(line.totalKg) || 0,
            ratePerKg: line.ratePerKg || 0,
            saleType: line.saleType || 'by_weight',
            amount: Number(line.totalAmount) || 0,
            cooly: lineCooly,
            handlingCharges: coolyTotal,
            coolyRate: sale.coolyRate || 0,
            coolyPerBag: sale.coolyPerBag || false,
          });
        }
      } else if (Number(sale.totalAmount) > 0 || Number(sale.handlingCharges) > 0) {
        const coolyTotal = Number(sale.handlingCharges) || 0;
        bucket.sales.push({
          saleId: String(sale._id),
          date: sale.createdAt,
          material: 'Sale',
          vendorId: vId,
          vendorName: vName,
          bags: Number(sale.totalBags) || 0,
          weight: Number(sale.totalWeight) || 0,
          amount: Number(sale.totalAmount) || 0,
          cooly: coolyTotal,
          handlingCharges: coolyTotal,
          coolyRate: sale.coolyRate || 0,
          coolyPerBag: sale.coolyPerBag || false,
        });
      }
    }

    const statements = [...byCustomer.values()]
      .map((b) => {
        const totalSale = b.sales.reduce((s, r) => s + r.amount + (r.cooly || 0), 0);
        return {
          customerId: b.customerId,
          name: b.name,
          nameTelugu: b.nameTelugu,
          opening: 0,
          sales: b.sales.map((r) => ({
            ...r,
            weight: Number(Number(r.weight).toFixed(1)),
            amount: Number(Number(r.amount).toFixed(2)),
          })),
          payments: [],
          totalSale: Number(totalSale.toFixed(2)),
          totalPaid: 0,
          closing: Number(totalSale.toFixed(2)),
        };
      })
      .filter((s) => s.sales.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));

    res.json({
      startDate: start,
      endDate: end,
      statements,
    });
  } catch (error) {
    res.status(500).json({ message: apiErrorMessage(error) });
  }
});

/** Date-range customer statements for Bill Print (all customers). */
router.get('/bills', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Select a date range' });
    }

    const start = startOfDay(startDate);
    const end = endOfDay(endDate);
    if (start > end) {
      return res.status(400).json({ message: 'Start date must be before or equal to end date' });
    }

    const [sales, txs] = await Promise.all([
      Sale.find({ createdAt: { $gte: start, $lte: end } })
        .populate('customer', 'name nameTelugu')
        .populate('vendor', 'name city mobile')
        .sort({ createdAt: 1 })
        .lean(),
      Transaction.find({
        customer: { $ne: null },
        type: { $in: ['customer_credit', 'customer_payment'] },
      })
        .populate('customer', 'name nameTelugu')
        .lean(),
    ]);

    const byCustomer = new Map();

    const ensure = (id, customer) => {
      const key = String(id);
      if (!byCustomer.has(key)) {
        byCustomer.set(key, {
          customerId: key,
          name: customer?.name || '—',
          nameTelugu: customer?.nameTelugu || '',
          opening: 0,
          sales: [],
          payments: [],
        });
      }
      return byCustomer.get(key);
    };

    for (const sale of sales) {
      const cid = sale.customer?._id || sale.customer;
      if (!cid) continue;
      const bucket = ensure(cid, sale.customer);
      const vId = sale.vendor?._id ? String(sale.vendor._id) : String(sale.vendor || '');
      const vName = sale.vendor?.name || '';
      const lines = sale.lines || [];
      if (lines.length) {
        for (const line of lines) {
          bucket.sales.push({
            date: sale.createdAt,
            material: line.materialName || 'Item',
            materialId: line.material ? String(line.material) : '',
            vendorId: vId,
            vendorName: vName,
            bags: Number(line.bagCount) || (line.bags?.length) || 0,
            weight: Number(line.totalKg) || 0,
            amount: Number(line.totalAmount) || 0,
          });
        }
      } else if (Number(sale.totalAmount) > 0) {
        bucket.sales.push({
          date: sale.createdAt,
          material: 'Sale',
          vendorId: vId,
          vendorName: vName,
          bags: Number(sale.totalBags) || 0,
          weight: Number(sale.totalWeight) || 0,
          amount: Number(sale.totalAmount) || 0,
        });
      }
      const cooly = Number(sale.handlingCharges) || 0;
      if (cooly > 0) {
        bucket.sales.push({
          date: sale.createdAt,
          material: 'Cooly',
          bags: 0,
          weight: 0,
          amount: cooly,
        });
      }
    }

    for (const tx of txs) {
      const cid = tx.customer?._id || tx.customer;
      if (!cid) continue;
      const when = txWhen(tx);
      const cust = tx.customer && typeof tx.customer === 'object' ? tx.customer : null;
      if (when < start) {
        const bucket = ensure(cid, cust);
        bucket.opening += balanceDelta(tx);
        continue;
      }
      if (when > end) continue;
      if (tx.type === 'customer_payment' && cashPaid(tx) > 0) {
        const bucket = ensure(cid, cust);
        bucket.payments.push({
          date: when,
          amount: cashPaid(tx),
        });
      } else if (tx.type === 'customer_credit' && !tx.sale && creditAmount(tx) > 0) {
        const bucket = ensure(cid, cust);
        bucket.sales.push({
          date: when,
          material: tx.description || 'Credit',
          bags: 0,
          weight: 0,
          amount: creditAmount(tx),
        });
      }
    }

    const statements = [...byCustomer.values()]
      .map((b) => {
        const totalSale = b.sales.reduce((s, r) => s + r.amount, 0);
        const totalPaid = b.payments.reduce((s, r) => s + r.amount, 0);
        const opening = Number(b.opening.toFixed(2));
        return {
          customerId: b.customerId,
          name: b.name,
          nameTelugu: b.nameTelugu,
          opening,
          sales: b.sales.map((r) => ({
            ...r,
            weight: Number(Number(r.weight).toFixed(1)),
            amount: Number(Number(r.amount).toFixed(2)),
          })),
          payments: b.payments.map((r) => ({
            ...r,
            amount: Number(Number(r.amount).toFixed(2)),
          })),
          totalSale: Number(totalSale.toFixed(2)),
          totalPaid: Number(totalPaid.toFixed(2)),
          closing: Number((opening + totalSale - totalPaid).toFixed(2)),
        };
      })
      .filter((s) => s.sales.length || s.payments.length)
      .sort((a, b) => a.name.localeCompare(b.name, 'en'));

    res.json({
      startDate: start,
      endDate: end,
      statements,
    });
  } catch (error) {
    res.status(500).json({ message: apiErrorMessage(error) });
  }
});

export default router;
