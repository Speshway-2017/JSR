import {
  TE,
  esc,
  fmtMoney,
  brandHeaderHtml,
  materialTeluguMap,
  itemsTableHtml,
  resolvePartyTeluguName,
  openRaituSheetPdf,
  BILL_CSS,
  openBillPreviewTab,
  writeToPrintWindow,
} from './raituBillShared';
import { RAMABHADRA, ramabhadraFontFaceCss } from './pdfFont';

async function customerBillInner(sale) {
  const [teluguMap, partyName] = await Promise.all([
    materialTeluguMap(),
    resolvePartyTeluguName(sale.customer || {}),
  ]);
  const saleDate = sale.createdAt || new Date();
  const lines = sale.lines || [];
  const materialsTotal = lines.reduce((s, l) => s + (Number(l.totalAmount) || 0), 0);
  const cooly = Number(sale.handlingCharges || 0);
  const total = Number(sale.totalAmount != null ? sale.totalAmount : materialsTotal + cooly);
  const tableHtml = itemsTableHtml(lines, teluguMap);

  const coolyHtml =
    cooly > 0
      ? `<div class="deductions">
          <div class="ded-row">
            <span>${esc(TE.cooly)}</span>
            <span class="ded-colon">:</span>
            <span class="ded-val">${esc(fmtMoney(cooly))}</span>
          </div>
        </div>`
      : '';

  return `
    ${brandHeaderHtml('', saleDate)}
    <div class="party-line">
      <span>${esc(TE.sri)}</span>
      <span class="party-name">${esc(partyName)}</span>
      <span>${esc(TE.garu)}</span>
    </div>
    <div class="body ${cooly > 0 ? '' : 'single'}">
      <div class="calcs">
        ${tableHtml}
        <div class="gross-box"><strong>${esc(TE.mottham)} : ${esc(fmtMoney(total))}</strong></div>
      </div>
      ${coolyHtml}
    </div>
    ${
      cooly > 0
        ? `<div class="totals">
      <div class="totals-box">
        <div>${esc(fmtMoney(materialsTotal))} + ${esc(fmtMoney(cooly))}</div>
        <div class="net">${esc(TE.mottham)} : <strong>${esc(fmtMoney(total))}</strong></div>
      </div>
    </div>`
        : ''
    }`;
}

/**
 * Customer sale bill — same రైతుపట్టి template as vendor bill,
 * no watermark on customer bills.
 */
export async function openCustomerSaleBillPdf(sale, previewTab) {
  const inner = await customerBillInner(sale);
  await openRaituSheetPdf(() => inner, previewTab);
}

export async function generateSingleCustomerBillHtml(sale) {
  const inner = await customerBillInner(sale);
  const fontCss = await ramabhadraFontFaceCss();
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    ${fontCss}
    ${BILL_CSS}
  </style>
</head>
<body style="font-family:'${RAMABHADRA}','Noto Sans Telugu',sans-serif;font-weight:400;background:#fff;margin:0;padding:10px;">
  <div class="sheet" style="margin:0 auto;box-shadow:none;">
    ${inner}
  </div>
</body>
</html>`;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Print many customer bills N-up (4 or 6 per A4 page). No watermark.
 */
export async function openCustomerBillsNUp(sales, perPage = 4, previewTab) {
  const n = perPage === 2 ? 2 : perPage === 6 ? 6 : 4;
  const cols = 2;
  const rows = n / cols;
  const sheetH = n === 2 ? 1400 : n === 6 ? 900 : 1100;
  const inners = [];
  for (const sale of sales) {
    inners.push(await customerBillInner(sale));
  }

  const pages = chunk(inners, n);
  const fontCss = await ramabhadraFontFaceCss();

  const pageHtml = pages
    .map(
      (pageBills) => `
    <section class="nup-page nup-${n}">
      ${pageBills
        .map(
          (inner) => `
        <div class="nup-cell">
          <div class="nup-scale">
            <div class="sheet nup-sheet">${inner}</div>
          </div>
        </div>`
        )
        .join('')}
    </section>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html lang="te">
<head>
  <meta charset="utf-8" />
  <title>Bill Print</title>
  <style>
${fontCss}
${BILL_CSS}
.nup-page {
  width: 210mm;
  height: 297mm;
  display: grid;
  grid-template-columns: repeat(${cols}, 1fr);
  grid-template-rows: repeat(${rows}, 1fr);
  gap: 1.5mm;
  padding: 2mm;
  page-break-after: always;
  box-sizing: border-box;
  background: #fff;
}
.nup-page:last-child { page-break-after: auto; }
.nup-cell {
  overflow: hidden;
  border: 1px solid #000;
  position: relative;
  min-width: 0;
  min-height: 0;
  background: #fff;
}
.nup-scale {
  width: 794px;
  transform-origin: top left;
}
.nup-scale .sheet.nup-sheet {
  width: 794px;
  min-height: ${sheetH}px;
  height: ${sheetH}px;
  padding: 10px 18px 14px;
  box-shadow: none;
  margin: 0;
}
.nup-scale .sheet.nup-sheet .body {
  min-height: 0;
}
.preview-stage { padding: 12px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
@media print {
  .preview-toolbar { display: none !important; }
  body.bill-preview { background: #fff; }
  .preview-stage { padding: 0; }
  .nup-page { margin: 0; }
  @page { size: A4 portrait; margin: 3mm; }
}
  </style>
</head>
<body class="bill-preview" style="font-family:'${RAMABHADRA}','Noto Sans Telugu',sans-serif;font-weight:400;">
  <div class="preview-toolbar no-print">
    <button type="button" class="secondary" onclick="window.close()">Close</button>
    <button type="button" style="background:#25D366;color:#fff;border-color:#25D366;font-weight:600;" onclick="sendWhatsAppBill()">Send WhatsApp</button>
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="preview-stage">
    ${pageHtml}
  </div>
  <script>
    function sendWhatsAppBill() {
      var stage = document.querySelector('.preview-stage');
      var bodyText = stage ? stage.innerText : document.body.innerText;
      var lines = bodyText.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
      var text = '*JSR AGRI TRADES - Bills Summary*\n-----------------------------------\n' + lines.slice(0, 40).join('\n') + '\n-----------------------------------\n*Thank you!* 🙏';
      window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
    }
    function fitNupCells() {
      document.querySelectorAll('.nup-cell').forEach(function (cell) {
        var wrap = cell.querySelector('.nup-scale');
        var sheet = wrap && wrap.querySelector('.sheet');
        if (!wrap || !sheet) return;
        wrap.style.transform = 'none';
        var cw = cell.clientWidth;
        var ch = cell.clientHeight;
        var sw = sheet.offsetWidth || 794;
        var sh = sheet.offsetHeight || 1;
        if (!cw || !ch || !sw || !sh) return;
        wrap.style.transform = 'scale(' + (cw / sw) + ',' + (ch / sh) + ')';
      });
    }
    function whenReady(fn) {
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(fn);
      else fn();
    }
    window.addEventListener('load', function () { whenReady(fitNupCells); });
    window.addEventListener('resize', fitNupCells);
    window.addEventListener('beforeprint', fitNupCells);
  </script>
</body>
</html>`;

  return writeToPrintWindow(html, previewTab);
}

export { openBillPreviewTab };
