import { RAMABHADRA, ramabhadraFontFaceCss } from './pdfFont';
import { TE, openBillPreviewTab, writeToPrintWindow, materialTeluguMap, displayMaterialName } from './raituBillShared';

function fmtNum(n) {
  const v = Number(n) || 0;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1).replace(/\.0$/, '');
}

function fmtMoney(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-IN');
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function chunkArray(arr, size) {
  const res = [];
  for (let i = 0; i < arr.length; i += size) {
    res.push(arr.slice(i, i + size));
  }
  return res;
}

function prepareStatementEntries(summaryRow, teluguMap) {
  const c = summaryRow.customer || summaryRow.vendor || {};
  const nameEn = summaryRow.name || c.name || (summaryRow.isPurchase ? 'Vendor' : '—');
  const nameTe = summaryRow.nameTelugu || c.nameTelugu || '';
  const isPurchase = !!summaryRow.isPurchase;

  const opening = Number(
    summaryRow.opening != null
      ? summaryRow.opening
      : summaryRow.openingBalance != null
      ? summaryRow.openingBalance
      : 0
  );

  const sales = summaryRow.sales || summaryRow.lines || [];
  const calculatedSalesSum = sales.reduce((sum, s) => sum + (Number(s.amount) || 0) + (Number(s.cooly) || 0), 0);
  const total = Number(
    summaryRow.totalSale != null
      ? summaryRow.totalSale
      : summaryRow.totalAmount != null
      ? summaryRow.totalAmount
      : summaryRow.salesTotal != null
      ? summaryRow.salesTotal
      : calculatedSalesSum
  );

  const totalPaid = Number(summaryRow.totalPaid || 0);
  const closing = Number(
    summaryRow.closing != null
      ? summaryRow.closing
      : summaryRow.closingBalance != null
      ? summaryRow.closingBalance
      : opening + total - totalPaid
  );

  const rawEntries = summaryRow.entries && summaryRow.entries.length
    ? summaryRow.entries
    : [
        ...sales.map((s) => ({ ...s, isPayment: false })),
        ...(summaryRow.payments || []).map((p) => ({
          ...p,
          isPayment: true,
          material: p.description || 'Paid',
        })),
      ].sort(
        (a, b) =>
          new Date(a.date || a.createdAt || 0).getTime() -
          new Date(b.date || b.createdAt || 0).getTime()
      );

  const entries = rawEntries.filter((entry) => {
    const raw = String(entry.material || entry.materialName || '').toLowerCase();
    return raw !== 'cooly' && !entry.isCoolyLine;
  });

  const units = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.isPayment || entry.type === 'payment') {
      const payGroup = [entry];
      while (i + 1 < entries.length && (entries[i + 1].isPayment || entries[i + 1].type === 'payment')) {
        i++;
        payGroup.push(entries[i]);
      }
      units.push({
        type: 'payment-group',
        payGroup,
        lineCount: payGroup.length + 2, // 1 subtotal + N payments + 1 balance tally
      });
    } else {
      const rawName = entry.material || entry.materialName || '—';
      const matName = displayMaterialName(rawName, teluguMap, entry.materialNameTelugu);
      const bagVal = entry.bags != null ? entry.bags : entry.bagCount != null ? entry.bagCount : 0;
      const bagsStr = Number(bagVal) > 0 ? String(bagVal) : '';
      const weightVal = entry.weight != null ? entry.weight : entry.totalKg != null ? entry.totalKg : '';
      const weightStr = Number(weightVal) > 0 ? fmtNum(weightVal) : '';
      const rateVal = entry.ratePerKg != null ? entry.ratePerKg : entry.rate != null ? entry.rate : '';
      const rateStr = Number(rateVal) > 0 ? fmtNum(rateVal) : '';
      const lineTotal = (Number(entry.amount) || 0) + (Number(entry.cooly) || 0);
      const itemDateStr = formatDateShort(entry.date || summaryRow.date || summaryRow.startDate);

      units.push({
        type: 'sale',
        dateStr: itemDateStr,
        matName,
        bagsStr,
        weightStr,
        rateStr,
        lineTotal,
        lineCount: 1,
      });
    }
  }

  return {
    nameEn,
    nameTe,
    isPurchase,
    city: summaryRow.city,
    purchaseDate: summaryRow.purchaseDate || summaryRow.date,
    opening,
    total,
    closing,
    units,
  };
}

function renderCellChunkHtml(chunk) {
  const { stmt, units, isFirst, isLast, startBalance } = chunk;
  let rowsHtml = '';
  let runningBalance = startBalance;

  // 1. Opening balance row (if first chunk) or Brought Forward row (if continuation chunk)
  if (isFirst) {
    rowsHtml += `<tr>
      <td class="date"></td>
      <td class="item opening-item">Opening</td>
      <td class="num"></td>
      <td class="num"></td>
      <td class="num"></td>
      <td class="num">${esc(fmtMoney(stmt.opening))}</td>
    </tr>`;
  } else {
    rowsHtml += `<tr class="brought-row">
      <td class="date"></td>
      <td class="item brought-item" style="font-weight:700;">బాకీ (b/f)</td>
      <td class="num" colspan="3"></td>
      <td class="num" style="font-weight:700;">${esc(fmtMoney(runningBalance))}</td>
    </tr>`;
  }

  // 2. Units in this chunk
  for (const u of units) {
    if (u.type === 'payment-group') {
      // Subtotal row before payment
      rowsHtml += `<tr class="subtotal-row">
        <td class="date"></td>
        <td class="item subtotal-item" style="font-weight:700;">మొత్తం (Subtotal)</td>
        <td class="num" colspan="3"></td>
        <td class="num" style="font-weight:700;">${esc(fmtMoney(runningBalance))}</td>
      </tr>`;

      // Payment lines
      for (const p of u.payGroup) {
        const payAmt = Number(p.amount) || 0;
        runningBalance -= payAmt;
        const payAmtStr = `-${fmtMoney(payAmt)}`;
        const payDateStr = formatDateShort(p.date || p.createdAt || stmt.purchaseDate);
        rowsHtml += `<tr class="payment-row">
          <td class="date">${esc(payDateStr)}</td>
          <td class="item payment-item" style="font-weight:600;color:#047857;">Paid (చెల్లింపు)</td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num" style="font-weight:700;color:#047857;">${esc(payAmtStr)}</td>
        </tr>`;
      }

      // Balance tally row
      rowsHtml += `<tr class="tally-row">
        <td class="date"></td>
        <td class="item balance-item" style="font-weight:700;">బాకీ (Balance)</td>
        <td class="num" colspan="3"></td>
        <td class="num" style="font-weight:700;">${esc(fmtMoney(runningBalance))}</td>
      </tr>`;
    } else if (u.type === 'sale') {
      runningBalance += u.lineTotal;
      rowsHtml += `<tr>
        <td class="date">${esc(u.dateStr)}</td>
        <td class="item mat-item">${esc(u.matName)}</td>
        <td class="num">${esc(u.bagsStr)}</td>
        <td class="num">${esc(u.weightStr)}</td>
        <td class="num">${esc(u.rateStr)}</td>
        <td class="num">${esc(fmtMoney(u.lineTotal))}</td>
      </tr>`;
    }
  }

  // 3. Footer: Closing (if last chunk) or Continuation c/f (if intermediate chunk)
  if (isLast) {
    rowsHtml += `<tr class="rule">
      <td class="date"></td>
      <td class="item closing-item">Closing</td>
      <td class="num" colspan="3"></td>
      <td class="num">${esc(fmtMoney(stmt.closing))}</td>
    </tr>`;
  } else {
    rowsHtml += `<tr class="carry-row">
      <td class="date"></td>
      <td class="item carry-item" style="font-weight:700;">కొనసాగింపు (c/f)</td>
      <td class="num" colspan="3"></td>
      <td class="num" style="font-weight:700;">${esc(fmtMoney(runningBalance))}</td>
    </tr>`;
  }

  const headerHtml = isFirst
    ? `<div class="party">
        ${esc(stmt.nameEn)}
        ${stmt.nameTe ? `<span class="te">${esc(stmt.nameTe)}</span>` : ''}
        ${stmt.isPurchase ? `<span style="display:block;font-size:10px;font-weight:normal;color:#333;">Purchase Bill${stmt.city ? ` · ${esc(stmt.city)}` : (stmt.purchaseDate ? ` · ${esc(formatDateShort(stmt.purchaseDate))}` : '')}</span>` : ''}
      </div>`
    : `<div class="party">
        ${esc(stmt.nameEn)} <span style="font-size:10.5px;font-weight:normal;color:#4b5563;">(కొనసాగింపు)</span>
        ${stmt.nameTe ? `<span class="te">${esc(stmt.nameTe)}</span>` : ''}
      </div>`;

  return `
  ${headerHtml}
  <table class="lines">
    <thead>
      <tr class="th-row">
        <th class="date">${esc(TE.tedi)}</th>
        <th class="item">${esc(TE.itemCol)}</th>
        <th class="num">${esc(TE.bag)}</th>
        <th class="num">బరువు (kg)</th>
        <th class="num">ధర</th>
        <th class="num">${esc(TE.mottham)}</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>`;
}

export function buildNUpCellChunks(summaryRow, teluguMap, perPage = 4) {
  if (!summaryRow) return [];
  const stmt = prepareStatementEntries(summaryRow, teluguMap);
  const maxRows = perPage === 2 ? 48 : perPage === 4 ? 23 : 13;

  const totalUnitsRows = stmt.units.reduce((s, u) => s + u.lineCount, 0);
  const totalRowsSingleCell = 1 + totalUnitsRows + 1;

  if (totalRowsSingleCell <= maxRows) {
    return [
      renderCellChunkHtml({
        stmt,
        units: stmt.units,
        isFirst: true,
        isLast: true,
        chunkIndex: 0,
        startBalance: stmt.opening,
      }),
    ];
  }

  const chunks = [];
  let unitIdx = 0;
  let runningBalance = stmt.opening;
  let chunkIndex = 0;

  while (unitIdx < stmt.units.length) {
    const isFirst = chunkIndex === 0;
    const chunkStartBalance = runningBalance;
    const chunkUnits = [];
    let currentRows = 1; // Opening or Brought-Forward takes 1 row

    while (unitIdx < stmt.units.length) {
      const nextUnit = stmt.units[unitIdx];
      const remainingUnitsAfterNext = stmt.units.length - (unitIdx + 1);
      const neededFooterRows = 1; // 1 row for Closing (last chunk) or carry-forward (intermediate chunk)

      if (currentRows + nextUnit.lineCount + neededFooterRows <= maxRows || chunkUnits.length === 0) {
        chunkUnits.push(nextUnit);
        currentRows += nextUnit.lineCount;
        unitIdx++;
      } else {
        break;
      }
    }

    const isLast = unitIdx >= stmt.units.length;

    chunks.push({
      stmt,
      units: chunkUnits,
      isFirst,
      isLast,
      chunkIndex,
      startBalance: chunkStartBalance,
    });

    for (const u of chunkUnits) {
      if (u.type === 'payment-group') {
        for (const p of u.payGroup) {
          runningBalance -= Number(p.amount) || 0;
        }
      } else if (u.type === 'sale') {
        runningBalance += u.lineTotal;
      }
    }

    chunkIndex++;
  }

  return chunks.map((c) => renderCellChunkHtml(c));
}

export function buildNUpCellContent(summaryRow, teluguMap) {
  const chunks = buildNUpCellChunks(summaryRow, teluguMap, 4);
  return chunks[0] || '';
}

export const RANGE_BILL_CELL_CSS = `
  .party {
    font-size: 15px;
    font-weight: 700;
    color: #000000;
    text-align: center;
    border-bottom: 1.5px solid #000000;
    padding-bottom: 4px;
    margin-bottom: 6px;
    line-height: 1.25;
  }
  .party .te { display: block; font-size: 13.5px; font-weight: normal; color: #000000; }
  table.lines {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
    line-height: 1.35;
    color: #000000;
  }
  table.lines th {
    padding: 4px 2px;
    border-bottom: 1.5px solid #000000;
    font-size: 12.5px;
    font-weight: 700;
    color: #000000;
    text-align: left;
  }
  table.lines th.item { font-size: 14px; }
  table.lines th.num { text-align: right; }
  table.lines td {
    padding: 2.5px 2px;
    vertical-align: middle;
    color: #000000;
  }
  table.lines td.date { width: 1%; white-space: nowrap; color: #000000; font-size: 12px; }
  table.lines td.item {
    width: 100%;
    color: #000000;
    font-size: 14.5px;
    font-weight: 700;
  }
  table.lines td.mat-item {
    font-size: 15px;
    font-weight: 700;
    color: #000000;
  }
  table.lines td.opening-item {
    font-size: 14px;
    font-weight: 700;
  }
  table.lines td.num {
    width: 1%;
    white-space: nowrap;
    text-align: right;
    padding-left: 5px;
    color: #000000;
    font-size: 13px;
    font-weight: 600;
  }
  table.lines tr.rule td { border-top: 1.5px solid #000000; font-weight: 700; padding-top: 4px; color: #000000; font-size: 14px; }
  table.lines tr.payment-row td { color: #047857; font-size: 13px; }
`;

export async function generateSingleStatementBillHtml(summaryRow) {
  const [fontCss, teluguMap] = await Promise.all([
    ramabhadraFontFaceCss(),
    materialTeluguMap(),
  ]);
  const cellHtml = buildNUpCellContent(summaryRow, teluguMap);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${fontCss}
    body {
      font-family: '${RAMABHADRA}', 'Noto Sans Telugu', sans-serif;
      font-weight: 400;
      background: #ffffff;
      color: #000000;
      margin: 0;
      padding: 12px;
      display: flex;
      justify-content: center;
    }
    .bill-card {
      width: 440px;
      border: 1.5px solid #000000;
      padding: 12px 14px;
      background: #ffffff;
      box-sizing: border-box;
    }
    ${RANGE_BILL_CELL_CSS}
  </style>
</head>
<body>
  <div class="bill-card">
    ${cellHtml}
  </div>
</body>
</html>`;
}

export async function openRangeBillsNUp(bills, perPage = 4, previewTab) {
  const [fontCss, teluguMap] = await Promise.all([
    ramabhadraFontFaceCss(),
    materialTeluguMap(),
  ]);

  const n = perPage === 2 ? 2 : perPage === 6 ? 6 : 4;
  const cols = 2;
  const rows = n / cols;

  const allCells = bills.flatMap((b) => buildNUpCellChunks(b, teluguMap, n));
  const pages = chunkArray(allCells, n);

  const pageHtml = pages
    .map((pageCells) => {
      const cells = [...pageCells];
      while (cells.length < n) {
        cells.push('');
      }
      return `<section class="page nup-${n}">
        ${cells
          .map((inner) => `<div class="cell${inner ? ' has-bill' : ''}">${inner}</div>`)
          .join('')}
      </section>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="te">
<head>
  <meta charset="utf-8" />
  <title>Bill Print</title>
  <style>
${fontCss}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body.bill-preview {
  background: #f4f4f5;
  color: #000000;
  font-family: '${RAMABHADRA}', 'Noto Sans Telugu', sans-serif;
  font-weight: 400;
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
  background: #ffffff;
  border-bottom: 1px solid #d4d4d8;
}
.preview-toolbar button {
  font: inherit;
  cursor: pointer;
  border: 1px solid #166534;
  background: #166534;
  color: #fff;
  border-radius: 8px;
  padding: 8px 14px;
  font-weight: 600;
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
  background: #f4f4f5;
  color: #111;
  border: 1px solid #d4d4d8;
  font-weight: 500;
}
.stage {
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.page {
  width: 200mm;
  height: 287mm;
  max-height: 287mm;
  display: grid;
  grid-template-columns: repeat(${cols}, 1fr);
  grid-template-rows: repeat(${rows}, 1fr);
  page-break-after: always;
  break-after: page;
  page-break-inside: avoid;
  break-inside: avoid;
  background: #ffffff;
  border-top: 1px solid #000000;
  border-left: 1px solid #000000;
  box-sizing: border-box;
  overflow: hidden;
}
.page:last-child { page-break-after: auto; break-after: auto; }
.cell {
  border-right: 1px solid #000000;
  border-bottom: 1px solid #000000;
  overflow: hidden;
  padding: 4px 6px;
  min-width: 0;
  height: 100%;
  max-height: 100%;
  box-sizing: border-box;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  position: relative;
}
.party {
  font-size: 14px;
  font-weight: 700;
  color: #000000;
  text-align: center;
  border-bottom: 1px solid #000000;
  padding-bottom: 2px;
  margin-bottom: 3px;
  line-height: 1.25;
  flex-shrink: 0;
}
.party .te { display: block; font-size: 13px; font-weight: normal; color: #000000; }
table.lines {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  line-height: 1.35;
  color: #000000;
}
table.lines th {
  padding: 3px 2px;
  border-bottom: 1px solid #000000;
  font-size: 12px;
  font-weight: 700;
  color: #000000;
  text-align: left;
}
table.lines th.item {
  font-size: 13.5px;
}
table.lines th.num {
  text-align: right;
}
table.lines td {
  padding: 1.5px 2px;
  vertical-align: middle;
  color: #000000;
}
table.lines td.date { width: 1%; white-space: nowrap; color: #000000; font-size: 11.5px; }
table.lines td.item {
  width: 100%;
  color: #000000;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.1px;
}
table.lines td.mat-item {
  font-size: 15px;
  font-weight: 700;
  color: #000000;
}
table.lines td.opening-item {
  font-size: 13.5px;
  font-weight: 600;
}
table.lines td.num {
  width: 1%;
  white-space: nowrap;
  text-align: right;
  padding-left: 4px;
  color: #000000;
  font-size: 12.5px;
  font-weight: 600;
}
table.lines tr.rule td { border-top: 1px solid #000000; font-weight: 700; padding-top: 2px; color: #000000; font-size: 13px; }
table.lines tr.subtotal-row td { border-top: 1px solid #000000; font-weight: 700; padding-top: 1px; color: #000000; font-size: 13px; }
table.lines tr.payment-row td { color: #047857; font-size: 13px; }
table.lines tr.tally-row td { border-top: 1px dashed #000000; border-bottom: 1px dashed #000000; font-weight: 700; padding: 1px 2px; color: #000000; font-size: 13px; }
table.lines tr.carry-row td { border-top: 1px solid #000000; font-weight: 700; color: #374151; font-style: italic; font-size: 13px; }
table.lines tr.brought-row td { border-bottom: 1px solid #e5e7eb; font-weight: 700; color: #374151; font-size: 13px; }
@media print {
  .preview-toolbar { display: none !important; }
  body.bill-preview { background: #ffffff; }
  .stage { padding: 0; margin: 0; }
  .page {
    box-shadow: none;
    margin: 0;
    width: 200mm;
    height: 287mm;
    max-height: 287mm;
    page-break-after: always;
    break-after: page;
    page-break-inside: avoid;
    break-inside: avoid;
    box-sizing: border-box;
    overflow: hidden;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  @page { size: A4 portrait; margin: 5mm; }
}
  </style>
</head>
<body class="bill-preview">
  <div class="preview-toolbar no-print">
    <button type="button" class="secondary" onclick="window.close()">Close</button>
    <button type="button" id="whatsapp-btn" class="whatsapp" onclick="sendWhatsAppBill()">Share</button>
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="stage">
    ${pageHtml}
  </div>
  <script>
    function checkConnectivity() {
      var waBtn = document.getElementById('whatsapp-btn');
      if (waBtn) {
        waBtn.style.display = (navigator.onLine === false) ? 'none' : '';
      }
    }
    window.addEventListener('online', checkConnectivity);
    window.addEventListener('offline', checkConnectivity);
    checkConnectivity();

    function sendWhatsAppBill() {
      var stage = document.querySelector('.stage');
      var bodyText = stage ? stage.innerText : document.body.innerText;
      var lines = bodyText.split('\\n').map(function(l) { return l.trim(); }).filter(Boolean);
      var text = '*JSR AGRI TRADES - Customer Bills*\\n-----------------------------------\\n' + lines.slice(0, 40).join('\\n') + '\\n-----------------------------------\\n*Thank you!* 🙏';
      var phone = window.prompt('Enter 10-digit WhatsApp phone number (or click OK to pick contact in WhatsApp):', '');
      if (phone === null) return;
      var digits = String(phone).replace(/\\D/g, '');
      if (digits.length === 10) digits = '91' + digits;
      var url = digits ? 'https://web.whatsapp.com/send?phone=' + digits + '&text=' + encodeURIComponent(text) : 'https://api.whatsapp.com/send?text=' + encodeURIComponent(text);
      window.open(url, 'JSR_WhatsApp_Web');
    }
  </script>
</body>
</html>`;

  return writeToPrintWindow(html, previewTab);
}

export { openBillPreviewTab };
