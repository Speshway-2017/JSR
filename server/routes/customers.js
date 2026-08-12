import express from 'express';
import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import Transaction from '../models/Transaction.js';
import { auth, requireRole } from '../middleware/auth.js';

const router = express.Router();
router.use(auth);
router.use(requireRole('admin'));

router.get('/', async (req, res) => {
  try {
    const customers = await Customer.find().populate('schedule', 'name').sort({ name: 1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, nameTelugu, mobile, schedule, address, handlingCharges, credit, creditBalance } = req.body;
    if (!name?.trim() || !schedule) {
      return res.status(400).json({ message: 'Name and schedule are required' });
    }

    const openingCredit = Math.max(
      0,
      Number(credit !== undefined ? credit : creditBalance) || 0
    );

    const customer = await Customer.create({
      name: name.trim(),
      nameTelugu: String(nameTelugu || '').trim(),
      mobile: mobile || '',
      schedule,
      address: address || '',
      handlingCharges: !!handlingCharges,
      creditBalance: openingCredit,
    });

    if (openingCredit > 0) {
      await Transaction.create({
        customer: customer._id,
        type: 'customer_credit',
        amount: openingCredit,
        description: `Opening credit — ${customer.name}`,
        balanceAfter: openingCredit,
      });
    }

    await customer.populate('schedule', 'name');
    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id).populate('schedule', 'name');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const sales = await Sale.find({ customer: customer._id })
      .populate('vendor', 'name nameTelugu city')
      .sort({ createdAt: -1 });

    const transactions = await Transaction.find({ customer: customer._id }).sort({ createdAt: -1 });

    res.json({ customer, sales, transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, nameTelugu, mobile, schedule, address, handlingCharges } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (nameTelugu !== undefined) updates.nameTelugu = String(nameTelugu || '').trim();
    if (mobile !== undefined) updates.mobile = mobile;
    if (schedule !== undefined) updates.schedule = schedule;
    if (address !== undefined) updates.address = address;
    if (handlingCharges !== undefined) updates.handlingCharges = !!handlingCharges;

    const customer = await Customer.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    }).populate('schedule', 'name');
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const saleExists = await Sale.exists({ customer: req.params.id });
    if (saleExists) {
      return res.status(400).json({ message: 'Customer has sales and cannot be deleted' });
    }

    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json({ message: 'Customer deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
