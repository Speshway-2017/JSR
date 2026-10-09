import { RAMABHADRA, ramabhadraFontFaceCss } from './pdfFont';
import { openBillPreviewTab, writeToPrintWindow } from './raituBillShared';

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getDate()}/${x.getMonth() + 1}/${String(x.getFullYear()).slice(-2)}`;
}

function fmtBags(bags) {
  return (bags || [])
    .map((n) => {
      if (typeof n === 'string') return n;
      const v = Number(n);
      return Number.isInteger(v) ? String(v) : v.toFixed(1);
    })
    .join(', ');
}

function fmtRate(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(v);
}

export function saleReport2InnerHtml(data) {
  const columns = (data?.columns || [])
    .slice()
    .sort((a, b) => String(a.vendorName || '').localeCompare(String(b.vendorName || ''), 'en', { sensitivity: 'base', numeric: true }));
  if (!columns.length) {
    return `<div class="sheet"><p class="empty">No sales for this date</p></div>`;
  }

  const totalBags = data?.totalBags != null
    ? data.totalBags
    : columns.reduce((acc, col) => acc + (col.bagCount || 0), 0);
  const totalKg = data?.totalWeight != null
    ? data.totalWeight
    : Number(columns.reduce((acc, col) => acc + (col.totalKg || 0), 0).toFixed(1));

  const grandTotalText = (totalBags > 0 || totalKg > 0)
    ? `Total: <strong>${totalBags} Bags</strong>${totalKg > 0 ? ` | <strong>${totalKg} kg</strong>` : ''}`
    : '';

  // Calculate or retrieve material summary
  let summaryList = data?.materialSummary;
  if (!summaryList || !summaryList.length) {
    const sMap = new Map();
    for (const col of columns) {
      for (const mat of col.materials || []) {
        const key = mat.materialName || mat.materialId;
        if (!sMap.has(key)) {
          sMap.set(key, {
            materialId: mat.materialId,
            materialName: mat.materialName,
            materialNameTelugu: mat.materialNameTelugu,
            bagCount: 0,
            totalKg: 0,
            totalAmount: 0,
          });
        }
        const s = sMap.get(key);
        s.bagCount += mat.bagCount || 0;
        s.totalKg += mat.totalKg || 0;
        s.totalAmount += (mat.totalAmount != null ? mat.totalAmount : (mat.entries || []).reduce((acc, e) => acc + (e.amount || 0), 0));
      }
    }
    summaryList = [...sMap.values()].sort((a, b) =>
      String(a.materialName || '').localeCompare(String(b.materialName || ''), 'en', { sensitivity: 'base', numeric: true })
    );
  }

  const sumBags = summaryList.reduce((s, i) => s + (i.bagCount || 0), 0);
  const sumKg = Number(summaryList.reduce((s, i) => s + (i.totalKg || 0), 0).toFixed(1));
  const sumAmt = Math.round(summaryList.reduce((s, i) => s + (i.totalAmount || 0), 0));

  const summaryRowsHtml = summaryList
    .map((item) => {
      const nameStr = esc(item.materialName);
      const teStr = item.materialNameTelugu ? ` <span class="item-te">(${esc(item.materialNameTelugu)})</span>` : '';
      const qtyStr = item.totalKg > 0
        ? `${Number.isInteger(item.totalKg) ? item.totalKg : item.totalKg.toFixed(1)} kg`
        : (item.bagCount ? `${item.bagCount} Bags` : '-');
      const amtStr = `₹${Number(Math.round(item.totalAmount || 0)).toLocaleString('en-IN')}`;

      return `<tr>
        <td class="col-item">${nameStr}${teStr}</td>
        <td class="col-bags">${item.bagCount || 0}</td>
        <td class="col-qty">${esc(qtyStr)}</td>
        <td class="col-amt">${amtStr}</td>
      </tr>`;
    })
    .join('');

  const summaryBlockHtml = `<section class="mat summary-block">
    <div class="head summary-head">
      <div class="summary-title">TOTAL SALE SUMMARY</div>
      <div class="summary-te">మొత్తం అమ్మకాల వివరాలు</div>
    </div>
    <table class="summary-table">
      <thead>
        <tr>
          <th class="col-item">Item</th>
          <th class="col-bags">Bags</th>
          <th class="col-qty">Qty</th>
          <th class="col-amt">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${summaryRowsHtml}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td class="col-item">TOTAL</td>
          <td class="col-bags">${sumBags}</td>
          <td class="col-qty">${sumKg > 0 ? `${sumKg} kg` : ''}</td>
          <td class="col-amt">₹${Number(sumAmt).toLocaleString('en-IN')}</td>
        </tr>
      </tfoot>
    </table>
  </section>`;

  // 5 columns x ~23 lines per column = ~115 lines max per A4 landscape sheet (172mm height)
  const LINES_PER_PAGE = 115;

  const itemsToRender = [
    ...columns.map((c) => ({
      type: 'vendor',
      data: c,
      lineCount: 4 + (c.materials || []).reduce((acc, m) => acc + 2 + (m.entries?.length || 0), 0),
    })),
    {
      type: 'summary',
      html: summaryBlockHtml,
      lineCount: 5 + summaryList.length + 2,
    },
  ];

  const pageChunks = [];
  let currentChunk = [];
  let currentLines = 0;

  for (const item of itemsToRender) {
    if (currentChunk.length > 0 && currentLines + item.lineCount > LINES_PER_PAGE) {
      pageChunks.push(currentChunk);
      currentChunk = [];
      currentLines = 0;
    }
    currentChunk.push(item);
    currentLines += item.lineCount;
  }

  if (currentChunk.length > 0) {
    pageChunks.push(currentChunk);
  }

  const totalPages = pageChunks.length;

  return pageChunks
    .map((chunk, pageIdx) => {
      const blocks = chunk
        .map((item) => {
          if (item.type === 'summary') {
            return item.html;
          }
          const vend = item.data;
          const vendTitle = esc(vend.vendorName);
          const vendTe = vend.vendorNameTelugu ? `<div class="te">${esc(vend.vendorNameTelugu)}</div>` : '';

          const sortedMaterials = (vend.materials || [])
            .slice()
            .sort((a, b) => String(a.materialName || '').localeCompare(String(b.materialName || ''), 'en', { sensitivity: 'base', numeric: true }));

          const matBlocks = sortedMaterials
            .map((mat) => {
              const matTitle = esc(mat.materialName);
              const matTe = mat.materialNameTelugu ? `<span class="mat-te"> (${esc(mat.materialNameTelugu)})</span>` : '';

              const lines = (mat.entries || [])
                .map((e) => {
                  const bagsText = esc(fmtBags(e.bags));
                  const rateVal = e.rate != null ? e.rate : (e.amount != null ? e.amount : 0);
                  return `<div class="line"><span class="who">${esc(e.name)}</span> - ${bagsText} = rs <span class="price-red">${esc(rateVal)}</span></div>`;
                })
                .join('');

              return `<div class="mat-subgroup">
                <div class="mat-subhead">${matTitle}${matTe}</div>
                <div class="group">${lines}</div>
              </div>`;
            })
            .join('');

          const colBags = vend.bagCount || 0;
          const colKg = vend.totalKg || 0;
          const colAmount = vend.totalAmount || (vend.materials || []).reduce((s, m) => s + (m.totalAmount || (m.entries || []).reduce((acc, e) => acc + (e.amount || 0), 0)), 0);
          const amountStr = colAmount > 0 ? ` | ₹${Number(colAmount).toLocaleString('en-IN')}` : '';
          const colSummary = `<div class="col-summary">Tot: <strong>${colBags} Bags</strong>${colKg > 0 ? `, <strong>${colKg} kg</strong>` : ''}${amountStr}</div>`;

          return `<section class="mat"><div class="head">${vendTitle}${vendTe}</div>${matBlocks}${colSummary}</section>`;
        })
        .join('');

      const pageInfo = totalPages > 1 ? ` (Page ${pageIdx + 1} of ${totalPages})` : '';

      return `<div class="sheet ${pageIdx < totalPages - 1 ? 'page-break' : ''}">
        <div class="header-row">
          <div class="when">${esc(fmtDate(data?.date))}${pageInfo}</div>
          <div class="total-bar">${grandTotalText}</div>
        </div>
        <div class="materials-columns">
          ${blocks}
        </div>
      </div>`;
    })
    .join('\n');
}

export const SALE_REPORT_2_CSS = `
.sheet {
  width: 100%;
  max-width: 1100px;
  margin: 0 auto 24px auto;
  padding: 14px 18px;
  background: #ffffff;
  color: #000000;
  font-family: '${RAMABHADRA}', 'Noto Sans Telugu', system-ui, -apple-system, sans-serif;
  font-weight: 400;
  box-sizing: border-box;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

.sheet.page-break {
  margin-bottom: 32px;
}

.header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  padding-bottom: 4px;
  border-bottom: 1.5px solid #111111;
}

.when {
  font-size: 15px;
  font-weight: 700;
}

.total-bar {
  font-size: 13px;
  font-weight: 700;
  color: #111827;
}

.materials-columns {
  columns: 5;
  column-gap: 18px;
  column-rule: 1px solid #111111;
  column-fill: auto;
  height: 172mm;
  width: 100%;
}

.mat {
  display: block;
  width: 100%;
  padding: 0 2px 8px;
  margin-bottom: 12px;
  box-sizing: border-box;
  break-inside: auto;
  page-break-inside: auto;
}

.mat .head {
  text-align: center;
  font-size: 15px;
  font-weight: 800;
  border-bottom: 2px solid #111111;
  margin-bottom: 8px;
  padding: 5px 4px 4px;
  background: #1e293b;
  color: #ffffff;
  text-transform: uppercase;
  border-radius: 3px 3px 0 0;
  break-after: avoid;
  page-break-after: avoid;
}

.mat .head .te {
  font-size: 12px;
  font-weight: 400;
  text-transform: none;
}

.summary-head {
  padding: 4px 2px !important;
}

.summary-head .summary-title {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.summary-head .summary-te {
  font-size: 10px;
  font-weight: 400;
  color: #cbd5e1;
  margin-top: 1px;
  text-transform: none;
}

.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  margin-top: 2px;
}

.summary-table th {
  border-bottom: 1.5px solid #1e293b;
  padding: 4px 2px;
  font-weight: 700;
  color: #111827;
  font-size: 11px;
}

.summary-table th.col-item,
.summary-table td.col-item {
  text-align: left;
  padding-left: 2px;
}

.summary-table th.col-bags,
.summary-table td.col-bags {
  text-align: center;
  width: 14%;
}

.summary-table th.col-qty,
.summary-table td.col-qty {
  text-align: center;
  width: 22%;
  white-space: nowrap;
}

.summary-table th.col-amt,
.summary-table td.col-amt {
  text-align: right;
  padding-right: 2px;
  width: 24%;
  white-space: nowrap;
}

.summary-table td {
  padding: 3px 2px;
  border-bottom: 0.5px dashed #cbd5e1;
  vertical-align: middle;
  font-size: 11px;
}

.summary-table td.col-item {
  font-weight: 700;
  color: #0f172a;
}

.summary-table td.col-item .item-te {
  font-size: 9.5px;
  font-weight: 400;
  color: #475569;
}

.summary-table td.col-amt {
  font-weight: 700;
  color: #111827;
}

.summary-table .total-row td {
  border-top: 1.5px solid #1e293b;
  border-bottom: 2px solid #1e293b;
  font-weight: 800;
  padding-top: 4px;
  padding-bottom: 4px;
  background: #f8fafc;
  color: #000000;
}

.mat-subgroup {
  margin-bottom: 6px;
}

.mat-subhead {
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: #1e293b;
  border-bottom: 1px solid #cbd5e1;
  margin-top: 4px;
  margin-bottom: 4px;
  padding-bottom: 1px;
  break-after: avoid;
  page-break-after: avoid;
}

.mat-subhead .mat-te {
  font-size: 11px;
  font-weight: 400;
  color: #475569;
}

.group {
  margin-bottom: 4px;
}

.line {
  font-size: 12px;
  line-height: 1.45;
  margin-bottom: 3px;
  overflow-wrap: break-word;
}

.line .who {
  font-weight: 700;
}

.line .vendor-tag {
  font-weight: 500;
  color: #374151;
  font-size: 11px;
}

.line .price-red {
  color: #dc2626;
  font-weight: 700;
}

.col-summary {
  font-size: 11px;
  border-top: 1px dashed #4b5563;
  margin-top: 4px;
  padding-top: 2px;
  color: #111827;
  text-align: center;
  font-weight: 500;
  break-before: avoid;
  page-break-before: avoid;
}

.rate {
  display: none !important;
}

.empty {
  font-size: 13px;
  color: #666666;
  text-align: center;
  padding: 24px 0;
}

@media print {
  @page {
    size: A4 landscape;
    margin: 8mm;
  }
  html, body {
    background: #ffffff !important;
  }
  .preview-toolbar {
    display: none !important;
  }
  .stage {
    padding: 0 !important;
    display: block !important;
  }
  .sheet {
    max-width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
    border: none !important;
    box-shadow: none !important;
  }
  .sheet.page-break {
    page-break-after: always !important;
    break-after: page !important;
  }
  .materials-columns {
    height: 172mm !important;
    columns: 5 !important;
    column-gap: 16px !important;
    column-rule: 1px solid #111111 !important;
    column-fill: auto !important;
  }
  .mat {
    break-inside: auto;
    page-break-inside: auto;
  }
  .mat .head {
    break-after: avoid !important;
    page-break-after: avoid !important;
    background: #1e293b !important;
    color: #ffffff !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
  .col-summary {
    break-before: avoid !important;
    page-break-before: avoid !important;
    color: #000000 !important;
    border-top-color: #000000 !important;
  }
  .line .price-red {
    color: #dc2626 !important;
    font-weight: 700 !important;
    -webkit-print-color-adjust: exact;
    color-adjust: exact;
  }
  .line .vendor-tag {
    color: #111827 !important;
  }
  .summary-table th {
    border-bottom: 1.5px solid #000000 !important;
    color: #000000 !important;
  }
  .summary-table td {
    border-bottom: 0.5px dashed #666666 !important;
    color: #000000 !important;
  }
  .summary-table .total-row td {
    border-top: 1.5px solid #000000 !important;
    border-bottom: 2px solid #000000 !important;
    background: #f1f5f9 !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
  .summary-head .summary-te {
    color: #e2e8f0 !important;
  }
}
`;

export async function openSaleReport2Print(data, previewTab, reportTitle) {
  const fontCss = await ramabhadraFontFaceCss();
  const inner = saleReport2InnerHtml(data);
  const title = reportTitle || (data?.isCashReport ? 'Day wise cash sale report' : 'Day wise sale report');
  const html = `<!DOCTYPE html>
<html lang="te">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
${fontCss}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #f3f4f6; color: #111827; }
body {
  font-family: '${RAMABHADRA}', 'Noto Sans Telugu', system-ui, -apple-system, sans-serif;
  font-weight: 400;
}
.preview-toolbar {
  position: sticky; top: 0; z-index: 5;
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 10px 16px; background: #ffffff; border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.preview-toolbar button {
  font: inherit; font-size: 14px; font-weight: 500;
  padding: 8px 16px; cursor: pointer; border-radius: 6px;
  border: 1px solid #d1d5db; background: #ffffff; color: #374151;
}
.preview-toolbar button.primary { background: #166534; border-color: #166534; color: #ffffff; }
.preview-toolbar button.primary:hover { background: #15803d; }
.stage { padding: 20px 16px; display: flex; justify-content: center; }
${SALE_REPORT_2_CSS}
  </style>
</head>
<body>
  <div class="preview-toolbar">
    <button type="button" onclick="window.close()">Close</button>
    <button type="button" id="whatsapp-btn" style="background:#25D366;color:#fff;border-color:#25D366;font-weight:600;" onclick="sendWhatsAppBill()">Share</button>
    <button type="button" class="primary" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="stage">${inner}</div>
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
      var text = '*JSR AGRI TRADES - ${title}*\\n-----------------------------------\\n' + lines.slice(0, 40).join('\\n') + '\\n-----------------------------------\\n*Thank you!* 🙏';
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
