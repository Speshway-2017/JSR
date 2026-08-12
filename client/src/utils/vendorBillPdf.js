import {
  TE,
  esc,
  fmtMoney,
  brandHeaderHtml,
  materialTeluguMap,
  vendorMaterialsHtml,
  resolvePartyTeluguName,
  openRaituSheetPdf,
} from './raituBillShared';

function collectRateLines(bill) {
  if (bill.rateLines?.length) return bill.rateLines;
  const lines = [];
  for (const mat of bill.materials || []) {
    for (const line of mat.lines || []) {
      lines.push({
        materialName: mat.materialName,
        totalKg: line.totalKg,
        ratePerKg: line.ratePerKg,
        totalAmount: line.totalAmount,
        bagCount: line.bagCount,
        bags: line.bags || [],
      });
    }
  }
  return lines;
}

function buildVendorInner(bill, teluguMap, partyName) {
  return (watermarkSrc) => {
    const load = bill.load || {};
    const summary = bill.summary || {};
    const d = summary.deductions || {};
    const loadDate = load.loadDate || load.createdAt || bill.date;
    const rateLines = collectRateLines(bill);
    const dedTotal = Number(d.total || 0);
    const gross = Number(summary.grossTotal || 0);
    const receivable = Number(summary.receivable || 0);

    const deductionRows = [
      [TE.kirayi || '\u0c15\u0c3f\u0c30\u0c3e\u0c2f\u0c3f', d.kirayi],
      ['\u0c30\u0c3f\u0c15\u0c4d\u0c37\u0c3e', d.riksha],
      [TE.cooly, d.cooly ?? Number(d.labour || 0) + Number(d.handlingCharges || 0)],
      ['\u0c06\u0c36\u0c40\u0c32\u0c41', d.aaseelu],
      ['\u0c15\u0c2e\u0c40\u0c37\u0c28\u0c4d', d.commission],
      ['\u0c35\u0c21\u0c15\u0c02', d.vadakam],
      ['\u0c30\u0c41\u0c38\u0c41\u0c2e\u0c41', d.rusumu ?? d.bill],
      ['\u0c2f\u0c42\u0c28\u0c3f\u0c2f\u0c28\u0c4d', d.union ?? d.unionCharges],
    ];

    const materialsHtml = vendorMaterialsHtml(rateLines, teluguMap);

    const dedHtml = deductionRows
      .map(([label, amount]) => {
        const show = Number(amount) > 0 ? fmtMoney(amount) : '';
        return `<div class="ded-row"><span>${esc(label)}</span><span class="ded-colon">:</span><span class="ded-val">${esc(show)}</span></div>`;
      })
      .join('');

    return `
    ${brandHeaderHtml(watermarkSrc, loadDate)}
    <div class="party-line">
      <span>${esc(TE.sri)}</span>
      <span class="party-name">${esc(partyName)}</span>
      <span>${esc(TE.garu)}</span>
    </div>
    <div class="body vendor-bill">
      <div class="calcs">
        ${materialsHtml}
        <div class="gross-box"><strong>${esc(fmtMoney(gross))}</strong></div>
      </div>
      <div class="deductions-section">
        <h2 class="section-heading">${esc(TE.deductionsHeading)}</h2>
        <div class="deductions">
          ${dedHtml}
          <div class="ded-total"><strong>${esc(fmtMoney(dedTotal))}</strong></div>
        </div>
      </div>
      <div class="totals">
        <div class="totals-box">
          <div>${esc(fmtMoney(gross))} &minus; ${esc(fmtMoney(dedTotal))}</div>
          <div class="net">${esc(TE.chellinchavali)} : <strong>${esc(fmtMoney(receivable))}</strong></div>
        </div>
      </div>
    </div>`;
  };
}

/** Opens vendor రైతుపట్టి bill as PDF. */
export async function openVendorBillPdf(bill, previewTab) {
  const [teluguMap, partyName] = await Promise.all([
    materialTeluguMap(),
    resolvePartyTeluguName(bill.vendor || {}),
  ]);
  await openRaituSheetPdf(buildVendorInner(bill, teluguMap, partyName), previewTab);
}
