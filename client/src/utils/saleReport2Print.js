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
  return (bags || []).map((n) => (Number.isInteger(Number(n)) ? String(n) : Number(n).toFixed(1))).join(', ');
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
    ${blocks || '<p class="empty">No sales</p>'}
  </div>`;
}

export const SALE_REPORT_2_CSS = `
.sheet {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  align-items: start;
}
.when {
  grid-column: 1 / -1;
  font-size: 14px;
  margin-bottom: 8px;
}
.mat {
  border-left: 1px solid #111;
  padding: 0 8px 12px;
  min-width: 0;
}
.mat:nth-child(5n+2) { border-left: 0; }
.mat .head {
  text-align: center;
  font-size: 13px;
  border-bottom: 1px solid #111;
  margin-bottom: 6px;
  padding-bottom: 2px;
}
.mat .head .te { font-size: 12px; }
.group { margin-bottom: 4px; }
.line {
  font-size: 11px;
  line-height: 1.4;
  margin-bottom: 3px;
  overflow-wrap: break-word;
}
.line .who { font-weight: 400; }
.rate {
  width: 2.4em;
  height: 2.4em;
  margin: 8px auto 10px;
  border: 1.5px solid #b91c1c;
  border-radius: 50%;
  color: #b91c1c;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}
.empty { font-size: 12px; grid-column: 1 / -1; }
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
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body {
  font-family: '${RAMABHADRA}', 'Noto Sans Telugu', sans-serif;
  font-weight: 400;
}
.preview-toolbar {
  position: sticky; top: 0; z-index: 5;
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 8px 12px; background: #f4f4f4; border-bottom: 1px solid #ccc;
}
.preview-toolbar button {
  font: inherit; padding: 6px 12px; cursor: pointer;
  border: 1px solid #333; background: #fff;
}
.preview-toolbar button.primary { background: #111; color: #fff; }
.stage { padding: 10px 12px 16px; }
${SALE_REPORT_2_CSS}
@media print {
  .preview-toolbar { display: none !important; }
  .stage { padding: 0; }
  @page { size: A4 portrait; margin: 8mm; }
}
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
