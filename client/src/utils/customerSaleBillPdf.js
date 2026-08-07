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

/** Merge sale lines by material — one row per material */
function aggregateByMaterial(lines = []) {
  const map = new Map();
  for (const line of lines) {
    const name = line.materialName || 'Material';
    const existing = map.get(name) || { materialName: name, bagCount: 0, totalKg: 0, totalAmount: 0 };
    existing.bagCount += Number(line.bagCount) || 0;
    existing.totalKg += Number(line.totalKg) || 0;
    existing.totalAmount += Number(line.totalAmount) || 0;
    map.set(name, existing);
  }
  return Array.from(map.values());
}

/**
 * Customer sale bill PDF — one row per material (bags, weight, total).
 */
export function openCustomerSaleBillPdf(sale, previewTab) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const customer = sale.customer || {};
  const vendor = sale.vendor || {};
  const materials = aggregateByMaterial(sale.lines);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Customer Sale Bill', PAGE_LEFT, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('AgriTrades — Customer invoice', PAGE_LEFT, 68);

  doc.setFontSize(10);
  doc.text(`Bill Date: ${formatDateEn(sale.createdAt || new Date())}`, PAGE_RIGHT, 48, { align: 'right' });
  doc.setFontSize(8);
  doc.text(`Sale ID: ${sale._id || ''}`, PAGE_RIGHT, 64, { align: 'right', maxWidth: 220 });

  doc.setDrawColor(205, 217, 208);
  doc.line(PAGE_LEFT, 82, PAGE_RIGHT, 82);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Customer', PAGE_LEFT, 108);
  doc.text('Stock / Vendor', PAGE_RIGHT, 108, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const customerLines = [
    customer.name,
    customer.mobile,
    [customer.city, customer.state].filter(Boolean).join(', '),
    customer.address,
  ].filter(Boolean);
  doc.text(customerLines.length ? customerLines : ['—'], PAGE_LEFT, 128);

  doc.text(
    [vendor.name ? `Vendor: ${vendor.name}` : null, vendor.city, `Bags: ${sale.totalBags || 0}`, `Weight: ${formatKg(sale.totalWeight)}`].filter(
      Boolean
    ),
    PAGE_RIGHT,
    128,
    { align: 'right' }
  );

  const tableBody = materials.map((mat) => [
    mat.materialName,
    String(mat.bagCount),
    formatKg(mat.totalKg),
    formatMoney(mat.totalAmount),
  ]);

  autoTable(doc, {
    startY: 200,
    head: [['Material', 'Bags', 'Total Weight', 'Total']],
    body: tableBody.length ? tableBody : [['—', '0', '0.0 kg', formatMoney(0)]],
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
      0: { cellWidth: 160, halign: 'left' },
      1: { cellWidth: 70, halign: 'center' },
      2: { cellWidth: 110, halign: 'right' },
      3: { cellWidth: 110, halign: 'right' },
    },
  });

  let y = (doc.lastAutoTable?.finalY || 200) + 28;
  const materialsTotal = materials.reduce((s, m) => s + m.totalAmount, 0);
  const handling = Number(sale.handlingCharges || 0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('Materials Total', PAGE_RIGHT - 140, y);
  doc.text(formatMoney(materialsTotal), PAGE_RIGHT, y, { align: 'right' });

  if (handling > 0) {
    y += 20;
    doc.text('Handling Charges', PAGE_RIGHT - 140, y);
    doc.text(formatMoney(handling), PAGE_RIGHT, y, { align: 'right' });
  }

  y += 26;
  doc.setDrawColor(205, 217, 208);
  doc.line(PAGE_LEFT, y - 12, PAGE_RIGHT, y - 12);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(159, 134, 104);
  doc.text('Total Amount', PAGE_LEFT, y);
  doc.text(formatMoney(sale.totalAmount), PAGE_RIGHT, y, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  const blobUrl = doc.output('bloburl');
  if (previewTab) {
    previewTab.location.href = blobUrl;
  } else {
    window.open(blobUrl, '_blank');
  }
}
