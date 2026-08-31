import { RAMABHADRA, ramabhadraFontFaceCss } from './pdfFont';
import { displayMaterialName, materialTeluguMap, openBillPreviewTab } from './raituBillShared';

const JAMA = 'జమ';

function fmtDate(d) {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getDate()}/${x.getMonth() + 1}`;
}

function fmtMoney(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-IN');
}

function fmtKg(n) {
  const v = Number(n) || 0;
  if (!v) return '';
  return Number.isInteger(v) ? String(v) : v.toFixed(1).replace(/\.0$/, '');
}

function layoutFor(perPage) {
  const n = perPage === 2 ? 2 : perPage === 4 ? 4 : 6;
  return { n, cols: 2, rows: n / 2 };
}

function buildBillModel(st, teluguMap) {
  const rows = [];
  const opening = Number(st.opening) || 0;
  if (opening) {
    rows.push({ kind: 'opening', date: '', item: 'Opening', bags: '', kg: '', amount: fmtMoney(opening) });
  }
  for (const s of st.sales || []) {
    rows.push({
      kind: 'sale',
      date: fmtDate(s.date),
      item: displayMaterialName(s.material, teluguMap) || s.material || '',
      bags: s.bags ? String(s.bags) : '',
      kg: fmtKg(s.weight),
      amount: fmtMoney(s.amount),
    });
  }
  if ((st.sales || []).length) {
    rows.push({ kind: 'total', item: 'Total', amount: fmtMoney(st.totalSale) });
  }
  for (const p of st.payments || []) {
    rows.push({
      kind: 'jama',
      date: fmtDate(p.date),
      item: JAMA,
      bags: '',
      kg: '',
      amount: fmtMoney(p.amount),
    });
  }
  if ((st.payments || []).length) {
    rows.push({ kind: 'total', item: 'Total paid', amount: fmtMoney(st.totalPaid) });
  }
  rows.push({ kind: 'closing', item: 'Closing', amount: fmtMoney(st.closing) });
  return {
    name: st.name || '',
    nameTelugu: st.nameTelugu && st.nameTelugu !== st.name ? st.nameTelugu : '',
    rows,
  };
}

/**
 * Print customer range statements N-up (2 / 4 / 6).
 * Black type only. Overflow continues in the next part; the next customer starts a new part.
 */
export async function openRangeBillsNUp(statements, perPage = 6, previewTab) {
  const { n, cols, rows } = layoutFor(perPage);
  const teluguMap = await materialTeluguMap();
  const bills = (statements || []).map((st) => buildBillModel(st, teluguMap));
  const fontCss = await ramabhadraFontFaceCss();
  const payload = JSON.stringify(bills).replace(/</g, '\\u003c');

  const html = `<!DOCTYPE html>
<html lang="te">
<head>
  <meta charset="utf-8" />
  <title>Bill Print</title>
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
  border: 1px solid #333; background: #fff; color: #000;
}
.preview-toolbar button.primary { background: #111; color: #fff; }
.stage { padding: 8px; }
.page {
  width: 198mm;
  height: 285mm;
  display: grid;
  grid-template-columns: repeat(${cols}, 1fr);
  grid-template-rows: repeat(${rows}, 1fr);
  page-break-after: always;
  break-after: page;
  background: #fff;
  border-top: 1px solid #000;
  border-left: 1px solid #000;
}
.page:last-child { page-break-after: auto; break-after: auto; }
.cell {
  border-right: 1px solid #000;
  border-bottom: 1px solid #000;
  overflow: hidden;
  padding: 4px 6px 5px;
  min-width: 0;
  min-height: 0;
}
.party {
  font-size: 13px;
  text-align: center;
  border-bottom: 1px solid #000;
  padding: 0 0 2px;
  margin: 0 0 3px;
  line-height: 1.25;
}
.party .te { display: block; font-size: 12px; }
.cont {
  font-size: 10px;
  text-align: center;
  font-style: italic;
  margin: 0 0 3px;
}
table.lines {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  line-height: 1.3;
}
table.lines td {
  padding: 0 2px 1px;
  vertical-align: top;
}
table.lines td.date { width: 1%; white-space: nowrap; }
table.lines td.item { width: 100%; }
table.lines td.num { width: 1%; white-space: nowrap; text-align: right; padding-left: 6px; }
table.lines tr.rule td { border-top: 1px solid #000; padding-top: 2px; }
.measure { position: absolute; left: -9999px; top: 0; visibility: hidden; }
@media print {
  .preview-toolbar { display: none !important; }
  .stage { padding: 0; }
  @page { size: A4 portrait; margin: 6mm; }
}
  </style>
</head>
<body>
  <div class="preview-toolbar">
    <button type="button" onclick="window.close()">Close</button>
    <button type="button" style="background:#25D366;color:#fff;border-color:#25D366;font-weight:600;" onclick="sendWhatsAppBill()">Send WhatsApp</button>
    <button type="button" class="primary" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="stage" id="stage"></div>
  <div class="measure" id="measure"></div>
  <script>
    function sendWhatsAppBill() {
      var stage = document.getElementById('stage');
      var bodyText = stage ? stage.innerText : document.body.innerText;
      var lines = bodyText.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
      var text = '*JSR AGRI TRADES - Customer Bills*\n-----------------------------------\n' + lines.slice(0, 40).join('\n') + '\n-----------------------------------\n*Thank you!* 🙏';
      window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
    }

    const BILLS = ${payload};
    const PER = ${n};

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function rowHtml(r) {
      var cls = (r.kind === 'total' || r.kind === 'closing' || r.kind === 'opening') ? ' class="rule"' : '';
      return '<tr' + cls + '><td class="date">' + esc(r.date) + '</td><td class="item">' + esc(r.item) +
        '</td><td class="num">' + esc(r.bags) +
        '</td><td class="num">' + esc(r.amount) + '</td></tr>';
    }

    function headerHtml(bill, continued) {
      var h = '<div class="party">' + esc(bill.name);
      if (bill.nameTelugu) h += '<span class="te">' + esc(bill.nameTelugu) + '</span>';
      h += '</div>';
      if (continued) h += '<div class="cont">continue</div>';
      return h;
    }

    function tableWrap(inner) {
      return '<table class="lines"><tbody>' + inner + '</tbody></table>';
    }

    function cellHtml(inner) {
      return '<div class="cell">' + inner + '</div>';
    }

    function measureBox() {
      var page = document.createElement('div');
      page.className = 'page';
      page.style.position = 'absolute';
      page.style.left = '-9999px';
      var probe = document.createElement('div');
      probe.className = 'cell';
      page.appendChild(probe);
      document.body.appendChild(page);
      var size = { w: probe.clientWidth, h: probe.clientHeight };
      page.remove();
      return size;
    }

    function fits(html, w, h) {
      var m = document.getElementById('measure');
      m.style.width = w + 'px';
      m.innerHTML = '<div class="cell" style="height:auto;overflow:visible;border:0">' + html + '</div>';
      return m.firstElementChild.scrollHeight <= h - 1;
    }

    function fragmentsFor(bill, w, h) {
      var frags = [];
      var i = 0;
      var continued = false;
      do {
        var head = headerHtml(bill, continued);
        var taken = [];
        while (i < bill.rows.length) {
          taken.push(bill.rows[i]);
          if (!fits(head + tableWrap(taken.map(rowHtml).join('')), w, h)) {
            taken.pop();
            break;
          }
          i += 1;
        }
        if (!taken.length && i < bill.rows.length) {
          taken.push(bill.rows[i]);
          i += 1;
        }
        frags.push(head + tableWrap(taken.map(rowHtml).join('')));
        continued = true;
      } while (i < bill.rows.length);
      return frags;
    }

    function render() {
      var size = measureBox();
      if (!size.w || size.w < 50) size.w = 360;
      if (!size.h || size.h < 50) size.h = Math.max(200, Math.floor(960 / PER));
      var parts = [];
      BILLS.forEach(function (bill) {
        var frags = fragmentsFor(bill, size.w, size.h);
        frags.forEach(function (html) { parts.push(html); });
      });
      var stage = document.getElementById('stage');
      if (!stage) return;
      stage.innerHTML = '';
      var count = Math.max(parts.length, 1);
      for (var p = 0; p < count; p += PER) {
        var page = document.createElement('section');
        page.className = 'page';
        for (var c = 0; c < PER; c++) {
          page.insertAdjacentHTML('beforeend', cellHtml(parts[p + c] || ''));
        }
        stage.appendChild(page);
      }
    }

    render();
    setTimeout(render, 10);
    setTimeout(render, 150);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(render);
    }
    window.addEventListener('load', render);
    window.addEventListener('resize', function () {
      setTimeout(render, 50);
    });
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

export { openBillPreviewTab };
