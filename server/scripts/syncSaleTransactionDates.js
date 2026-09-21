import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import Transaction from '../models/Transaction.js';
import Sale from '../models/Sale.js';

async function sync() {
  await mongoose.connect(process.env.MONGODB_URI);
  const txs = await Transaction.find({ sale: { $ne: null } }).populate('sale', 'createdAt');
  let updated = 0;
  for (const tx of txs) {
    if (tx.sale && tx.sale.createdAt) {
      const saleDate = new Date(tx.sale.createdAt);
      const txEntryDate = tx.entryDate ? new Date(tx.entryDate) : null;
      if (!txEntryDate || txEntryDate.getTime() !== saleDate.getTime()) {
        tx.entryDate = saleDate;
        await tx.save();
        updated++;
      }
    }
  }
  console.log(`Synced ${updated} transactions to match their sale.createdAt date.`);
  await mongoose.disconnect();
}

sync().catch(console.error);
