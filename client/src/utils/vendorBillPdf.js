import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const PAGE_LEFT = 40;
const PAGE_RIGHT = 555;

const formatMoney = (amount) => `Rs. ${Number(amount || 0).toLocaleString('en-IN')}`;

const formatDateEn = (date) =>
  new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatKg = (kg) => `${Number(kg || 0).toFixed(1)} kg`;

/**
 * Opens vendor load bill as PDF in a new tab.
 * @param {object} bill - response from GET /loads/:id/bill
 * @param {Window|null} previewTab - optional pre-opened tab to avoid popup blockers
 */
export function openVendorBillPdf(bill, previewTab) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const vendor = bill.vendor || {};
  const load = bill.load || {};
  const summary = bill.summary || {};
  const d = summary.deductions || {};

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Vendor Load Bill', PAGE_LEFT, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('JSR — Sale settlement invoice', PAGE_LEFT, 68);

  doc.setFontSize(10);
  doc.text(`Bill Date: ${formatDateEn(new Date())}`, PAGE_RIGHT, 48, { align: 'right' });
  doc.setFontSize(8);
  doc.text(`Load ID: ${load._id || ''}`, PAGE_RIGHT, 64, { align: 'right', maxWidth: 220 });

  doc.setDrawColor(205, 217, 208);
  doc.line(PAGE_LEFT, 82, PAGE_RIGHT, 82);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Vendor Details', PAGE_LEFT, 108);
  doc.text('Load Info', PAGE_RIGHT, 108, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const vendorLines = [vendor.name, vendor.mobile, vendor.city, vendor.address].filter(Boolean);
  doc.text(vendorLines, PAGE_LEFT, 128);

  doc.text(
    [
      `Load: ${formatDateEn(load.createdAt)}`,
      `Status: ${load.status === 'sold_out' ? 'Sold out' : 'Pending'}`,
      `Total: ${formatKg(load.totalWeight)}`,
      `Sold: ${formatKg(load.soldWeight)}`,
    ],
    PAGE_RIGHT,
    128,
    { align: 'right' }
  );

  const tableBody = [];
  for (const mat of bill.materials || []) {
    for (const line of mat.lines || []) {
      tableBody.push([
        mat.materialName,
        String(line.bagCount),
        formatKg(line.totalKg),
        formatMoney(line.ratePerKg),
        formatMoney(line.totalAmount),
      ]);
    }
  }

  autoTable(doc, {
    startY: 200,
    head: [['Material', 'Bags', 'Weight', 'Rate/Kg', 'Amount']],
    body: tableBody.length
      ? tableBody
      : [['No sales yet', '-', '-', '-', formatMoney(0)]],
    theme: 'grid',
    headStyles: {
      fillColor: [80, 102, 88],
      textColor: 255,
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 10,
    },
    styles: {
      fontSize: 10,
      cellPadding: 8,
      valign: 'middle',
      lineColor: [205, 217, 208],
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { cellWidth: 120, halign: 'left' },
      1: { cellWidth: 50, halign: 'center' },
      2: { cellWidth: 80, halign: 'right' },
      3: { cellWidth: 90, halign: 'right' },
      4: { cellWidth: 95, halign: 'right' },
    },
  });

  let y = (doc.lastAutoTable?.finalY || 200) + 28;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total Amount', PAGE_RIGHT - 140, y);
  doc.text(formatMoney(summary.grossTotal), PAGE_RIGHT, y, { align: 'right' });

  y += 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Deductions', PAGE_LEFT, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const deductionRows = [
    ['Handling Charges', d.handlingCharges],
    [`Labour (${summary.totalBags || 0} bags)`, d.labour],
    [`Aaseelu (${summary.totalBags || 0} bags)`, d.aaseelu],
    [`Bill (${summary.totalBags || 0} bags)`, d.bill],
    [`Union Charges (${summary.totalBags || 0} bags)`, d.unionCharges],
    [`Commission (${d.commissionPercent || 0}%)`, d.commission],
  ];

  for (const [label, amount] of deductionRows) {
    y += 18;
    doc.text(label, PAGE_LEFT, y);
    doc.text(`- ${formatMoney(amount)}`, PAGE_RIGHT, y, { align: 'right' });
  }

  y += 28;
  doc.setDrawColor(205, 217, 208);
  doc.line(PAGE_LEFT, y - 12, PAGE_RIGHT, y - 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(159, 134, 104);
  doc.text('Total Receivable', PAGE_LEFT, y);
  doc.text(formatMoney(summary.receivable), PAGE_RIGHT, y, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  const blobUrl = doc.output('bloburl');
  if (previewTab) {
    previewTab.location.href = blobUrl;
  } else {
    window.open(blobUrl, '_blank');
  }
}
