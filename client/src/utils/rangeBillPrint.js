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

export function buildNUpCellContent(summaryRow, teluguMap) {
  if (!summaryRow) return '';
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

  let rowsHtml = '';

  // 1. Opening balance row
  rowsHtml += `<tr>
    <td class="date"></td>
    <td class="item">Opening</td>
    <td class="num"></td>
    <td class="num"></td>
    <td class="num"></td>
    <td class="num">${esc(fmtMoney(opening))}</td>
  </tr>`;

  // 2. Entries rows (Sales and Payments interleaved with intermediate Subtotal and Balance tallies)
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

  let runningBalance = opening;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (entry.isPayment || entry.type === 'payment') {
      // Collect consecutive payments in this payment group
      const payGroup = [entry];
      while (i + 1 < entries.length && (entries[i + 1].isPayment || entries[i + 1].type === 'payment')) {
        i++;
        payGroup.push(entries[i]);
      }

      // Intermediate subtotal row before deducting payment group
      rowsHtml += `<tr class="subtotal-row">
        <td class="date"></td>
        <td class="item" style="font-weight:700;">మొత్తం (Subtotal)</td>
        <td class="num" colspan="3"></td>
        <td class="num" style="font-weight:700;">${esc(fmtMoney(runningBalance))}</td>
      </tr>`;

      // Render each payment in the group
      for (const p of payGroup) {
        const payAmt = Number(p.amount) || 0;
        runningBalance -= payAmt;
        const payAmtStr = `-${fmtMoney(payAmt)}`;
        const payDateStr = formatDateShort(p.date || p.createdAt || summaryRow.date || summaryRow.startDate);
        rowsHtml += `<tr class="payment-row">
          <td class="date">${esc(payDateStr)}</td>
          <td class="item" style="font-weight:600;color:#047857;">Paid (చెల్లింపు)</td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num"></td>
          <td class="num" style="font-weight:700;color:#047857;">${esc(payAmtStr)}</td>
        </tr>`;
      }

      // Intermediate balance (బాకీ) tally row after deducting payment group
      rowsHtml += `<tr class="tally-row">
        <td class="date"></td>
        <td class="item" style="font-weight:700;">బాకీ (Balance)</td>
        <td class="num" colspan="3"></td>
        <td class="num" style="font-weight:700;">${esc(fmtMoney(runningBalance))}</td>
      </tr>`;

      continue;
    }

    const rawName = entry.material || entry.materialName || '—';
    const teName = entry.materialNameTelugu || (teluguMap?.get ? teluguMap.get(String(rawName).trim().toLowerCase()) : teluguMap?.[String(rawName).trim().toLowerCase()]);
    const matName = teName && teName.trim() && teName.trim().toLowerCase() !== String(rawName).trim().toLowerCase()
      ? `${rawName} (${teName.trim()})`
      : displayMaterialName(rawName, teluguMap);
    const bagVal = entry.bags != null ? entry.bags : entry.bagCount != null ? entry.bagCount : 0;
    const bagsStr = Number(bagVal) > 0 ? String(bagVal) : '';

    const weightVal = entry.weight != null ? entry.weight : entry.totalKg != null ? entry.totalKg : '';
    const weightStr = Number(weightVal) > 0 ? fmtNum(weightVal) : '';

    const rateVal = entry.ratePerKg != null ? entry.ratePerKg : entry.rate != null ? entry.rate : '';
    const rateStr = Number(rateVal) > 0 ? fmtNum(rateVal) : '';

    const lineTotal = (Number(entry.amount) || 0) + (Number(entry.cooly) || 0);
    runningBalance += lineTotal;
    const amtStr = fmtMoney(lineTotal);
    const itemDateStr = formatDateShort(entry.date || summaryRow.date || summaryRow.startDate);

    rowsHtml += `<tr>
      <td class="date">${esc(itemDateStr)}</td>
      <td class="item">${esc(matName)}</td>
      <td class="num">${esc(bagsStr)}</td>
      <td class="num">${esc(weightStr)}</td>
      <td class="num">${esc(rateStr)}</td>
      <td class="num">${esc(amtStr)}</td>
    </tr>`;
  }

  // 4. Total row
  rowsHtml += `<tr class="rule">
    <td class="date"></td>
    <td class="item">Total</td>
    <td class="num" colspan="3"></td>
    <td class="num">${esc(fmtMoney(total))}</td>
  </tr>`;

  // 5. Closing row
  rowsHtml += `<tr class="rule">
    <td class="date"></td>
    <td class="item">Closing</td>
    <td class="num" colspan="3"></td>
    <td class="num">${esc(fmtMoney(closing))}</td>
  </tr>`;

  return `
  <div class="party">
    ${esc(nameEn)}
    ${nameTe ? `<span class="te">${esc(nameTe)}</span>` : ''}
    ${isPurchase ? `<span style="display:block;font-size:10px;font-weight:normal;color:#333;">Purchase Bill${summaryRow.city ? ` · ${esc(summaryRow.city)}` : (summaryRow.purchaseDate || summaryRow.date ? ` · ${esc(formatDateShort(summaryRow.purchaseDate || summaryRow.date))}` : '')}</span>` : ''}
  </div>
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

export async function openRangeBillsNUp(bills, perPage = 4, previewTab) {
  const [fontCss, teluguMap] = await Promise.all([
    ramabhadraFontFaceCss(),
    materialTeluguMap(),
  ]);

  const n = perPage === 2 ? 2 : perPage === 6 ? 6 : 4;
  const cols = 2;
  const rows = n / cols;

  const cellContents = bills.map((b) => buildNUpCellContent(b, teluguMap));
  const pages = chunkArray(cellContents, n);

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
  width: 198mm;
  min-height: 280mm;
  display: grid;
  grid-template-columns: repeat(${cols}, 1fr);
  grid-template-rows: repeat(${rows}, 1fr);
  page-break-after: always;
  break-after: page;
  background: #ffffff;
  border-top: 1px solid #000000;
  border-left: 1px solid #000000;
  box-sizing: border-box;
}
.page:last-child { page-break-after: auto; break-after: auto; }
.cell {
  border-right: 1px solid #000000;
  border-bottom: 1px solid #000000;
  overflow: hidden;
  padding: 6px 8px;
  min-width: 0;
  min-height: 0;
  box-sizing: border-box;
  background: #ffffff;
  position: relative;
}
.party {
  font-size: 14px;
  font-weight: 700;
  color: #000000;
  text-align: center;
  border-bottom: 1px solid #000000;
  padding-bottom: 3px;
  margin-bottom: 4px;
  line-height: 1.25;
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
  padding: 2px 3px;
  border-bottom: 1px solid #000000;
  font-size: 12px;
  font-weight: 700;
  color: #000000;
  text-align: left;
}
table.lines th.num {
  text-align: right;
}
table.lines td {
  padding: 1px 3px;
  vertical-align: top;
  color: #000000;
}
table.lines td.date { width: 1%; white-space: nowrap; color: #000000; }
table.lines td.item { width: 100%; color: #000000; }
table.lines td.num { width: 1%; white-space: nowrap; text-align: right; padding-left: 6px; color: #000000; }
table.lines tr.rule td { border-top: 1px solid #000000; font-weight: 700; padding-top: 3px; color: #000000; }
table.lines tr.subtotal-row td { border-top: 1px solid #000000; font-weight: 700; padding-top: 2px; color: #000000; }
table.lines tr.payment-row td { color: #047857; }
table.lines tr.tally-row td { border-top: 1px dashed #000000; border-bottom: 1px dashed #000000; font-weight: 700; padding: 2px 3px; color: #000000; }
@media print {
  .preview-toolbar { display: none !important; }
  body.bill-preview { background: #ffffff; }
  .stage { padding: 0; }
  .page { box-shadow: none; margin: 0; }
  @page { size: A4 portrait; margin: 5mm; }
}
  </style>
</head>
<body class="bill-preview">
  <div class="preview-toolbar no-print">
    <button type="button" class="secondary" onclick="window.close()">Close</button>
    <button type="button" id="whatsapp-btn" class="whatsapp" onclick="sendWhatsAppBill()">Send WhatsApp</button>
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
      var lines = bodyText.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
      var text = '*JSR AGRI TRADES - Customer Bills*\n-----------------------------------\n' + lines.slice(0, 40).join('\n') + '\n-----------------------------------\n*Thank you!* 🙏';
      window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
    }
  </script>
</body>
</html>`;

  return writeToPrintWindow(html, previewTab);
}

export { openBillPreviewTab };
