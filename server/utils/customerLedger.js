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
        const name = l.materialName || 'Item';
        if (!bags) return name;
        return `${name} (${bags} ${bags === 1 ? 'bag' : 'bags'})`;
      });
      return `Sale - ${parts.join(' · ')}`;
    }
    const totalBags = Number(sale?.totalBags) || 0;
    if (totalBags && tx.description) {
      return `${tx.description} (${totalBags} ${totalBags === 1 ? 'bag' : 'bags'})`;
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
