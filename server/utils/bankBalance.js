import Transaction from '../models/Transaction.js';
import CompanySettings from '../models/CompanySettings.js';
import { txWhen } from './customerLedger.js';

export async function getOrCreateCompany() {
  let doc = await CompanySettings.findOne();
  if (!doc) doc = await CompanySettings.create({});
  return doc;
}

/** Cash that actually moved (excludes less write-off). Credit = in, debit = out. */
export function bankDelta(tx) {
  if (tx.source !== 'cash_entry') return 0;
  const less = Number(tx.lessAmount) || 0;
  const cash = Math.max(0, (Number(tx.amount) || 0) - less);
  if (tx.cashSide === 'credit') return cash;
  if (tx.cashSide === 'debit') return -cash;
  return 0;
}

export async function bankWindow(start, end) {
  const company = await getOrCreateCompany();
  const base = company.openingSet ? Number(company.openingBalance) || 0 : 0;
  const txs = await Transaction.find({ source: 'cash_entry' }).lean();
  const ordered = txs.sort(
    (a, b) => txWhen(a) - txWhen(b) || new Date(a.createdAt) - new Date(b.createdAt)
  );

  let opening = base;
  let closing = base;
  for (const tx of ordered) {
    const when = txWhen(tx);
    const delta = bankDelta(tx);
    if (when < start) opening += delta;
    if (when <= end) closing += delta;
  }

  return {
    openingSet: !!company.openingSet,
    openingBalance: Number(company.openingBalance || 0),
    openingDate: company.openingDate,
    bankOpening: Number(opening.toFixed(2)),
    bankClosing: Number(closing.toFixed(2)),
  };
}
