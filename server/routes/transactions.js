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
    const { vendorId, customerId, type, limit } = req.query;
    const filter = {};
    if (vendorId) filter.vendor = vendorId;
    if (customerId) filter.customer = customerId;
    if (type) filter.type = type;

    const maxRecords = limit ? Math.min(Number(limit) || 100, 1000) : 200;

    const transactions = await Transaction.find(filter)
      .populate('vendor', 'name mobile city')
      .populate('customer', 'name city state')
      .populate('load', 'totalWeight handlingCharges')
      .populate('sale', 'totalAmount totalBags')
      .sort({ entryDate: 1, createdAt: 1 })
      .limit(maxRecords)
      .lean();
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

function cashHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function reverseCashBalance(tx) {
  const applied = Number(tx.amount) || 0;
  const custId = tx.customer?._id || tx.customer;
  const vendId = tx.vendor?._id || tx.vendor;

  if (custId) {
    const customer = await Customer.findById(custId);
    if (!customer) return null;
    if (tx.cashSide === 'credit' || tx.type === 'customer_payment') {
      customer.creditBalance += applied;
    } else {
      customer.creditBalance = Math.max(0, customer.creditBalance - applied);
    }
    customer.creditBalance = Number(customer.creditBalance.toFixed(2));
    await customer.save();
    return { partyType: 'customer', party: customer };
  }
  if (vendId) {
    const vendor = await Vendor.findById(vendId);
    if (!vendor) return null;
    if (tx.cashSide === 'debit' || tx.type === 'vendor_payment') {
      vendor.creditBalance += applied;
    } else {
      vendor.creditBalance = Math.max(0, vendor.creditBalance - applied);
    }
    vendor.creditBalance = Number(vendor.creditBalance.toFixed(2));
    await vendor.save();
    return { partyType: 'vendor', party: vendor };
  }
  return null;
}

/** Applies cash entry to party balance and returns fields to store on the transaction. */
async function applyCashEntry(body) {
  const { customerId, vendorId, partyType, amount, less, cashSide, paymentType, entryDate, description, reason } = body;
  const side = String(cashSide || 'credit').toLowerCase();
  const payType = paymentType || 'Cash';
  const cleanReason = reason != null ? String(reason).trim() : '';
  const kind =
    partyType === 'vendor'
      ? 'vendor'
      : partyType === 'customer'
        ? 'customer'
        : vendorId
          ? 'vendor'
          : customerId
            ? 'customer'
            : null;

  if (!kind) throw cashHttpError(400, 'Select a customer or vendor');
  if (side !== 'credit' && side !== 'debit') {
    throw cashHttpError(400, 'Type must be credit or debit');
  }

  const mainAmount = Math.max(0, Number(amount) || 0);
  const lessAmount = Math.max(0, Number(less) || 0);
  if (mainAmount <= 0 && lessAmount <= 0) {
    throw cashHttpError(400, 'Enter amount or less');
  }

  const when = entryDate ? new Date(entryDate) : new Date();
  if (Number.isNaN(when.getTime())) throw cashHttpError(400, 'Invalid date');

  if (kind === 'customer') {
    if (!customerId) throw cashHttpError(400, 'Select a customer');
    const customer = await Customer.findById(customerId);
    if (!customer) throw cashHttpError(404, 'Customer not found');

    let txType;
    let applied = 0;

    if (side === 'credit') {
      applied = mainAmount + lessAmount;
      txType = 'customer_payment';
      customer.creditBalance = Math.max(0, customer.creditBalance - applied);
    } else {
      applied = mainAmount;
      if (applied <= 0) throw cashHttpError(400, 'Enter a valid amount for debit');
      txType = 'customer_credit';
      customer.creditBalance += applied;
    }

    await customer.save();

    const parts = [
      side === 'credit' ? 'Cash receipt' : 'Cash debit',
      mainAmount > 0 ? `Amount ${mainAmount}` : null,
      side === 'credit' && lessAmount > 0 ? `Less ${lessAmount}` : null,
    ].filter(Boolean);

    return {
      partyType: 'customer',
      party: customer,
      fields: {
        customer: customerId,
        vendor: null,
        type: txType,
        amount: applied,
        lessAmount: side === 'credit' ? lessAmount : 0,
        cashSide: side,
        paymentType: payType,
        entryDate: when,
        source: 'cash_entry',
        description: description || `${parts.join(' · ')} — ${customer.name}`,
        reason: cleanReason,
        balanceAfter: customer.creditBalance,
      },
    };
  }

  if (!vendorId) throw cashHttpError(400, 'Select a vendor');
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) throw cashHttpError(404, 'Vendor not found');

  let txType;
  let applied = 0;

  if (side === 'debit') {
    applied = mainAmount + lessAmount;
    if (applied <= 0) throw cashHttpError(400, 'Enter amount or less');
    txType = 'vendor_payment';
    vendor.creditBalance = Math.max(0, vendor.creditBalance - applied);
  } else {
    applied = mainAmount;
    if (applied <= 0) throw cashHttpError(400, 'Enter a valid amount for credit');
    txType = 'vendor_credit';
    vendor.creditBalance += applied;
  }

  await vendor.save();

  const parts = [
    side === 'debit' ? 'Vendor payment' : 'Vendor credit',
    mainAmount > 0 ? `Amount ${mainAmount}` : null,
    side === 'debit' && lessAmount > 0 ? `Less ${lessAmount}` : null,
  ].filter(Boolean);

  return {
    partyType: 'vendor',
    party: vendor,
    fields: {
      vendor: vendorId,
      customer: null,
      type: txType,
      amount: applied,
      lessAmount: side === 'debit' ? lessAmount : 0,
      cashSide: side,
      paymentType: payType,
      entryDate: when,
      source: 'cash_entry',
      description: description || `${parts.join(' · ')} — ${vendor.name}`,
      reason: cleanReason,
      balanceAfter: vendor.creditBalance,
    },
  };
}

function cashEntrySnapshot(tx) {
  const lessAmount = Number(tx.lessAmount) || 0;
  const mainAmount = Math.max(0, (Number(tx.amount) || 0) - lessAmount);
  return {
    customerId: tx.customer?._id || tx.customer || undefined,
    vendorId: tx.vendor?._id || tx.vendor || undefined,
    partyType: tx.vendor ? 'vendor' : 'customer',
    amount: mainAmount,
    less: lessAmount,
    cashSide: tx.cashSide,
    paymentType: tx.paymentType || 'Cash',
    entryDate: tx.entryDate,
    description: tx.description,
    reason: tx.reason || '',
  };
}

/**
 * Cash Entry: customer or vendor typeahead with date, amount, credit/debit, less.
 * Customer + credit → payment received (reduces customer balance by amount + less)
 * Customer + debit  → customer owes more (increases balance by amount)
 * Vendor + debit    → payment to vendor (reduces vendor payable by amount + less)
 * Vendor + credit   → vendor owed more (increases payable by amount)
 */
router.post('/cash-entry', async (req, res) => {
  try {
    const result = await applyCashEntry(req.body);
    const transaction = await Transaction.create(result.fields);
    const populated = await Transaction.findById(transaction._id)
      .populate('customer', 'name nameTelugu creditBalance')
      .populate('vendor', 'name nameTelugu creditBalance');
    const payload = { transaction: populated, partyType: result.partyType };
    if (result.partyType === 'customer') payload.customer = result.party;
    else payload.vendor = result.party;
    res.status(201).json(payload);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

router.put('/cash-entry/:id', async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx || (tx.source && tx.source !== 'cash_entry' && tx.sale)) {
      return res.status(404).json({ message: 'Cash entry not found' });
    }

    const snapshot = cashEntrySnapshot(tx);
    await reverseCashBalance(tx);

    try {
      const merged = { ...snapshot, ...req.body };
      if (merged.partyType === 'customer') merged.vendorId = undefined;
      if (merged.partyType === 'vendor') merged.customerId = undefined;
      const result = await applyCashEntry(merged);
      tx.customer = result.partyType === 'customer' ? result.fields.customer : null;
      tx.vendor = result.partyType === 'vendor' ? result.fields.vendor : null;
      tx.type = result.fields.type;
      tx.amount = result.fields.amount;
      tx.lessAmount = result.fields.lessAmount;
      tx.cashSide = result.fields.cashSide;
      tx.paymentType = result.fields.paymentType;
      tx.entryDate = result.fields.entryDate;
      tx.source = 'cash_entry';
      tx.description = result.fields.description;
      tx.reason = result.fields.reason || '';
      tx.balanceAfter = result.fields.balanceAfter;
      await tx.save();

      const populated = await Transaction.findById(tx._id)
        .populate('customer', 'name nameTelugu creditBalance')
        .populate('vendor', 'name nameTelugu creditBalance');
      const payload = { transaction: populated, partyType: result.partyType };
      if (result.partyType === 'customer') payload.customer = result.party;
      else payload.vendor = result.party;
      return res.json(payload);
    } catch (applyErr) {
      try {
        await applyCashEntry(snapshot);
      } catch (_) {
        /* original could not be restored */
      }
      throw applyErr;
    }
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

router.get('/cash-entries', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    const filter = {
      $or: [
        { source: { $in: ['cash_entry', 'cash_sale', 'Direct Sale Payment'] } },
        { type: { $in: ['customer_payment', 'vendor_payment'] }, sale: null },
      ],
    };
    if (startDate && endDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.entryDate = { $gte: start, $lte: end };
    } else if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.entryDate = { $lte: end };
    } else if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      filter.entryDate = { $gte: start, $lte: end };
    }

    const transactions = await Transaction.find(filter)
      .populate('customer', 'name nameTelugu creditBalance')
      .populate('vendor', 'name nameTelugu creditBalance')
      .sort({ entryDate: 1, createdAt: 1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/cash-entry/:id', async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx || (tx.source && tx.source !== 'cash_entry' && tx.sale)) {
      return res.status(404).json({ message: 'Cash entry not found' });
    }

    const partyResult = await reverseCashBalance(tx);
    await Transaction.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Cash entry deleted successfully',
      deletedId: tx._id,
      partyType: partyResult?.partyType,
      party: partyResult?.party,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    if (tx.sale || tx.load) {
      return res.status(400).json({
        message: 'Cannot delete transaction linked directly to a sale or load. Please delete the sale or load instead.',
      });
    }

    const partyResult = await reverseCashBalance(tx);
    await Transaction.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Transaction deleted successfully',
      deletedId: tx._id,
      partyType: partyResult?.partyType,
      party: partyResult?.party,
    });
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
