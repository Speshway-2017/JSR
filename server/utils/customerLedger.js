/** When a customer transaction actually occurred (cash entries use entryDate). */
export function txWhen(tx) {
  const d = tx.entryDate || tx.createdAt;
  return d ? new Date(d) : new Date(0);
}

export function startOfDay(dateStr) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(dateStr) {
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Cash received (excludes less). Less is a write-off record only for "total paid".
 * Stored `amount` on customer_payment is cash + less (what hit the balance).
 */
export function cashPaid(tx) {
  if (tx.type !== 'customer_payment') return 0;
  const less = Number(tx.lessAmount) || 0;
  return Math.max(0, (Number(tx.amount) || 0) - less);
}

export function lessAmount(tx) {
  if (tx.type !== 'customer_payment') return 0;
  return Math.max(0, Number(tx.lessAmount) || 0);
}

/** Amount that increased customer credit (sales / cash debit). */
export function creditAmount(tx) {
  if (tx.type !== 'customer_credit') return 0;
  return Number(tx.amount) || 0;
}

/** Net effect on customer creditBalance. */
export function balanceDelta(tx) {
  if (tx.type === 'customer_credit') return Number(tx.amount) || 0;
  if (tx.type === 'customer_payment') return -(Number(tx.amount) || 0);
  return 0;
}

export function particulars(tx) {
  if (tx.sale) {
    const sale = typeof tx.sale === 'object' && tx.sale ? tx.sale : null;
    const lines = sale?.lines || [];
    if (lines.length) {
      const parts = lines.map((l) => {
        const bags = Number(l.bagCount) || (Array.isArray(l.bags) ? l.bags.length : 0) || 0;
        const weight = Number(l.totalKg) || (Array.isArray(l.bags) ? l.bags.reduce((s, b) => s + (Number(b?.kgs || b) || 0), 0) : 0) || 0;
        const rate = Number(l.ratePerKg != null ? l.ratePerKg : l.rate) || 0;
        const name = l.materialName || 'Item';
        if (!bags && !weight && !rate) return name;
        const details = [];
        if (bags) details.push(`${bags} ${bags === 1 ? 'bag' : 'bags'}`);
        if (weight) details.push(`${weight % 1 === 0 ? weight : Number(weight.toFixed(1))} kg`);
        if (rate) details.push(`@ ₹${rate % 1 === 0 ? rate : Number(rate.toFixed(2))}${l.saleType === 'by_bag' ? '/bag' : '/kg'}`);
        return `${name} (${details.join(', ')})`;
      });
      return `Sale - ${parts.join(' · ')}`;
    }
    const totalBags = Number(sale?.totalBags) || 0;
    const totalWeight = Number(sale?.totalWeight) || 0;
    if ((totalBags || totalWeight) && tx.description) {
      const details = [];
      if (totalBags) details.push(`${totalBags} ${totalBags === 1 ? 'bag' : 'bags'}`);
      if (totalWeight) details.push(`${totalWeight % 1 === 0 ? totalWeight : Number(totalWeight.toFixed(1))} kg`);
      return `${tx.description} (${details.join(', ')})`;
    }
    return tx.description || 'Sale';
  }
  if (tx.source === 'cash_entry') {
    const paid = cashPaid(tx);
    const less = lessAmount(tx);
    if (tx.type === 'customer_payment') {
      const bits = [];
      if (paid > 0) bits.push('Cash received');
      if (less > 0) bits.push('Less');
      return bits.join(' · ') || 'Cash entry';
    }
    return tx.description || 'Cash debit';
  }
  if (tx.type === 'customer_payment') return tx.description || 'Payment';
  return tx.description || 'Credit';
}
