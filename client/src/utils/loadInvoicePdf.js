import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const PAGE_LEFT = 40;
const PAGE_RIGHT = 555;
const CONTENT_WIDTH = PAGE_RIGHT - PAGE_LEFT;

const LABELS = {
  title: 'Load Invoice',
  subtitle: 'JSR — Vendor Purchase Invoice',
  invoiceDate: 'Invoice Date',
  invoiceId: 'Invoice ID',
  vendorDetails: 'Vendor Details',
  creditBalance: 'Credit Balance After Save',
  material: 'Material',
  bagDetails: 'Bag Details',
  bags: 'Bags',
  weight: 'Weight',
  ratePerKg: 'Rate/Kg',
  amount: 'Amount',
  materialsTotal: 'Materials Total',
  handlingCharges: 'Handling Charges',
  totalBuying: 'Total Buying Amount',
  notes: 'Notes',
};

const formatMoney = (amount) => `Rs. ${Number(amount || 0).toLocaleString('en-IN')}`;

const formatDateEn = (date) =>
  new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatBagLines = (bagEntries = []) =>
  bagEntries
    .map((bag, idx) => `Bag ${idx + 1}: ${Number(bag.kgs ?? bag.kgPerBag).toFixed(1)} kg`)
    .join('\n');

const countBags = (bagEntries = []) =>
  bagEntries.reduce((sum, bag) => sum + (bag.kgs != null ? 1 : bag.numBags || 0), 0);

export function openLoadInvoicePdf(load, previewTab) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });

  const materialsSubtotal = load.materials.reduce((sum, m) => sum + m.totalAmount, 0);
  const handlingAmount = Number(load.handlingCharges) || 0;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(LABELS.title, PAGE_LEFT, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(LABELS.subtitle, PAGE_LEFT, 68);

  doc.setFontSize(10);
  doc.text(`${LABELS.invoiceDate}: ${formatDateEn(load.createdAt)}`, PAGE_RIGHT, 48, { align: 'right' });
  doc.setFontSize(8);
  doc.text(`${LABELS.invoiceId}: ${load._id}`, PAGE_RIGHT, 64, { align: 'right', maxWidth: 220 });

  doc.setDrawColor(226, 232, 240);
  doc.line(PAGE_LEFT, 82, PAGE_RIGHT, 82);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(LABELS.vendorDetails, PAGE_LEFT, 108);
  doc.text(LABELS.creditBalance, PAGE_RIGHT, 108, { align: 'right', maxWidth: 160 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const vendorLines = [
    load.vendor?.name || '',
    load.vendor?.mobile || '',
    load.vendor?.city || '',
    load.vendor?.address || '',
  ].filter(Boolean);
  doc.text(vendorLines, PAGE_LEFT, 128);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(159, 134, 104);
  doc.text(formatMoney(load.vendor?.creditBalance), PAGE_RIGHT, 128, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: 175,
    head: [[LABELS.material, LABELS.bagDetails, LABELS.bags, LABELS.weight, LABELS.ratePerKg, LABELS.amount]],
    body: load.materials.map((mat) => [
      mat.materialName,
      formatBagLines(mat.bagEntries),
      String(countBags(mat.bagEntries)),
      `${Number(mat.totalKg).toFixed(1)} kg`,
      formatMoney(mat.ratePerKg),
      formatMoney(mat.totalAmount),
    ]),
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
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
    },
    columnStyles: {
      0: { cellWidth: 72, halign: 'left' },
      1: { cellWidth: 175, halign: 'left', valign: 'top' },
      2: { cellWidth: 42, halign: 'center' },
      3: { cellWidth: 58, halign: 'right' },
      4: { cellWidth: 72, halign: 'right' },
      5: { cellWidth: 76, halign: 'right' },
    },
  });

  const finalY = doc.lastAutoTable.finalY || 175;
  let summaryY = finalY + 24;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`${LABELS.materialsTotal}:`, PAGE_RIGHT - 120, summaryY, { align: 'right' });
  doc.text(formatMoney(materialsSubtotal), PAGE_RIGHT, summaryY, { align: 'right' });

  if (handlingAmount > 0) {
    summaryY += 22;
    doc.text(`${LABELS.handlingCharges}:`, PAGE_RIGHT - 120, summaryY, { align: 'right' });
    doc.text(formatMoney(handlingAmount), PAGE_RIGHT, summaryY, { align: 'right' });
  }

  summaryY += 26;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`${LABELS.totalBuying}:`, PAGE_RIGHT - 120, summaryY, { align: 'right' });
  doc.text(formatMoney(load.totalBuyingAmount), PAGE_RIGHT, summaryY, { align: 'right' });

  if (load.notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(LABELS.notes, PAGE_LEFT, summaryY + 36);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(load.notes, PAGE_LEFT, summaryY + 54, { maxWidth: CONTENT_WIDTH });
  }

  const blobUrl = doc.output('bloburl');
  if (previewTab) {
    previewTab.location.href = blobUrl;
  } else {
    window.open(blobUrl, '_blank');
  }
}
