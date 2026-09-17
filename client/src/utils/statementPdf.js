import { formatCurrency, formatDateOnly } from './format';

/**
 * Generate a beautifully formatted HTML Account Statement document for Customers or Vendors
 */
export function generateAccountStatementHtml({
  partyName,
  partyPhone,
  partyType = 'Customer', // 'Customer' | 'Vendor'
  balanceLabel = 'Credit Balance',
  balanceAmount = 0,
  asOfDate = new Date().toISOString().slice(0, 10),
  sales = [],
  transactions = [],
  loads = [],
}) {
  const isCustomer = partyType === 'Customer';
  const balanceColor = balanceAmount > 0 ? '#b91c1c' : '#15803d'; // Red if money owed, Green if settled

  // Combine sales and transactions chronologically
  const items = [];

  if (isCustomer) {
    sales.forEach((s) => {
      items.push({
        date: s.createdAt || s.date,
        type: 'Sale Bill',
        description: `Sale #${s._id?.slice(-6) || ''} (${s.lines?.length || 0} items)`,
        debit: s.totalAmount || 0,
        credit: 0,
      });
    });

    transactions
      .filter((t) => t.type === 'customer_payment')
      .forEach((t) => {
        items.push({
          date: t.createdAt || t.date,
          type: 'Payment Received',
          description: t.description || 'Customer Payment',
          debit: 0,
          credit: t.amount || 0,
        });
      });
  } else {
    // Vendor
    loads.forEach((l) => {
      items.push({
        date: l.loadDate || l.createdAt,
        type: 'Paddy Load',
        description: `Load (${l.vehicleNumber || 'Paddy Entry'})`,
        debit: 0,
        credit: 0, // Load details
      });
    });

    transactions
      .filter((t) => t.type === 'vendor_payment')
      .forEach((t) => {
        items.push({
          date: t.createdAt || t.date,
          type: 'Payment Made',
          description: t.description || 'Vendor Payment',
          debit: t.amount || 0,
          credit: 0,
        });
      });
  }

  // Sort items by date descending
  items.sort((a, b) => new Date(b.date) - new Date(a.date));

  const rowsHtml = items.length === 0
    ? `<tr><td colspan="4" style="padding:15px; text-align:center; color:#9ca3af; font-size:13px;">No transaction history found</td></tr>`
    : items.map((item) => `
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 10px 12px; font-size: 13px; color: #374151;">${formatDateOnly(item.date)}</td>
          <td style="padding: 10px 12px; font-size: 13px; font-weight: 500; color: #111827;">${item.type}<br/><span style="font-weight:400; font-size:11px; color:#6b7280;">${item.description}</span></td>
          <td style="padding: 10px 12px; font-size: 13px; text-align: right; color: #047857; font-family: monospace;">${item.debit ? formatCurrency(item.debit) : '—'}</td>
          <td style="padding: 10px 12px; font-size: 13px; text-align: right; color: #2563eb; font-family: monospace;">${item.credit ? formatCurrency(item.credit) : '—'}</td>
        </tr>
      `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #ffffff; margin: 0; padding: 20px; color: #1f2937; }
    .container { max-width: 750px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #047857; padding-bottom: 16px; margin-bottom: 20px; }
    .title { font-size: 24px; font-weight: 800; color: #047857; margin: 0; letter-spacing: -0.5px; }
    .subtitle { font-size: 13px; color: #4b5563; margin-top: 4px; }
    .meta { text-align: right; font-size: 12px; color: #6b7280; }
    .party-card { background: #f9fafb; border: 1px solid #f3f4f6; border-radius: 10px; padding: 16px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
    .party-name { font-size: 18px; font-weight: 700; color: #111827; margin: 0; }
    .party-phone { font-size: 13px; color: #4b5563; margin-top: 2px; }
    .balance-box { text-align: right; }
    .balance-label { font-size: 11px; text-transform: uppercase; font-weight: 700; color: #6b7280; letter-spacing: 0.5px; }
    .balance-val { font-size: 22px; font-weight: 800; color: ${balanceColor}; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #f0fdf4; color: #166534; font-size: 12px; text-transform: uppercase; font-weight: 700; text-align: left; padding: 10px 12px; border-bottom: 2px solid #bbf7d0; }
    th.text-right { text-align: right; }
    .footer { margin-top: 30px; text-align: center; border-top: 1px dashed #e5e7eb; padding-top: 16px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1 class="title">JSR AGRI TRADES</h1>
        <p class="subtitle">Account Statement & Ledger Summary</p>
      </div>
      <div class="meta">
        <p style="margin:0; font-weight:600;">Date: ${formatDateOnly(asOfDate)}</p>
        <p style="margin:3px 0 0 0;">Type: ${partyType} Ledger</p>
      </div>
    </div>

    <div class="party-card">
      <div>
        <h2 class="party-name">${partyName || partyType}</h2>
        <p class="party-phone">📱 Mobile: ${partyPhone || 'N/A'}</p>
      </div>
      <div class="balance-box">
        <div class="balance-label">${balanceLabel}</div>
        <div class="balance-val">${formatCurrency(balanceAmount)}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Details</th>
          <th class="text-right">${isCustomer ? 'Sale (₹)' : 'Paid (₹)'}</th>
          <th class="text-right">${isCustomer ? 'Paid (₹)' : 'Bill (₹)'}</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="footer">
      Thank you for doing business with JSR AGRI TRADES! 🙏<br/>
      For queries, contact: +91 89774 81054
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate HTML string for Ledger page report data (opening balance, date range, table rows, totals, closing balance)
 */
export function generateLedgerReportHtml({ data, partyPhone }) {
  if (!data) return '';
  const isVendor = data.partyType === 'vendor';
  const partyName = data.customer?.name || (isVendor ? 'Vendor' : 'Customer');
  const startDateStr = formatDateOnly(data.startDate);
  const endDateStr = formatDateOnly(data.endDate);

  const rowsHtml = (data.rows || []).length === 0
    ? `<tr><td colspan="6" style="padding:15px; text-align:center; color:#9ca3af; font-size:13px;">No transactions in this range</td></tr>`
    : (data.rows || []).map((row) => `
        <tr style="border-bottom: 1px solid #f3f4f6;">
          <td style="padding: 9px 12px; font-size: 12px; color: #374151; white-space: nowrap;">${formatDateOnly(row.date)}</td>
          <td style="padding: 9px 12px; font-size: 12px; color: #111827;">${row.particulars || '—'}</td>
          <td style="padding: 9px 12px; font-size: 12px; text-align: right; font-weight: 600; color: #1f2937; font-family: monospace;">${row.sale ? formatCurrency(row.sale) : '—'}</td>
          <td style="padding: 9px 12px; font-size: 12px; text-align: right; color: #047857; font-family: monospace;">${row.paid ? formatCurrency(row.paid) : '—'}</td>
          <td style="padding: 9px 12px; font-size: 12px; text-align: right; color: #6b7280; font-family: monospace;">${row.less ? formatCurrency(row.less) : '—'}</td>
          <td style="padding: 9px 12px; font-size: 12px; text-align: right; font-weight: 600; color: #111827; font-family: monospace;">${formatCurrency(row.balance)}</td>
        </tr>
      `).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #ffffff; margin: 0; padding: 20px; color: #1f2937; }
    .container { max-width: 800px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #047857; padding-bottom: 14px; margin-bottom: 16px; }
    .title { font-size: 24px; font-weight: 800; color: #047857; margin: 0; letter-spacing: -0.5px; }
    .subtitle { font-size: 13px; color: #4b5563; margin-top: 3px; }
    .meta { text-align: right; font-size: 12px; color: #6b7280; }
    .party-card { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 18px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
    .party-name { font-size: 18px; font-weight: 700; color: #111827; margin: 0; }
    .party-phone { font-size: 13px; color: #4b5563; margin-top: 2px; }
    .period-badge { background: #ecfdf5; color: #047857; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; border: 1px solid #a7f3d0; }
    .balance-bar { background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 12px; color: #166534; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { background: #f8fafc; color: #475569; font-size: 11px; text-transform: uppercase; font-weight: 700; text-align: left; padding: 9px 12px; border-bottom: 2px solid #e2e8f0; }
    th.text-right { text-align: right; }
    .footer-bar { background: #fdf2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; margin-top: 12px; color: #991b1b; }
    .footer { margin-top: 24px; text-align: center; border-top: 1px dashed #e5e7eb; padding-top: 14px; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <h1 class="title">JSR AGRI TRADES</h1>
        <p class="subtitle">${isVendor ? 'Vendor' : 'Customer'} Ledger Statement</p>
      </div>
      <div class="meta">
        <span class="period-badge">Period: ${startDateStr} — ${endDateStr}</span>
      </div>
    </div>

    <div class="party-card">
      <div>
        <h2 class="party-name">${partyName}</h2>
        <p class="party-phone">📱 Mobile: ${partyPhone || 'N/A'}</p>
      </div>
      <div style="text-align: right;">
        <span style="font-size: 11px; color: #6b7280; text-transform: uppercase; font-weight: 700;">Party Type</span>
        <div style="font-size: 14px; font-weight: 700; color: #047857; text-transform: capitalize;">${data.partyType}</div>
      </div>
    </div>

    <div class="balance-bar">
      <span>Opening Balance</span>
      <span style="font-family: monospace;">${formatCurrency(data.openingBalance)}</span>
    </div>

    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Particulars</th>
          <th class="text-right">Sale (₹)</th>
          <th class="text-right">Paid (₹)</th>
          <th class="text-right">Less (₹)</th>
          <th class="text-right">Balance (₹)</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
      <tfoot>
        <tr style="background: #f8fafc; font-weight: 700; border-top: 2px solid #e2e8f0;">
          <td colspan="2" style="padding: 10px 12px; font-size: 12px;">Total</td>
          <td style="padding: 10px 12px; font-size: 12px; text-align: right; font-family: monospace;">${formatCurrency(data.totals?.sale)}</td>
          <td style="padding: 10px 12px; font-size: 12px; text-align: right; font-family: monospace;">${formatCurrency(data.totals?.paid)}</td>
          <td style="padding: 10px 12px; font-size: 12px; text-align: right; font-family: monospace;">${formatCurrency(data.totals?.less)}</td>
          <td style="padding: 10px 12px; font-size: 12px;"></td>
        </tr>
      </tfoot>
    </table>

    <div class="footer-bar">
      <span>Closing Balance</span>
      <span style="font-family: monospace;">${formatCurrency(data.closingBalance)}</span>
    </div>

    <div class="footer">
      Thank you for doing business with JSR AGRI TRADES! 🙏<br/>
      For queries, contact: +91 89774 81054
    </div>
  </div>
</body>
</html>`;
}
