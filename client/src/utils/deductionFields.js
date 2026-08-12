/** రైతుపట్టి deduction fields — keep in sync with server/utils/deductionFields.js */
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

export function emptyRatesState(source = {}) {
  const state = {};
  for (const f of DEDUCTION_FIELDS) {
    const v = source[f.key];
    state[f.key] = v === undefined || v === null ? '' : String(v);
    state[`${f.key}PerBag`] =
      source[`${f.key}PerBag`] !== undefined ? !!source[`${f.key}PerBag`] : f.defaultPerBag;
  }
  return state;
}

export function ratesPayload(state) {
  const body = {};
  for (const f of DEDUCTION_FIELDS) {
    let val = Number(state[f.key]) || 0;
    const perBag = !!state[`${f.key}PerBag`];
    if (f.isCommission && !perBag) val = Math.min(100, val);
    body[f.key] = val;
    body[`${f.key}PerBag`] = perBag;
  }
  return body;
}
