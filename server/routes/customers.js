import express from 'express';
import Customer from '../models/Customer.js';
import Sale from '../models/Sale.js';
import Transaction from '../models/Transaction.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();
router.use(auth);

router.get('/', async (req, res) => {
  try {
    const customers = await Customer.find().sort({ name: 1 });
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, mobile, state, city, address, handlingCharges } = req.body;
    if (!name || !state || !city) {
      return res.status(400).json({ message: 'Name, state, and city are required' });
    }
    const customer = await Customer.create({
      name,
      mobile: mobile || '',
      state,
      city,
      address: address || '',
      handlingCharges: !!handlingCharges,
    });
    res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const sales = await Sale.find({ customer: customer._id })
      .populate('vendor', 'name city')
      .sort({ createdAt: -1 });

    const transactions = await Transaction.find({ customer: customer._id }).sort({ createdAt: -1 });

    res.json({ customer, sales, transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, mobile, state, city, address, handlingCharges } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (mobile !== undefined) updates.mobile = mobile;
    if (state !== undefined) updates.state = state;
    if (city !== undefined) updates.city = city;
    if (address !== undefined) updates.address = address;
    if (handlingCharges !== undefined) updates.handlingCharges = !!handlingCharges;

    const customer = await Customer.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json(customer);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json({ message: 'Customer deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
