import express from 'express';
import Transaction from '../models/Transaction.js';
import Vendor from '../models/Vendor.js';
import Customer from '../models/Customer.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

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
