import {
  TE,
  esc,
  fmtMoney,
  brandHeaderHtml,
  materialTeluguMap,
  itemsTableHtml,
  resolvePartyTeluguName,
  openRaituSheetPdf,
} from './raituBillShared';

/**
 * Customer sale bill — same రైతుపట్టి template as vendor bill,
 * but shows customer (no vendor details / no vendor deductions).
 */
export async function openCustomerSaleBillPdf(sale, previewTab) {
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

  await openRaituSheetPdf((watermarkSrc) => {
    return `
    ${brandHeaderHtml(watermarkSrc, saleDate)}
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
  }, previewTab);
}
