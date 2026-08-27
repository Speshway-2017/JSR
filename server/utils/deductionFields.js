/** Shared deduction field definitions for రైతుపట్టి */
export const DEDUCTION_FIELDS = [
  { key: 'kirayi', label: 'Kirayi', telugu: 'కిరాయి', defaultPerBag: true },
  { key: 'riksha', label: 'Rickshaw', telugu: 'రిక్షా', defaultPerBag: true },
  { key: 'cooly', label: 'Cooly', telugu: 'కూలీ', defaultPerBag: true },
  { key: 'aaseelu', label: 'Aaseelu', telugu: 'ఆశీలు', defaultPerBag: true },
  { key: 'commission', label: 'Commission', telugu: 'కమీషన్', defaultPerBag: false, isCommission: true },
  { key: 'vadakam', label: 'Vadakam', telugu: 'వడకం', defaultPerBag: true },
  { key: 'rusumu', label: 'Rusumu', telugu: 'రుసుము', defaultPerBag: true },
  { key: 'union', label: 'Union', telugu: 'యూనియన్', defaultPerBag: true },
];

export function emptyRatesFromSettings(settings = {}) {
  const rates = {};
  for (const f of DEDUCTION_FIELDS) {
    rates[f.key] = Number(settings[f.key]) || 0;
    rates[`${f.key}PerBag`] =
      settings[`${f.key}PerBag`] !== undefined
        ? !!settings[`${f.key}PerBag`]
        : f.defaultPerBag;
  }
  rates.bagLessUnder50 =
    settings.bagLessUnder50 !== undefined && settings.bagLessUnder50 !== null
      ? Number(settings.bagLessUnder50)
      : 1;
  rates.bagLessOver50 =
    settings.bagLessOver50 !== undefined && settings.bagLessOver50 !== null
      ? Number(settings.bagLessOver50)
      : 2;
  return rates;
}

/** Migrate legacy labour/bill/unionCharges/commissionPercent into new keys */
export function migrateLegacySettings(doc) {
  if (!doc) return doc;
  const o = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };

  if (!(Number(o.cooly) > 0) && Number(o.labour) > 0) {
    o.cooly = o.labour;
  }
  if (!(Number(o.rusumu) > 0) && Number(o.bill) > 0) {
    o.rusumu = o.bill;
  }
  if (!(Number(o.union) > 0) && Number(o.unionCharges) > 0) {
    o.union = o.unionCharges;
  }
  if (!(Number(o.commission) > 0) && Number(o.commissionPercent) > 0) {
    o.commission = o.commissionPercent;
    o.commissionPerBag = false;
  }

  for (const f of DEDUCTION_FIELDS) {
    if (o[`${f.key}PerBag`] === undefined) o[`${f.key}PerBag`] = f.defaultPerBag;
    if (o[f.key] === undefined) o[f.key] = 0;
  }
  if (o.bagLessUnder50 === undefined) o.bagLessUnder50 = 1;
  if (o.bagLessOver50 === undefined) o.bagLessOver50 = 2;
  return o;
}

export function computeFieldAmount(field, rates, { totalBags, grossTotal }) {
  const value = Math.max(0, Number(rates[field.key]) || 0);
  const perBag = rates[`${field.key}PerBag`] !== undefined
    ? !!rates[`${field.key}PerBag`]
    : field.defaultPerBag;

  if (field.isCommission && !perBag) {
    const pct = Math.min(100, value);
    return Number(((grossTotal * pct) / 100).toFixed(2));
  }
  if (perBag) {
    return Number((value * Math.max(0, totalBags || 0)).toFixed(2));
  }
  return Number(value.toFixed(2));
}

export function buildDeductionsFromRates({ grossTotal, totalBags, rates }) {
  const amounts = {};
  let total = 0;
  const perBagFlags = {};
  const inputRates = {};

  for (const field of DEDUCTION_FIELDS) {
    const amount = computeFieldAmount(field, rates || {}, { totalBags, grossTotal });
    amounts[field.key] = amount;
    total += amount;
    perBagFlags[`${field.key}PerBag`] =
      rates?.[`${field.key}PerBag`] !== undefined
        ? !!rates[`${field.key}PerBag`]
        : field.defaultPerBag;
    inputRates[field.key] = Math.max(0, Number(rates?.[field.key]) || 0);
  }

  return {
    ...amounts,
    ...perBagFlags,
    // legacy aliases used by older PDF / UI
    labour: amounts.cooly,
    handlingCharges: 0,
    bill: amounts.rusumu,
    unionCharges: amounts.union,
    commissionPercent:
      rates?.commissionPerBag === true ? 0 : Math.min(100, Number(rates?.commission) || 0),
    commission: amounts.commission,
    perBagRates: inputRates,
    totalBags: totalBags || 0,
    total: Number(total.toFixed(2)),
  };
}
