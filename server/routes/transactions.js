import express from 'express';
import Transaction from '../models/Transaction.js';
import Vendor from '../models/Vendor.js';
import Customer from '../models/Customer.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(auth);
router.use(requireRole('admin'));

router.get('/', async (req, res) => {
  try {
    const { vendorId, customerId, type } = req.query;
    const filter = {};
    if (vendorId) filter.vendor = vendorId;
    if (customerId) filter.customer = customerId;
    if (type) filter.type = type;

    const transactions = await Transaction.find(filter)
      .populate('vendor', 'name mobile city')
      .populate('customer', 'name city state')
      .populate('load', 'totalWeight handlingCharges')
      .populate('sale', 'totalAmount totalBags')
      .sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/vendor-payment', async (req, res) => {
  try {
    const { vendorId, amount, description } = req.body;
    if (!vendorId || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid vendor and amount are required' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    vendor.creditBalance = Math.max(0, vendor.creditBalance - amount);
    await vendor.save();

    const transaction = await Transaction.create({
      vendor: vendorId,
      type: 'vendor_payment',
      amount,
      description: description || `Payment to ${vendor.name}`,
      balanceAfter: vendor.creditBalance,
    });

    const populated = await Transaction.findById(transaction._id).populate('vendor', 'name mobile city');
    res.status(201).json({ transaction: populated, vendor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/customer-payment', async (req, res) => {
  try {
    const { customerId, amount, description } = req.body;
    if (!customerId || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid customer and amount are required' });
    }

    const customer = await Customer.findById(customerId);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    customer.creditBalance = Math.max(0, customer.creditBalance - amount);
    await customer.save();

    const transaction = await Transaction.create({
      customer: customerId,
      type: 'customer_payment',
      amount,
      description: description || `Payment from ${customer.name}`,
      balanceAfter: customer.creditBalance,
    });

    const populated = await Transaction.findById(transaction._id).populate(
      'customer',
      'name city state'
    );
    res.status(201).json({ transaction: populated, customer });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * Cash Entry: customer or vendor typeahead with date, amount, credit/debit, less.
 * Customer + credit → payment received (reduces customer balance by amount + less)
 * Customer + debit  → customer owes more (increases balance by amount)
 * Vendor + debit    → payment to vendor (reduces vendor payable by amount + less)
 * Vendor + credit   → vendor owed more (increases payable by amount)
 */
router.post('/cash-entry', async (req, res) => {
  try {
    const { customerId, vendorId, partyType, amount, less, cashSide, entryDate, description } =
      req.body;
    const side = String(cashSide || 'credit').toLowerCase();
    const kind =
      partyType === 'vendor' || vendorId
        ? 'vendor'
        : partyType === 'customer' || customerId
          ? 'customer'
          : null;

    if (!kind) {
      return res.status(400).json({ message: 'Select a customer or vendor' });
    }
    if (side !== 'credit' && side !== 'debit') {
      return res.status(400).json({ message: 'Type must be credit or debit' });
    }

    const mainAmount = Math.max(0, Number(amount) || 0);
    const lessAmount = Math.max(0, Number(less) || 0);
    if (mainAmount <= 0 && lessAmount <= 0) {
      return res.status(400).json({ message: 'Enter amount or less' });
    }

    const when = entryDate ? new Date(entryDate) : new Date();
    if (Number.isNaN(when.getTime())) {
      return res.status(400).json({ message: 'Invalid date' });
    }

    if (kind === 'customer') {
      if (!customerId) {
        return res.status(400).json({ message: 'Select a customer' });
      }
      const customer = await Customer.findById(customerId);
      if (!customer) return res.status(404).json({ message: 'Customer not found' });

      let txType;
      let applied = 0;

      if (side === 'credit') {
        applied = mainAmount + lessAmount;
        txType = 'customer_payment';
        customer.creditBalance = Math.max(0, customer.creditBalance - applied);
      } else {
        applied = mainAmount;
        if (applied <= 0) {
          return res.status(400).json({ message: 'Enter a valid amount for debit' });
        }
        txType = 'customer_credit';
        customer.creditBalance += applied;
      }

      await customer.save();

      const parts = [
        side === 'credit' ? 'Cash receipt' : 'Cash debit',
        mainAmount > 0 ? `Amount ${mainAmount}` : null,
        side === 'credit' && lessAmount > 0 ? `Less ${lessAmount}` : null,
      ].filter(Boolean);

      const transaction = await Transaction.create({
        customer: customerId,
        type: txType,
        amount: applied,
        lessAmount: side === 'credit' ? lessAmount : 0,
        cashSide: side,
        entryDate: when,
        source: 'cash_entry',
        description: description || `${parts.join(' · ')} — ${customer.name}`,
        balanceAfter: customer.creditBalance,
      });

      const populated = await Transaction.findById(transaction._id)
        .populate('customer', 'name nameTelugu creditBalance')
        .populate('vendor', 'name nameTelugu creditBalance');
      return res.status(201).json({ transaction: populated, customer, partyType: 'customer' });
    }

    // Vendor
    if (!vendorId) {
      return res.status(400).json({ message: 'Select a vendor' });
    }
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    let txType;
    let applied = 0;

    if (side === 'debit') {
      // Payment to vendor (+ optional less written off)
      applied = mainAmount + lessAmount;
      if (applied <= 0) {
        return res.status(400).json({ message: 'Enter amount or less' });
      }
      txType = 'vendor_payment';
      vendor.creditBalance = Math.max(0, vendor.creditBalance - applied);
    } else {
      // Credit: vendor is owed more
      applied = mainAmount;
      if (applied <= 0) {
        return res.status(400).json({ message: 'Enter a valid amount for credit' });
      }
      txType = 'vendor_credit';
      vendor.creditBalance += applied;
    }

    await vendor.save();

    const parts = [
      side === 'debit' ? 'Vendor payment' : 'Vendor credit',
      mainAmount > 0 ? `Amount ${mainAmount}` : null,
      side === 'debit' && lessAmount > 0 ? `Less ${lessAmount}` : null,
    ].filter(Boolean);

    const transaction = await Transaction.create({
      vendor: vendorId,
      type: txType,
      amount: applied,
      lessAmount: side === 'debit' ? lessAmount : 0,
      cashSide: side,
      entryDate: when,
      source: 'cash_entry',
      description: description || `${parts.join(' · ')} — ${vendor.name}`,
      balanceAfter: vendor.creditBalance,
    });

    const populated = await Transaction.findById(transaction._id)
      .populate('customer', 'name nameTelugu creditBalance')
      .populate('vendor', 'name nameTelugu creditBalance');
    res.status(201).json({ transaction: populated, vendor, partyType: 'vendor' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/cash-entries', async (req, res) => {
  try {
    const { date } = req.query;
    const filter = { source: 'cash_entry' };
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.entryDate = { $gte: start, $lte: end };
    }

    const transactions = await Transaction.find(filter)
      .populate('customer', 'name nameTelugu creditBalance')
      .populate('vendor', 'name nameTelugu creditBalance')
      .sort({ entryDate: -1, createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/** Legacy alias → vendor payment */
router.post('/payment', async (req, res) => {
  try {
    const { vendorId, amount, description } = req.body;
    if (!vendorId || !amount || amount <= 0) {
      return res.status(400).json({ message: 'Valid vendor and amount are required' });
    }

    const vendor = await Vendor.findById(vendorId);
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    vendor.creditBalance = Math.max(0, vendor.creditBalance - amount);
    await vendor.save();

    const transaction = await Transaction.create({
      vendor: vendorId,
      type: 'vendor_payment',
      amount,
      description: description || `Payment to ${vendor.name}`,
      balanceAfter: vendor.creditBalance,
    });

    const populated = await Transaction.findById(transaction._id).populate('vendor', 'name mobile city');
    res.status(201).json({ transaction: populated, vendor });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
