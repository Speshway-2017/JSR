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
    const { name, nameTelugu, mobile, schedule, address, handlingCharges, credit, debit } = req.body;
    if (!name?.trim() || !schedule) {
      return res.status(400).json({ message: 'Name and schedule are required' });
    }

    const debitVal = Math.max(0, Number(debit) || 0);
    const creditVal = Math.max(0, Number(credit) || 0);
    const startingBalance = debitVal > 0 ? debitVal : (creditVal > 0 ? -creditVal : 0);

    const customer = await Customer.create({
      name: name.trim(),
      nameTelugu: String(nameTelugu || '').trim(),
      mobile: mobile || '',
      schedule,
      address: address || '',
      handlingCharges: !!handlingCharges,
      openingDebit: debitVal,
      openingCredit: creditVal,
      creditBalance: startingBalance,
    });

    if (debitVal > 0 || creditVal > 0) {
      await Transaction.create({
        customer: customer._id,
        type: debitVal > 0 ? 'customer_credit' : 'customer_payment',
        amount: debitVal > 0 ? debitVal : creditVal,
        description: debitVal > 0 ? `Opening debit — ${customer.name}` : `Opening credit — ${customer.name}`,
        balanceAfter: startingBalance,
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
      .sort({ createdAt: 1 });

    const transactions = await Transaction.find({ customer: customer._id }).sort({ createdAt: 1 });

    res.json({ customer, sales, transactions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { name, nameTelugu, mobile, schedule, address, handlingCharges, credit, debit } = req.body;
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    if (name !== undefined) customer.name = name.trim();
    if (nameTelugu !== undefined) customer.nameTelugu = String(nameTelugu || '').trim();
    if (mobile !== undefined) customer.mobile = mobile || '';
    if (schedule !== undefined) customer.schedule = schedule;
    if (address !== undefined) customer.address = address || '';
    if (handlingCharges !== undefined) customer.handlingCharges = !!handlingCharges;

    if (debit !== undefined || credit !== undefined) {
      const newDebit = debit !== undefined && debit !== '' ? Math.max(0, Number(debit) || 0) : (customer.openingDebit || 0);
      const newCredit = credit !== undefined && credit !== '' ? Math.max(0, Number(credit) || 0) : (customer.openingCredit || 0);

      const oldNet = (customer.openingDebit || 0) - (customer.openingCredit || 0);
      const newNet = newDebit - newCredit;
      const diff = newNet - oldNet;

      customer.openingDebit = newDebit;
      customer.openingCredit = newCredit;
      customer.creditBalance = Number(((customer.creditBalance || 0) + diff).toFixed(2));

      let openTx = await Transaction.findOne({
        customer: customer._id,
        description: /^Opening (debit|credit)/i,
      });

      const newAmount = newDebit > 0 ? newDebit : newCredit;
      if (newAmount > 0) {
        const newType = newDebit > 0 ? 'customer_credit' : 'customer_payment';
        const newDesc = newDebit > 0 ? `Opening debit — ${customer.name}` : `Opening credit — ${customer.name}`;
        if (openTx) {
          openTx.amount = newAmount;
          openTx.type = newType;
          openTx.description = newDesc;
          await openTx.save();
        } else {
          await Transaction.create({
            customer: customer._id,
            type: newType,
            amount: newAmount,
            description: newDesc,
            balanceAfter: customer.creditBalance,
          });
        }
      } else if (openTx) {
        await Transaction.findByIdAndDelete(openTx._id);
      }
    } else if (name !== undefined) {
      await Transaction.updateMany(
        { customer: customer._id, description: /^Opening (debit|credit)/i },
        { description: (customer.openingDebit || 0) > 0 ? `Opening debit — ${customer.name}` : `Opening credit — ${customer.name}` }
      );
    }

    await customer.save();
    await customer.populate('schedule', 'name');
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
