import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Customer from '../models/Customer.js';
import Transaction from '../models/Transaction.js';

dotenv.config({ path: new URL('../.env', import.meta.url) });

async function backfill() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/agri-trades';
  console.log('Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('Connected.');

  const customers = await Customer.find();
  console.log(`Found ${customers.length} customers to check.`);

  for (const c of customers) {
    // 1. Find opening transaction if any
    const openTx = await Transaction.findOne({
      customer: c._id,
      description: /^Opening (debit|credit)/i,
    });

    let opDebit = 0;
    let opCredit = 0;

    if (openTx) {
      if (/Opening debit/i.test(openTx.description)) {
        opDebit = openTx.amount || 0;
      } else if (/Opening credit/i.test(openTx.description)) {
        opCredit = openTx.amount || 0;
      }
    }

    c.openingDebit = opDebit;
    c.openingCredit = opCredit;

    // 2. Recalculate true running creditBalance from transactions
    const allTxs = await Transaction.find({
      customer: c._id,
      type: { $in: ['customer_credit', 'customer_payment'] },
    });

    let running = 0;
    for (const t of allTxs) {
      if (t.type === 'customer_credit') {
        running += Number(t.amount) || 0;
      } else if (t.type === 'customer_payment') {
        running -= Number(t.amount) || 0;
      }
    }

    c.creditBalance = Number(running.toFixed(2));
    await c.save();

    console.log(`Customer "${c.name}": Opening Dr = ${c.openingDebit}, Opening Cr = ${c.openingCredit}, Closing Balance = ${c.creditBalance}`);
  }

  console.log('Backfill completed successfully.');
  await mongoose.disconnect();
}

backfill().catch((err) => {
  console.error('Backfill error:', err);
  process.exit(1);
});
