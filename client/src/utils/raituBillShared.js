import api from '../api';
import { RAMABHADRA, ramabhadraFontFaceCss } from './pdfFont';

export const TE = {
  om: '\u0c13\u0c02 \u0c36\u0c4d\u0c30\u0c40 \u0c38\u0c4d\u0c35\u0c3e\u0c2e\u0c3f\u0c2f\u0c47 \u0c36\u0c30\u0c23\u0c02 \u0c05\u0c2f\u0c4d\u0c2f\u0c2a\u0c4d\u0c2a',
  prop: '\u0c2a\u0c4d\u0c30\u0c4a\u0c2a\u0c4d\u0c30\u0c48\u0c1f\u0c30\u0c4d : J.S.R.',
  cell: '\u0c38\u0c46\u0c32\u0c4d : 9441017340',
  biz: '\u0c36\u0c4d\u0c30\u0c40 \u0c2e\u0c41\u0c24\u0c4d\u0c2f\u0c3e\u0c32\u0c2e\u0c4d\u0c2e\u0c24\u0c32\u0c4d\u0c32\u0c3f \u0c15\u0c42\u0c30\u0c17\u0c3e\u0c2f\u0c32 \u0c35\u0c4d\u0c2f\u0c3e\u0c2a\u0c3e\u0c30\u0c02',
  addr: '\u0c39\u0c4b\u0c32\u0c4d \u0c38\u0c47\u0c32\u0c4d \u0c2e\u0c3e\u0c30\u0c4d\u0c15\u0c46\u0c1f\u0c4d, \u0c36\u0c4d\u0c30\u0c40\u0c15\u0c3e\u0c15\u0c41\u0c33\u0c02',
  tedi: '\u0c24\u0c47\u0c26\u0c40',
  sri: '\u0c36\u0c4d\u0c30\u0c40',
  garu: '\u0c17\u0c3e\u0c30\u0c41',
  cooly: '\u0c15\u0c42\u0c32\u0c40',
  chellinchavali: '\u0c1a\u0c46\u0c32\u0c4d\u0c32\u0c3f\u0c02\u0c1a\u0c35\u0c32\u0c38\u0c3f\u0c28 \u0c2e\u0c4a\u0c24\u0c4d\u0c24\u0c02',
  mottham: '\u0c2e\u0c4a\u0c24\u0c4d\u0c24\u0c02',
  itemCol: '\u0c35\u0c38\u0c4d\u0c24\u0c41\u0c35\u0c41',
  weightCol: '\u0c2e\u0c4a\u0c24\u0c4d\u0c24\u0c02 \u0c2c\u0c30\u0c41\u0c35\u0c41',
  priceCol: '\u0c27\u0c30',
  amountCol: '\u0c2e\u0c4a\u0c24\u0c4d\u0c24\u0c02 \u0c35\u0c3f\u0c32\u0c41\u0c35',
  bag: '\u0c2c\u0c4d\u0c2f\u0c3e\u0c17\u0c4d',
  deductionsHeading: '\u0c24\u0c17\u0c4d\u0c17\u0c3f\u0c02\u0c2a\u0c41\u0c32\u0c41',
};

export const STAFF = [
  { name: 'J. Uma', phone: '91005 11400' },
  { name: 'J.K.R.', phone: '94408 87660' },
  { name: 'Nagu', phone: '94419 13802' },
  { name: 'UKR', phone: '63025 76234' },
  { name: 'Appa Rao', phone: '96181 99697' },
];

export const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const fmtNum = (n) => {
  const v = Number(n) || 0;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1).replace(/\.0$/, '');
};

export const fmtMoney = (n) => Math.round(Number(n) || 0).toLocaleString('en-IN');

export const fmtDateShort = (date) => {
  if (!date) return '';
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
};

export async function materialTeluguMap() {
  try {
    const res = await api.get('/materials');
    const map = new Map();
    for (const m of res.data || []) {
      const en = String(m.name || '').trim().toLowerCase();
      const te = String(m.nameTelugu || '').trim();
      if (en && te) map.set(en, te);
    }
    return map;
  } catch {
    return new Map();
  }
}

export function displayMaterialName(name, teluguMap) {
  const te = teluguMap.get(String(name || '').trim().toLowerCase());
  return te || name || '';
}

/** Borderless items table for bill lines. */
export function itemsTableHtml(lines, teluguMap) {
  const rows = (lines || [])
    .map((line) => {
      const name = displayMaterialName(line.materialName, teluguMap) || '—';
      return `<tr>
        <td class="col-item">${esc(name)}</td>
        <td class="col-num">${esc(fmtNum(line.totalKg))}</td>
        <td class="col-num">${esc(fmtNum(line.ratePerKg))}</td>
        <td class="col-num col-amt">${esc(fmtMoney(line.totalAmount))}</td>
      </tr>`;
    })
    .join('');

  return `<table class="items-table">
    <thead>
      <tr>
        <th class="col-item">${esc(TE.itemCol)}</th>
        <th class="col-num">${esc(TE.weightCol)}</th>
        <th class="col-num">${esc(TE.priceCol)}</th>
        <th class="col-num col-amt">${esc(TE.amountCol)}</th>
      </tr>
    </thead>
    <tbody>
      ${rows || `<tr><td colspan="4" class="muted">—</td></tr>`}
    </tbody>
  </table>`;
}

/**
 * Vendor bill materials column: bags (billed kg after tare) + summary table.
 * Tare: ≤50 → −1kg, >50 → −2kg (billKg already applied server-side).
 */
export function vendorMaterialsHtml(lines, teluguMap) {
  const blocks = (lines || [])
    .map((line) => {
      const name = displayMaterialName(line.materialName, teluguMap) || '—';
      const bags = line.bags || [];
      const count = bags.length || Number(line.bagCount) || 0;
      const weights = bags.map((b) => fmtNum(b.billKg));
      const title = bags
        .map((b, i) => `${TE.bag} ${b.bagNo || i + 1}: ${fmtNum(b.billKg)}`)
        .join(', ');
      const rate = line.ratePerKg != null && line.ratePerKg !== '' ? fmtNum(line.ratePerKg) : '';
      const bagLabel = count
        ? rate
          ? `${count} * ${rate}`
          : `${count}`
        : '';

      return `<div class="mat-row">
        <span class="mat-name">${esc(name)}${
          bagLabel ? `<span class="bag-n">${esc(bagLabel)}</span>` : ''
        }</span>${
          weights.length
            ? `<span class="bag-list" title="${esc(title)}">${esc(weights.join(', '))}</span>`
            : ''
        }</div>`;
    })
    .join('');

  const tableHtml = itemsTableHtml(lines, teluguMap);

  return `${blocks}<div class="mat-table-wrap">${tableHtml}</div>`;
}

const TELUGU_RE = /[\u0C00-\u0C7F]/
const partyTeluguCache = new Map();

/** Prefer stored Telugu name; otherwise transliterate English/phonetic for the bill. */
export async function resolvePartyTeluguName(party) {
  const stored = String(party?.nameTelugu || '').trim();
  if (stored) return stored;
  const name = String(party?.name || '').trim();
  if (!name) return '';
  if (TELUGU_RE.test(name)) return name;
  const cacheKey = name.toLowerCase();
  if (partyTeluguCache.has(cacheKey)) return partyTeluguCache.get(cacheKey);
  try {
    const res = await api.get('/transliterate/telugu', {
      params: { text: name },
      timeout: 2000,
    });
    const te = String(res.data?.telugu || '').trim() || name;
    partyTeluguCache.set(cacheKey, te);
    return te;
  } catch {
    return name;
  }
}

/** Open a tab with a loading state so users don’t see a blank white page while the PDF builds. */
export function openBillPreviewTab() {
  const tab = window.open('about:blank', '_blank');
  if (!tab) return null;
  try {
    tab.document.open();
    tab.document.write(`<!DOCTYPE html>
<html lang="te">
<head>
  <meta charset="utf-8" />
  <title>Bill</title>
  <style>
    html, body { height: 100%; margin: 0; background: #e7f3e6; }
    .wrap {
      min-height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      color: #166534;
      font-family: system-ui, -apple-system, sans-serif;
    }
    .spin {
      width: 40px;
      height: 40px;
      border: 3px solid #bbf7d0;
      border-top-color: #166534;
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .sub { opacity: 0.75; font-size: 14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="spin" aria-hidden="true"></div>
    <div>Preparing bill…</div>
    <div class="sub">బిల్లు తయారవుతోంది…</div>
  </div>
</body>
</html>`);
    tab.document.close();
  } catch {
    /* ignore write failures */
  }
  return tab;
}

export const BILL_CSS = `
* { box-sizing: border-box; }
.sheet {
  width: 794px;
  min-height: 0;
  padding: 8px 24px 20px;
  background: #e7f3e6;
  color: #14532d;
  position: relative;
  overflow: hidden;
}
.watermark-wrap {
  position: absolute;
  left: 50%;
  top: 58%;
  transform: translate(-50%, -50%);
  width: 420px;
  height: 420px;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.watermark {
  width: 420px;
  height: auto;
  display: block;
  opacity: 0.08;
  filter: contrast(1.15) brightness(0.55);
  user-select: none;
}
.sheet > *:not(.watermark-wrap) { position: relative; z-index: 1; }
.sheet-header {
  position: relative;
  padding-right: 128px;
  margin-bottom: 2px;
}
.sheet-header .staff {
  position: absolute;
  top: 0;
  right: 0;
  text-align: right;
  font-size: 11px;
  line-height: 1.28;
  color: #14532d;
}
.top-center { text-align: center; margin-bottom: 0; }
.invocation {
  font-size: 13px;
  letter-spacing: 0.2px;
  margin: 0;
  color: #166534;
}
.prop-line { font-size: 11px; margin: 0; color: #14532d; }
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-top: 0;
}
.date-line { font-size: 13px; white-space: nowrap; text-align: right; margin-top: 2px; }
.staff-name { display: inline-block; min-width: 68px; text-align: left; }
.biz-block { text-align: center; margin: 1px 0 0; }
.biz-name {
  margin: 0;
  font-size: 21px;
  line-height: 1.15;
  color: #166534;
  font-weight: 400;
}
.biz-addr { margin: 0; font-size: 12px; color: #15803d; }
.party-line {
  display: flex;
  align-items: baseline;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  width: fit-content;
  max-width: 100%;
  margin: 4px auto 6px;
  padding: 0 4px 4px;
  font-family: '${RAMABHADRA}', 'Noto Sans Telugu', sans-serif;
  font-size: 17px;
  font-weight: 400;
  border-bottom: 1px solid #86efac;
}
.party-name {
  flex: 0 1 auto;
  text-align: left;
  font-family: inherit;
  font-size: 18px;
  font-weight: 400;
  color: #14532d;
  letter-spacing: 0.3px;
}
.body {
  display: grid;
  grid-template-columns: 1fr 220px;
  gap: 24px;
  min-height: 420px;
  margin-top: 8px;
}
.body.single { grid-template-columns: 1fr; }
.body.vendor-bill {
  display: block;
  min-height: 0;
}
.body.vendor-bill .calcs {
  width: 100%;
}
.body.vendor-bill .deductions-section {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #86efac;
}
.body.vendor-bill .section-heading {
  margin: 0 0 6px;
  font-size: 16px;
  font-weight: 400;
  color: #166534;
  letter-spacing: 0.3px;
}
.body.vendor-bill .deductions {
  padding: 0;
  max-width: 360px;
}
.body.vendor-bill .ded-row {
  grid-template-columns: 1fr 12px 80px;
  font-size: 15px;
}
.body.vendor-bill .totals {
  margin-top: 16px;
  justify-content: flex-end;
}
.body.vendor-bill .totals-box {
  min-width: 280px;
}
.calcs { padding: 2px 0; }
.mat-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
  margin-bottom: 3px;
  padding-bottom: 3px;
  border-bottom: 1px solid #bbf7d0;
  line-height: 1.35;
}
.mat-row:last-of-type { border-bottom: none; margin-bottom: 0; }
.mat-row .mat-name {
  flex: 0 0 auto;
  font-size: 14px;
  color: #14532d;
  font-weight: 400;
}
.mat-row .bag-n {
  display: inline-block;
  margin-left: 4px;
  font-size: 11px;
  color: #15803d;
  opacity: 0.85;
}
.mat-row .bag-n::before { content: '('; }
.mat-row .bag-n::after { content: ')'; }
.mat-row .bag-list {
  flex: 1 1 12rem;
  font-size: 13px;
  color: #166534;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}
.mat-eq {
  margin-top: 4px;
  font-size: 14px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.mat-table-wrap { margin-top: 8px; }
.items-table {
  width: 100%;
  border-collapse: collapse;
  border: none;
  font-size: 15px;
  line-height: 1.55;
}
.items-table th,
.items-table td {
  border: none;
  padding: 6px 8px;
  vertical-align: baseline;
  background: transparent;
}
.items-table thead th {
  font-weight: 400;
  color: #166534;
  font-size: 13px;
  padding-bottom: 8px;
  border-bottom: 1px solid #86efac;
}
.items-table tbody td {
  font-size: 16px;
  color: #14532d;
  padding-top: 8px;
  padding-bottom: 8px;
}
.items-table .col-item { text-align: left; width: 34%; }
.items-table .col-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.items-table .col-amt { width: 22%; font-weight: 400; }
.gross-box {
  margin-top: 4px;
  padding-top: 10px;
  border-top: 2px solid #166534;
  font-size: 20px;
  text-align: right;
  padding-right: 8px;
  color: #14532d;
}
.deductions { padding: 4px 0 4px 8px; background: transparent; }
.ded-row {
  display: grid;
  grid-template-columns: 1fr 12px 64px;
  align-items: baseline;
  font-size: 14px;
  line-height: 1.7;
  gap: 4px;
}
.ded-colon { text-align: center; }
.ded-val {
  text-align: right;
  font-variant-numeric: tabular-nums;
  min-height: 1.2em;
}
.ded-total {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px solid #86efac;
  display: flex;
  justify-content: flex-end;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}
.totals {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}
.totals-box {
  min-width: 240px;
  text-align: right;
  font-size: 18px;
  line-height: 1.7;
  font-variant-numeric: tabular-nums;
}
.totals-box .net {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 2px solid #166534;
  color: #14532d;
  font-size: 20px;
}
.muted { opacity: 0.45; }
body.bill-preview {
  margin: 0;
  background: #d1e7d0;
  min-height: 100vh;
}
.preview-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 10px 16px;
  background: rgba(231, 243, 230, 0.95);
  border-bottom: 1px solid #86efac;
}
.preview-toolbar button {
  font: inherit;
  cursor: pointer;
  border: 1px solid #166534;
  background: #166534;
  color: #fff;
  border-radius: 8px;
  padding: 8px 14px;
}
.preview-toolbar button.whatsapp {
  background: #25D366;
  color: #fff;
  border-color: #25D366;
  font-weight: 600;
}
.preview-toolbar button.whatsapp:hover {
  background: #1eb956;
}
.preview-toolbar button.secondary {
  background: #fff;
  color: #166534;
}
.preview-stage {
  padding: 8px;
  display: flex;
  justify-content: center;
}
@media print {
  .preview-toolbar { display: none !important; }
  body.bill-preview { background: #e7f3e6; }
  .preview-stage { padding: 0; }
  .sheet { box-shadow: none; margin: 0; }
  @page { size: A4; margin: 8mm; }
}
`;

let cachedWatermarkDataUrl = null;
const WATERMARK_CACHE_KEY = 'v6-file-as-is';

/** Prefer file URL in preview windows (fast). Data URL kept for rare offline needs. */
export function ayyappaWatermarkSrc() {
  return `${window.location.origin}/images/ayyappa-watermark.png?${WATERMARK_CACHE_KEY}`;
}

export async function loadAyyappaWatermarkDataUrl() {
  return ayyappaWatermarkSrc();
}

export function brandHeaderHtml(watermarkSrc, dateValue) {
  const staffHtml = STAFF.map(
    (s) =>
      `<div><span class="staff-name">${esc(s.name)}</span> : ${esc(s.phone)}</div>`
  ).join('');

  return `
    ${
      watermarkSrc
        ? `<div class="watermark-wrap"><img class="watermark" src="${watermarkSrc}" alt="" /></div>`
        : ''
    }
    <div class="sheet-header">
      <div class="staff">${staffHtml}</div>
      <div class="top-center">
        <p class="invocation">${esc(TE.om)}</p>
        <p class="prop-line">${esc(TE.prop)} &nbsp;&nbsp; ${esc(TE.cell)}</p>
      </div>
      <div class="biz-block">
        <h1 class="biz-name">${esc(TE.biz)}</h1>
        <p class="biz-addr">${esc(TE.addr)}</p>
      </div>
      <div class="date-line">${esc(TE.tedi)} : ${esc(fmtDateShort(dateValue))}</div>
    </div>
  `;
}

/** Prefetch watermark image so the first bill paints faster. */
export function warmRaituBillAssets() {
  const img = new Image();
  img.src = ayyappaWatermarkSrc();
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'font';
  link.href = `${window.location.origin}/fonts/Ramabhadra-Regular.ttf`;
  link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

/**
 * Open రైతుపట్టి bill as live HTML (instant) — use Print to save PDF.
 * Avoids html2canvas which blocked the app for ~1 minute.
 */
export async function openRaituSheetPdf(innerMarkup, previewTab) {
  const watermarkSrc = ayyappaWatermarkSrc();
  const fontCss = await ramabhadraFontFaceCss();

  const sheetInner = typeof innerMarkup === 'function' ? innerMarkup(watermarkSrc) : innerMarkup;

  const html = `<!DOCTYPE html>
<html lang="te">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Bill</title>
  <style>
${fontCss}
${BILL_CSS}
.sheet {
  box-shadow: 0 8px 28px rgba(20, 83, 45, 0.12);
  margin: 0 auto;
}
  </style>
</head>
<body class="bill-preview" style="font-family:'${RAMABHADRA}','Noto Sans Telugu',sans-serif;font-weight:400;">
  <div class="preview-toolbar no-print">
    <button type="button" class="secondary" onclick="window.close()">Close</button>
    <button type="button" class="whatsapp" onclick="sendWhatsAppBill()">Send WhatsApp</button>
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="preview-stage">
    <div class="sheet">${sheetInner}</div>
  </div>
  <script>
    function sendWhatsAppBill() {
      var sheet = document.querySelector('.sheet');
      var bodyText = sheet ? sheet.innerText : document.body.innerText;
      var lines = bodyText.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
      var text = '*JSR AGRI TRADES - Bill Details*\n-----------------------------------\n' + lines.slice(0, 35).join('\n') + '\n-----------------------------------\n*Thank you!* 🙏';
      window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
    }
  </script>
</body>
</html>`;

  let targetWin = previewTab;
  if (!targetWin || targetWin.closed) {
    targetWin = window.open('', '_blank');
  }
  if (!targetWin) {
    throw new Error('Could not open bill window — allow popups and try again');
  }
  try {
    targetWin.document.open();
    targetWin.document.write(html);
    targetWin.document.close();
    targetWin.focus?.();
  } catch {
    try {
      const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
      targetWin.location.href = blobUrl;
      targetWin.focus?.();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch {
      throw new Error('Could not render bill window');
    }
  }
}
