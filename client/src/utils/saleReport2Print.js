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
  const columns = data?.columns || [];
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

  // 5 columns x ~23 lines per column = ~115 lines max per A4 landscape sheet (172mm height)
  const LINES_PER_PAGE = 115;
  const pageChunks = [];
  let currentChunk = [];
  let currentLines = 0;

  for (const col of columns) {
    const vendLineCount = 4 + (col.materials || []).reduce((acc, m) => acc + 2 + (m.entries?.length || 0), 0);

    if (currentChunk.length > 0 && currentLines + vendLineCount > LINES_PER_PAGE) {
      pageChunks.push(currentChunk);
      currentChunk = [];
      currentLines = 0;
    }

    currentChunk.push(col);
    currentLines += vendLineCount;
  }

  if (currentChunk.length > 0) {
    pageChunks.push(currentChunk);
  }

  const totalPages = pageChunks.length;

  return pageChunks
    .map((chunk, pageIdx) => {
      const blocks = chunk
        .map((vend) => {
          const vendTitle = esc(vend.vendorName);
          const vendTe = vend.vendorNameTelugu ? `<div class="te">${esc(vend.vendorNameTelugu)}</div>` : '';

          const matBlocks = (vend.materials || [])
            .map((mat) => {
              const matTitle = esc(mat.materialName);
              const matTe = mat.materialNameTelugu ? `<span class="mat-te"> (${esc(mat.materialNameTelugu)})</span>` : '';

              const lines = (mat.entries || [])
                .slice()
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base', numeric: true }))
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
          const colSummary = `<div class="col-summary">Tot: <strong>${colBags} Bags</strong>${colKg > 0 ? `, <strong>${colKg} kg</strong>` : ''}</div>`;

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
}
`;

export async function openSaleReport2Print(data, previewTab) {
  const fontCss = await ramabhadraFontFaceCss();
  const inner = saleReport2InnerHtml(data);
  const html = `<!DOCTYPE html>
<html lang="te">
<head>
  <meta charset="utf-8" />
  <title>Day wise sale report</title>
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
    <button type="button" id="whatsapp-btn" style="background:#25D366;color:#fff;border-color:#25D366;font-weight:600;" onclick="sendWhatsAppBill()">Send WhatsApp</button>
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
      var text = '*JSR AGRI TRADES - Day Wise Sale Report*\n-----------------------------------\n' + lines.slice(0, 40).join('\n') + '\n-----------------------------------\n*Thank you!* 🙏';
      window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
    }
  </script>
</body>
</html>`;

  return writeToPrintWindow(html, previewTab);
}

export { openBillPreviewTab };
