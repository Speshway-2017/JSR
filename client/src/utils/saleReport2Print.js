import { RAMABHADRA, ramabhadraFontFaceCss } from './pdfFont';
import { openBillPreviewTab } from './raituBillShared';

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
  const blocks = columns
    .map((col) => {
      const title = esc(col.materialName);
      const te = col.materialNameTelugu ? `<div class="te">${esc(col.materialNameTelugu)}</div>` : '';
      const groups = (col.rateGroups || [])
        .map((g) => {
          const lines = (g.entries || [])
            .map((e) => `<div class="line"><span class="who">${esc(e.name)}</span> - ${esc(fmtBags(e.bags))}</div>`)
            .join('');
          return `<div class="group">${lines}<div class="rate">${esc(fmtRate(g.rate))}</div></div>`;
        })
        .join('');
      return `<section class="mat"><div class="head">${title}${te}</div>${groups}</section>`;
    })
    .join('');

  return `<div class="sheet">
    <div class="when">${esc(fmtDate(data?.date))}</div>
    <div class="materials-columns">
      ${blocks || '<p class="empty">No sales</p>'}
    </div>
  </div>`;
}

export const SALE_REPORT_2_CSS = `
.sheet {
  width: 100%;
  max-width: 1060px;
  margin: 0 auto;
  padding: 12px 16px;
  background: #ffffff;
  color: #000000;
  font-family: '${RAMABHADRA}', 'Noto Sans Telugu', system-ui, -apple-system, sans-serif;
  font-weight: 400;
  box-sizing: border-box;
}

.when {
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 12px;
  padding-bottom: 4px;
  border-bottom: 1.5px solid #111111;
}

.materials-columns {
  columns: 5;
  column-gap: 20px;
  column-rule: 1px solid #111111;
  column-fill: auto;
  height: 175mm;
  width: 100%;
}

.mat {
  break-inside: avoid;
  page-break-inside: avoid;
  padding: 0 4px 10px;
  margin-bottom: 14px;
  display: block;
  width: 100%;
  box-sizing: border-box;
}

.mat .head {
  text-align: center;
  font-size: 14px;
  font-weight: 700;
  border-bottom: 1px solid #111111;
  margin-bottom: 8px;
  padding-bottom: 3px;
}

.mat .head .te {
  font-size: 12px;
  font-weight: 400;
}

.group {
  margin-bottom: 8px;
}

.line {
  font-size: 12px;
  line-height: 1.45;
  margin-bottom: 4px;
  overflow-wrap: break-word;
}

.line .who {
  font-weight: 700;
}

.rate {
  width: 2.4em;
  height: 2.4em;
  margin: 6px auto 10px;
  border: 1.5px solid #b91c1c;
  border-radius: 50%;
  color: #b91c1c;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.empty {
  font-size: 13px;
  color: #666666;
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
  }
  .sheet {
    max-width: 100% !important;
    padding: 0 !important;
  }
  .materials-columns {
    height: 175mm;
    columns: 5;
    column-gap: 16px;
    column-rule: 1px solid #111111;
    column-fill: auto;
  }
  .mat {
    break-inside: avoid;
    page-break-inside: avoid;
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
    <button type="button" class="primary" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="stage">${inner}</div>
</body>
</html>`;

  const blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const showIn = (win) => {
    if (!win || win.closed) return false;
    try {
      win.location.href = blobUrl;
      win.focus?.();
      return true;
    } catch {
      return false;
    }
  };
  if (!showIn(previewTab)) {
    const win = window.open(blobUrl, '_blank');
    if (!win) {
      URL.revokeObjectURL(blobUrl);
      throw new Error('Could not open report window — allow popups and try again');
    }
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
}

export { openBillPreviewTab };
