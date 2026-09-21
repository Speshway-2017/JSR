import { openBillPreviewTab, writeToPrintWindow, esc } from './raituBillShared';
import { formatCurrency, formatDate, formatDateOnly } from './format';

function baseReportHtml({ title, subtitle, metaBadge, bodyHtml, whatsappText }) {
  const safeWaText = whatsappText ? esc(whatsappText).replace(/'/g, "\\'") : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body.report-preview {
      margin: 0;
      background: #e2e8f0;
      min-height: 100vh;
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif;
      color: #1e293b;
      -webkit-font-smoothing: antialiased;
    }
    .preview-toolbar {
      position: sticky;
      top: 0;
      z-index: 100;
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      align-items: center;
      padding: 10px 20px;
      background: rgba(248, 250, 252, 0.96);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid #cbd5e1;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .preview-toolbar .doc-name {
      margin-right: auto;
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
    }
    .preview-toolbar button {
      font: inherit;
      cursor: pointer;
      border: 1px solid #047857;
      background: #047857;
      color: #fff;
      border-radius: 8px;
      padding: 7px 15px;
      font-size: 13px;
      font-weight: 600;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .preview-toolbar button:hover {
      background: #065f46;
      border-color: #065f46;
    }
    .preview-toolbar button.secondary {
      background: #ffffff;
      color: #334155;
      border-color: #cbd5e1;
    }
    .preview-toolbar button.secondary:hover {
      background: #f1f5f9;
      border-color: #94a3b8;
    }
    .preview-toolbar button.whatsapp {
      background: #25D366;
      border-color: #25D366;
      color: #fff;
    }
    .preview-toolbar button.whatsapp:hover {
      background: #1eb956;
      border-color: #1eb956;
    }
    .stage {
      padding: 24px 12px;
      display: flex;
      justify-content: center;
    }
    .page {
      background: #ffffff;
      width: 100%;
      max-width: 860px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      border-radius: 8px;
      padding: 32px 36px;
      box-sizing: border-box;
    }
    .company-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #047857;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }
    .company-title {
      font-size: 22px;
      font-weight: 800;
      color: #047857;
      margin: 0;
      letter-spacing: -0.5px;
    }
    .company-subtitle {
      font-size: 13px;
      font-weight: 600;
      color: #334155;
      margin: 4px 0 0 0;
    }
    .meta-badge {
      background: #f0fdf4;
      color: #166534;
      border: 1px solid #bbf7d0;
      border-radius: 6px;
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 600;
      text-align: right;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 10px;
    }
    table.data-table th {
      background: #f8fafc;
      color: #475569;
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      text-align: left;
      padding: 8px 10px;
      border-top: 1px solid #e2e8f0;
      border-bottom: 2px solid #cbd5e1;
    }
    table.data-table th.num { text-align: right; }
    table.data-table td {
      padding: 7px 10px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }
    table.data-table td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    table.data-table tr.total-row td {
      border-top: 2px solid #cbd5e1;
      border-bottom: 2px solid #cbd5e1;
      font-weight: 700;
      background: #f8fafc;
    }
    .page-footer {
      margin-top: 28px;
      text-align: center;
      border-top: 1px dashed #cbd5e1;
      padding-top: 14px;
      font-size: 11px;
      color: #64748b;
    }
    @media print {
      .preview-toolbar { display: none !important; }
      body.report-preview { background: #ffffff !important; }
      .stage { padding: 0 !important; }
      .page {
        box-shadow: none !important;
        border-radius: 0 !important;
        padding: 0 !important;
        max-width: none !important;
        width: 100% !important;
      }
      @page { size: A4 portrait; margin: 10mm; }
    }
  </style>
</head>
<body class="report-preview">
  <div class="preview-toolbar no-print">
    <span class="doc-name">${esc(title)}</span>
    <button type="button" class="secondary" onclick="window.close()">Close</button>
    ${whatsappText ? `<button type="button" id="wa-btn" class="whatsapp" onclick="sendWhatsApp()">Send WhatsApp</button>` : ''}
    <button type="button" onclick="window.print()">Print / Save PDF</button>
  </div>
  <div class="stage">
    <div class="page">
      <div class="company-header">
        <div>
          <h1 class="company-title">JSR AGRI TRADES</h1>
          <p class="company-subtitle">${esc(subtitle)}</p>
        </div>
        ${metaBadge ? `<div class="meta-badge">${metaBadge}</div>` : ''}
      </div>
      ${bodyHtml}
      <div class="page-footer">
        Generated on ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} • JSR Agri Trades
      </div>
    </div>
  </div>
  ${whatsappText ? `
  <script>
    function sendWhatsApp() {
      var text = decodeURIComponent('${encodeURIComponent(whatsappText)}');
      window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
    }
  </script>` : ''}
</body>
</html>`;
}

/**
 * Open Ledger Report in Bill-Print-style Preview Tab
 */
export function openLedgerPreview(data, partyPhone = '') {
  if (!data) return;
  const previewTab = openBillPreviewTab();
  if (!previewTab) return;

  const isVendor = data.partyType === 'vendor';
  const partyName = data.customer?.name || (isVendor ? 'Vendor' : 'Customer');
  const startDateStr = formatDateOnly(data.startDate);
  const endDateStr = formatDateOnly(data.endDate);

  const rowsHtml = (data.rows || []).length === 0
    ? `<tr><td colspan="6" style="padding:18px; text-align:center; color:#94a3b8; font-size:13px;">No transactions in this date range</td></tr>`
    : (data.rows || []).map((row) => `
        <tr>
          <td style="white-space: nowrap; color: #475569;">${formatDateOnly(row.date)}</td>
          <td style="font-weight: 500;">${esc(row.particulars || '—')}</td>
          <td class="num" style="font-weight: 600;">${row.sale ? formatCurrency(row.sale) : '—'}</td>
          <td class="num" style="color: #047857;">${row.paid ? formatCurrency(row.paid) : '—'}</td>
          <td class="num" style="color: #64748b;">${row.less ? formatCurrency(row.less) : '—'}</td>
          <td class="num" style="font-weight: 700; color: #0f172a;">${formatCurrency(row.balance)}</td>
        </tr>
      `).join('');

  const bodyHtml = `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h2 style="font-size: 17px; font-weight: 700; color: #0f172a; margin: 0;">${esc(partyName)}</h2>
        <p style="font-size: 12px; color: #64748b; margin: 3px 0 0 0;">${partyPhone ? `Mobile: ${esc(partyPhone)}` : (isVendor ? 'Vendor Account' : 'Customer Account')}</p>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b;">Account Type</span>
        <div style="font-size: 13px; font-weight: 700; color: #047857; text-transform: capitalize;">${esc(data.partyType)}</div>
      </div>
    </div>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 9px 14px; display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 12px; color: #166534;">
      <span>Opening Balance</span>
      <span style="font-family: monospace;">${formatCurrency(data.openingBalance)}</span>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Particulars</th>
          <th class="num">Sale (₹)</th>
          <th class="num">Paid (₹)</th>
          <th class="num">Less (₹)</th>
          <th class="num">Balance (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="2">Total</td>
          <td class="num">${formatCurrency(data.totals?.sale)}</td>
          <td class="num">${formatCurrency(data.totals?.paid)}</td>
          <td class="num">${formatCurrency(data.totals?.less)}</td>
          <td class="num"></td>
        </tr>
      </tfoot>
    </table>

    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; margin-top: 14px; color: #991b1b;">
      <span>Closing Balance</span>
      <span style="font-family: monospace;">${formatCurrency(data.closingBalance)}</span>
    </div>
  `;

  const waText = `*JSR AGRI TRADES - ${partyName} Ledger Statement*\nPeriod: ${startDateStr} — ${endDateStr}\nOpening Balance: ${formatCurrency(data.openingBalance)}\nTotal Sales: ${formatCurrency(data.totals?.sale)}\nTotal Paid: ${formatCurrency(data.totals?.paid)}\nClosing Balance: ${formatCurrency(data.closingBalance)}\nThank you! 🙏`;

  const html = baseReportHtml({
    title: `${partyName} - Ledger Statement`,
    subtitle: `${isVendor ? 'Vendor' : 'Customer'} Ledger Statement`,
    metaBadge: `Period: ${startDateStr} — ${endDateStr}`,
    bodyHtml,
    whatsappText: waText,
  });

  return writeToPrintWindow(html, previewTab);
}

/**
 * Open Outstanding Report in Bill-Print-style Preview Tab
 */
export function openOutstandingPreview(data, groupedSchedules, selectedDate, scheduleFilterName = '') {
  if (!data) return;
  const previewTab = openBillPreviewTab();
  if (!previewTab) return;

  const dateStr = formatDateOnly(selectedDate || data.date);

  let groupsHtml = '';
  if (!groupedSchedules || groupedSchedules.length === 0) {
    groupsHtml = `<p style="padding: 24px; text-align: center; color: #94a3b8; font-size: 13px;">No outstanding customer balances found.</p>`;
  } else {
    groupsHtml = groupedSchedules.map((group) => {
      const rows = (group.rows || []).map((r) => `
        <tr>
          <td style="font-weight: 500;">${esc(r.name)}</td>
          <td class="num" style="font-weight: 700; color: #1e293b;">${formatCurrency(r.closing)}</td>
        </tr>
      `).join('');

      return `
        <div style="margin-top: 16px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;">
          <div style="background: #f1f5f9; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #cbd5e1;">
            <span style="font-weight: 700; font-size: 13px; color: #0f172a;">${esc(group.scheduleName)} (${group.rows.length})</span>
            <span style="font-size: 12px; font-weight: 700; color: #047857;">Subtotal: ${formatCurrency(group.totalClosing)}</span>
          </div>
          <table class="data-table" style="margin: 0;">
            <thead>
              <tr>
                <th>Customer Name</th>
                <th class="num">Closing Balance</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>
        </div>
      `;
    }).join('');
  }

  const bodyHtml = `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 18px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <p style="font-size: 12px; text-transform: uppercase; font-weight: 700; color: #64748b; margin: 0;">Total Outstanding Customers</p>
        <p style="font-size: 16px; font-weight: 700; color: #0f172a; margin: 2px 0 0 0;">
          ${data.rows?.length || 0} customers ${scheduleFilterName ? `· Schedule: ${esc(scheduleFilterName)}` : (groupedSchedules?.length ? `· across ${groupedSchedules.length} schedules` : '')}
        </p>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b;">Total Amount Due</span>
        <div style="font-size: 20px; font-weight: 800; color: #991b1b; font-family: monospace;">${formatCurrency(data.totals?.closing)}</div>
      </div>
    </div>

    ${groupsHtml}

    <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 12px 16px; display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; margin-top: 18px; color: #991b1b;">
      <span>Grand Total Outstanding</span>
      <span style="font-family: monospace;">${formatCurrency(data.totals?.closing)}</span>
    </div>
  `;

  const waText = `*JSR AGRI TRADES - Outstanding Summary*\nAs of: ${dateStr}\nTotal Customers: ${data.rows?.length || 0}\nTotal Outstanding: ${formatCurrency(data.totals?.closing)}\nThank you! 🙏`;

  const html = baseReportHtml({
    title: `Outstanding Report - ${dateStr}`,
    subtitle: 'Customer Outstanding Balance Report',
    metaBadge: `As of: ${dateStr}`,
    bodyHtml,
    whatsappText: waText,
  });

  return writeToPrintWindow(html, previewTab);
}

/**
 * Open Sales Checklist in Bill-Print-style Preview Tab
 */
export function openSalesChecklistPreview({ rows, totals, startDate, endDate, filterCustomer, filterItem, filterRate }) {
  if (!rows) return;
  const previewTab = openBillPreviewTab();
  if (!previewTab) return;

  const startStr = formatDateOnly(startDate);
  const endStr = formatDateOnly(endDate);

  const filterBadges = [];
  if (filterCustomer) filterBadges.push(`Customer: <b>${esc(filterCustomer)}</b>`);
  if (filterItem) filterBadges.push(`Item: <b>${esc(filterItem)}</b>`);
  if (filterRate) filterBadges.push(`Rate: <b>₹${esc(filterRate)}</b>`);

  const filterHtml = filterBadges.length > 0
    ? `<div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 7px 12px; margin-bottom: 12px; font-size: 12px; color: #475569; display: flex; flex-wrap: wrap; gap: 14px;">
        <span style="font-weight: 700; color: #047857;">Filters:</span>
        ${filterBadges.map((b) => `<span>${b}</span>`).join('')}
      </div>`
    : '';

  const totalBags = totals?.totalBags ?? totals?.bags ?? 0;
  const totalWeight = Number(totals?.totalWeight ?? totals?.weight ?? 0).toFixed(1);
  const totalAmount = totals?.totalAmount ?? totals?.amount ?? 0;

  const tableRows = rows.length === 0
    ? `<tr><td colspan="7" style="padding: 18px; text-align: center; color: #94a3b8; font-size: 13px;">No sales found matching criteria</td></tr>`
    : rows.map((r) => {
        const dateStr = formatDate(r.date || r.createdAt);
        const cust = esc(r.customerName || r.customer || '—');
        const item = esc(r.materialName || r.item || '—');
        const bags = r.bagCount ?? r.bags ?? '—';
        const rate = r.ratePerKg ?? r.rate;
        const rawWeight = r.totalWeight ?? r.weight;
        const isWeightValid = r.saleType === 'by_weight' || (!r.saleType && rawWeight && Number(rawWeight) > 0);
        const weightText = isWeightValid ? `${Number(rawWeight).toFixed(1)} kg` : '—';
        const amount = r.totalAmount ?? r.amount ?? 0;

        return `
          <tr>
            <td style="white-space: nowrap; color: #475569;">${dateStr}</td>
            <td style="font-weight: 600; color: #0f172a;">${cust}</td>
            <td style="font-weight: 500;">${item}</td>
            <td class="num">${bags}</td>
            <td class="num" style="font-weight: 600;">${rate != null && rate !== '' ? `₹${rate}` : '—'}</td>
            <td class="num">${weightText}</td>
            <td class="num" style="font-weight: 700; color: #0f172a;">${formatCurrency(amount)}</td>
          </tr>
        `;
      }).join('');

  const bodyHtml = `
    ${filterHtml}
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px;">
        <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b;">Total Bags</span>
        <div style="font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 2px;">${totalBags}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px;">
        <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b;">Total Weight</span>
        <div style="font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 2px;">${totalWeight} kg</div>
      </div>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px;">
        <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #166534;">Total Amount</span>
        <div style="font-size: 18px; font-weight: 800; color: #166534; font-family: monospace; margin-top: 2px;">${formatCurrency(totalAmount)}</div>
      </div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Date & Time</th>
          <th>Customer Name</th>
          <th>Item</th>
          <th class="num">Bags</th>
          <th class="num">Rate</th>
          <th class="num">Weight</th>
          <th class="num">Total Price</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="3">Total (${rows.length} sales)</td>
          <td class="num">${totalBags}</td>
          <td class="num"></td>
          <td class="num">${totalWeight} kg</td>
          <td class="num">${formatCurrency(totalAmount)}</td>
        </tr>
      </tfoot>
    </table>
  `;

  const waText = `*JSR AGRI TRADES - Sales Checklist*\nPeriod: ${startStr} — ${endStr}\nTotal Bags: ${totalBags}\nTotal Weight: ${totalWeight} kg\nTotal Amount: ${formatCurrency(totalAmount)}\nThank you! 🙏`;

  const html = baseReportHtml({
    title: `Sales Checklist (${startStr} - ${endStr})`,
    subtitle: 'Sales Checklist Report',
    metaBadge: `Period: ${startStr} — ${endStr}`,
    bodyHtml,
    whatsappText: waText,
  });

  return writeToPrintWindow(html, previewTab);
}

/**
 * Open Single Purchase Bill in Bill-Print-style Preview Tab
 */
export function openPurchaseBillPreview(purchase) {
  if (!purchase) return;
  const previewTab = openBillPreviewTab();
  if (!previewTab) return;

  const vendor = purchase.vendor && typeof purchase.vendor === 'object' ? purchase.vendor : {};
  const vendorName = vendor.name || purchase.vendorName || 'Vendor';
  const vendorTe = vendor.nameTelugu || purchase.vendorNameTelugu || '';
  const vendorMobile = vendor.mobile || purchase.mobile || '';
  const vendorCity = vendor.city || purchase.city || '';
  const dateStr = formatDate(purchase.purchaseDate || purchase.createdAt);
  const totalAmount = Number(purchase.totalAmount || 0);
  const totalBags = Number(purchase.totalBags || 0);
  const totalWeight = Number(purchase.totalWeight || 0);

  const linesHtml = (purchase.lines || []).length === 0
    ? `<tr><td colspan="7" style="padding:18px; text-align:center; color:#94a3b8; font-size:13px;">No items in this purchase</td></tr>`
    : (purchase.lines || []).map((line, idx) => {
        const item = esc(line.materialName || '—');
        const typeLabel = line.purchaseType === 'by_bag' ? 'By Bag' : line.purchaseType === 'by_box' ? 'By Box' : 'By Weight';
        const bags = line.purchaseType === 'by_box' ? (line.boxes || line.bags || '—') : (line.bags != null && line.bags !== 0 ? line.bags : '—');
        const weight = line.purchaseType === 'by_bag' ? '—' : `${Number(line.totalKg || 0).toFixed(1)} kg`;
        const rateLabel = line.purchaseType === 'by_bag' ? `₹${line.ratePerKg}/bag` : `₹${line.ratePerKg}/kg`;
        const amount = Number(line.amount || 0);

        return `
          <tr>
            <td style="color: #64748b; font-size: 11px;">${idx + 1}</td>
            <td style="font-weight: 600; color: #0f172a;">${item}</td>
            <td style="color: #64748b; font-size: 11px;">${typeLabel}</td>
            <td class="num">${bags}</td>
            <td class="num">${weight}</td>
            <td class="num" style="font-weight: 600;">${rateLabel}</td>
            <td class="num" style="font-weight: 700; color: #0f172a;">${formatCurrency(amount)}</td>
          </tr>
        `;
      }).join('');

  const bodyHtml = `
    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
      <div>
        <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b;">Vendor Details / రైతు వివరాలు</span>
        <h2 style="font-size: 18px; font-weight: 800; color: #0f172a; margin: 2px 0 0 0;">
          ${esc(vendorName)} ${vendorTe ? `<span style="font-size: 14px; font-weight: 500; color: #64748b;">(${esc(vendorTe)})</span>` : ''}
        </h2>
        <p style="font-size: 12px; color: #475569; margin: 4px 0 0 0;">
          ${[vendorMobile ? `Mobile: ${esc(vendorMobile)}` : '', vendorCity ? `City: ${esc(vendorCity)}` : ''].filter(Boolean).join(' • ') || 'Vendor Account'}
        </p>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b;">Purchase Date & Time</span>
        <div style="font-size: 14px; font-weight: 700; color: #0f172a; margin-top: 2px;">${dateStr}</div>
        ${purchase._id ? `<div style="font-size: 11px; color: #94a3b8; font-family: monospace; margin-top: 3px;">Bill #${String(purchase._id).slice(-8)}</div>` : ''}
      </div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 28px;">#</th>
          <th>Item / సరుకు</th>
          <th>Type</th>
          <th class="num">Bags / Boxes</th>
          <th class="num">Weight</th>
          <th class="num">Rate</th>
          <th class="num">Total (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${linesHtml}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="3">Total (${(purchase.lines || []).length} items)</td>
          <td class="num">${totalBags}</td>
          <td class="num">${totalWeight.toFixed(1)} kg</td>
          <td class="num"></td>
          <td class="num" style="color: #047857;">${formatCurrency(totalAmount)}</td>
        </tr>
      </tfoot>
    </table>

    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px;">
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px;">
        <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b;">Total Bags</span>
        <div style="font-size: 17px; font-weight: 800; color: #0f172a; margin-top: 2px;">${totalBags}</div>
      </div>
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px;">
        <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #64748b;">Total Weight</span>
        <div style="font-size: 17px; font-weight: 800; color: #0f172a; margin-top: 2px;">${totalWeight.toFixed(1)} kg</div>
      </div>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px;">
        <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: #166534;">Payable to Vendor</span>
        <div style="font-size: 18px; font-weight: 800; color: #047857; font-family: monospace; margin-top: 2px;">${formatCurrency(totalAmount)}</div>
      </div>
    </div>

    ${purchase.notes ? `
      <div style="background: #fffbeb; border: 1px solid #fef3c7; border-radius: 6px; padding: 8px 12px; margin-top: 14px; font-size: 12px; color: #92400e;">
        <b>Notes:</b> ${esc(purchase.notes)}
      </div>
    ` : ''}

    ${vendor.creditBalance != null ? `
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; margin-top: 14px; color: #334155;">
        <span>Current Vendor Balance (చెల్లించవలసినది)</span>
        <span style="font-family: monospace;">${formatCurrency(vendor.creditBalance)}</span>
      </div>
    ` : ''}
  `;

  const waText = `*JSR AGRI TRADES - Purchase Bill*\nVendor: ${vendorName}\nDate: ${dateStr}\nTotal Bags: ${totalBags}\nTotal Weight: ${totalWeight.toFixed(1)} kg\n*Total Payable: ${formatCurrency(totalAmount)}*\nThank you! 🙏`;

  const html = baseReportHtml({
    title: `${vendorName} - Purchase Bill`,
    subtitle: 'Vendor Purchase Bill / కొనుగోలు రసీదు',
    metaBadge: `Date: ${dateStr}`,
    bodyHtml,
    whatsappText: waText,
  });

  return writeToPrintWindow(html, previewTab);
}
