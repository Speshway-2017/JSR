import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { BRAND, buildMaterialColumns, buildPersonGroups } from './salesOrderExcel';

/**
 * Paper sizes for bag-order / individual PDF export.
 * Thermal sizes use mm custom pages; A4/A3 use jsPDF named formats.
 */
export const PDF_PAPER_SIZES = [
  {
    id: 'a4',
    label: 'A4',
    description: '210 × 297 mm · standard',
  },
  {
    id: 'a3',
    label: 'A3',
    description: '297 × 420 mm · wide sheet',
  },
  {
    id: 'thermal-80',
    label: 'Thermal 80mm',
    description: '80 mm receipt printer',
  },
  {
    id: 'thermal-58',
    label: 'Thermal 58mm',
    description: '58 mm receipt printer',
  },
];

function resolvePaper(paperSize = 'a4', { sheet = false } = {}) {
  const id = String(paperSize || 'a4').toLowerCase();

  if (id === 'a3') {
    return {
      id: 'a3',
      format: 'a3',
      orientation: sheet ? 'landscape' : 'portrait',
      unit: 'pt',
      margin: 32,
      columnsPerPage: sheet ? 16 : null,
      layout: 'sheet',
      fontScale: 1.05,
    };
  }

  if (id === 'thermal-80') {
    return {
      id: 'thermal-80',
      format: [80, 40],
      orientation: 'portrait',
      unit: 'mm',
      margin: 5,
      columnsPerPage: null,
      layout: 'thermal',
      fontScale: 1,
      pageWidthMm: 80,
    };
  }

  if (id === 'thermal-58') {
    return {
      id: 'thermal-58',
      format: [58, 40],
      orientation: 'portrait',
      unit: 'mm',
      margin: 4,
      columnsPerPage: null,
      layout: 'thermal',
      fontScale: 0.95,
      pageWidthMm: 58,
    };
  }

  return {
    id: 'a4',
    format: 'a4',
    orientation: sheet ? 'landscape' : 'portrait',
    unit: 'pt',
    margin: 28,
    columnsPerPage: sheet ? 10 : null,
    layout: 'sheet',
    fontScale: 1,
  };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function chunkItems(items, size) {
  if (items.length === 0) return [[]];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function stampName(prefix) {
  return `${prefix}_${new Date().toISOString().slice(0, 10)}.pdf`;
}

/** jsPDF font sizes are always in pt; thermal pages use mm coordinates */
const PT_TO_MM = 25.4 / 72;

function createThermalDoc(widthMm) {
  return new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [widthMm, 50],
  });
}

function growThermalPage(doc, neededY) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (neededY <= pageHeight - 2) return;
  doc.internal.pageSize.setHeight(neededY + 8);
}

function fitThermalPage(doc, contentBottomY, bottomPad = 6) {
  const h = Math.max(Math.ceil(contentBottomY + bottomPad), 40);
  doc.internal.pageSize.setHeight(h);
}

/**
 * Shared thermal receipt writer — correct mm spacing so rules don't cut through text.
 */
function createThermalWriter(doc, paper) {
  const pageWidth = paper.pageWidthMm;
  const marginX = paper.margin;
  const contentWidth = pageWidth - marginX * 2;
  const scale = paper.fontScale || 1;
  const primaryDark = hexToRgb(BRAND.primaryDark);
  const textDark = hexToRgb(BRAND.primaryDark);
  const muted = [120, 140, 128];

  let y = 4; // top margin (mm)

  const fontH = (pt) => pt * scale * PT_TO_MM;

  const ensure = (extra = 8) => growThermalPage(doc, y + extra);

  /** Draw text on baseline; advances past descenders + padding */
  const write = (text, { bold = false, size = 9, align = 'left', color = textDark, gap = 1.2 } = {}) => {
    const h = fontH(size);
    y += h;
    ensure(h + 4);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size * scale);
    doc.setTextColor(...color);
    const x = align === 'center' ? pageWidth / 2 : marginX;
    doc.text(String(text ?? ''), x, y, {
      align,
      maxWidth: contentWidth,
    });
    y += h * 0.35 + gap;
  };

  /** Left label + right qty on one row */
  const writeRow = (left, right, { bold = false, size = 8, gap = 1.6 } = {}) => {
    const h = fontH(size);
    y += h;
    ensure(h + 4);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size * scale);
    doc.setTextColor(...textDark);
    const qtyWidth = Math.min(14, contentWidth * 0.28);
    const nameWidth = contentWidth - qtyWidth - 2;
    doc.text(String(left ?? ''), marginX, y, { maxWidth: nameWidth });
    doc.text(String(right ?? ''), pageWidth - marginX, y, { align: 'right' });
    y += h * 0.3 + gap;
  };

  /** Horizontal rule with breathing room above/below so it never clips glyphs */
  const rule = ({ before = 1.6, after = 2.4 } = {}) => {
    y += before;
    ensure(6);
    doc.setDrawColor(170, 175, 170);
    doc.setLineWidth(0.25);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += after;
  };

  return {
    pageWidth,
    marginX,
    contentWidth,
    primaryDark,
    textDark,
    muted,
    get y() {
      return y;
    },
    write,
    writeRow,
    rule,
    space(mm = 1.5) {
      y += mm;
      ensure();
    },
    finish() {
      fitThermalPage(doc, y, 6);
    },
  };
}

/**
 * Compact thermal layout for bag-order sheet (list by material).
 */
function exportThermalBagSheet(entries, options, paper) {
  const { materials, materialMap, totals } = buildMaterialColumns(entries);
  if (materials.length === 0) return false;

  const doc = createThermalDoc(paper.pageWidthMm);
  const t = createThermalWriter(doc, paper);

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  t.write(BRAND.companyName, {
    bold: true,
    size: 11,
    align: 'center',
    color: t.primaryDark,
    gap: 1.4,
  });
  t.write(options.title || BRAND.tagline, { size: 8, align: 'center', gap: 1 });
  if (options.filterNote) {
    t.write(options.filterNote, { size: 7, align: 'center', gap: 1 });
  }
  t.write(dateStr, { size: 7, align: 'center', color: t.muted, gap: 1.2 });
  t.rule({ before: 1.2, after: 2.8 });

  materials.forEach((mat, index) => {
    if (index > 0) t.space(1);
    t.write(mat, { bold: true, size: 9, color: t.primaryDark, gap: 1.8 });
    const rows = materialMap.get(mat) || [];
    for (const row of rows) {
      t.writeRow(row.customerName, row.bags, { size: 8, gap: 1.8 });
    }
    t.writeRow('Total', totals[mat] || 0, { bold: true, size: 8, gap: 1.4 });
    t.rule({ before: 1.4, after: 2.6 });
  });

  t.space(0.8);
  t.write(`Generated by ${BRAND.companyName}`, {
    size: 6,
    align: 'center',
    color: t.muted,
    gap: 0.5,
  });
  t.finish();

  doc.save(stampName('JSR_Bag_Orders'));
  return true;
}

/**
 * Export bag-order sheet PDF. Pass `paperSize`: a4 | a3 | thermal-80 | thermal-58
 */
export function exportBrandedBagBagPdf(entries, options = {}) {
  const paper = resolvePaper(options.paperSize, { sheet: true });
  if (paper.layout === 'thermal') {
    return exportThermalBagSheet(entries, options, paper);
  }

  const { materials, materialMap, maxRows, totals } = buildMaterialColumns(entries);
  if (materials.length === 0) return false;

  const columnsPerPage = paper.columnsPerPage || 10;
  const doc = new jsPDF({
    orientation: paper.orientation,
    unit: paper.unit,
    format: paper.format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = paper.margin;
  const contentWidth = pageWidth - margin * 2;
  const scale = paper.fontScale;

  const primary = hexToRgb(BRAND.primary);
  const primaryDark = hexToRgb(BRAND.primaryDark);
  const subHeaderBg = hexToRgb(BRAND.subHeaderBg);
  const subHeaderText = hexToRgb(BRAND.subHeaderText);
  const altRow = hexToRgb(BRAND.altRow);
  const border = hexToRgb(BRAND.border);
  const textDark = hexToRgb(BRAND.primaryDark);

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const materialPages = chunkItems(materials, columnsPerPage);

  const drawPageChrome = (pageIndex, pageCount) => {
    doc.setFillColor(...primaryDark);
    doc.rect(margin, margin, contentWidth, 32 * scale, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18 * scale);
    doc.text(BRAND.companyName, pageWidth / 2, margin + 21 * scale, { align: 'center' });

    doc.setFillColor(...subHeaderBg);
    doc.rect(margin, margin + 32 * scale, contentWidth, 22 * scale, 'F');
    doc.setTextColor(...primaryDark);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10 * scale);
    const parts = [
      options.title || null,
      BRAND.tagline,
      options.filterNote || null,
      dateStr,
      `${paper.id.toUpperCase()}`,
      pageCount > 1 ? `Page ${pageIndex + 1} of ${pageCount}` : null,
    ].filter(Boolean);
    doc.text(parts.join('  ·  '), pageWidth / 2, margin + 46 * scale, { align: 'center' });
  };

  materialPages.forEach((pageMaterials, pageIndex) => {
    if (pageIndex > 0) doc.addPage();
    drawPageChrome(pageIndex, materialPages.length);

    const headRow1 = pageMaterials.map((mat) => ({
      content: mat,
      colSpan: 2,
      styles: {
        fillColor: primary,
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
      },
    }));

    const headRow2 = pageMaterials.flatMap(() => [
      {
        content: 'Name',
        styles: {
          fillColor: subHeaderBg,
          textColor: subHeaderText,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 8 * scale,
        },
      },
      {
        content: 'Qty',
        styles: {
          fillColor: subHeaderBg,
          textColor: subHeaderText,
          fontStyle: 'bold',
          halign: 'center',
          fontSize: 8 * scale,
        },
      },
    ]);

    const body = [];
    const rowCount = Math.max(maxRows, 1);
    for (let r = 0; r < rowCount; r++) {
      const row = [];
      for (const mat of pageMaterials) {
        const entry = materialMap.get(mat)?.[r];
        row.push(entry ? entry.customerName : '');
        row.push(entry ? String(entry.bags) : '');
      }
      body.push(row);
    }

    const totalRow = pageMaterials.flatMap((mat) => [
      {
        content: 'Total',
        styles: {
          fillColor: subHeaderBg,
          textColor: textDark,
          fontStyle: 'bold',
          halign: 'left',
        },
      },
      {
        content: String(totals[mat] || 0),
        styles: {
          fillColor: subHeaderBg,
          textColor: textDark,
          fontStyle: 'bold',
          halign: 'center',
        },
      },
    ]);
    body.push(totalRow);

    const colCount = pageMaterials.length * 2;
    const fontSize = (colCount > 20 ? 7 : colCount > 14 ? 8 : 9) * scale;

    autoTable(doc, {
      startY: margin + 60 * scale,
      margin: { left: margin, right: margin, bottom: 36 },
      head: [headRow1, headRow2],
      body,
      theme: 'grid',
      styles: {
        fontSize,
        cellPadding: 4 * scale,
        valign: 'middle',
        textColor: textDark,
        lineColor: border,
        lineWidth: 0.4,
        overflow: 'linebreak',
        minCellHeight: 16 * scale,
      },
      columnStyles: Object.fromEntries(
        Array.from({ length: colCount }, (_, i) => [
          i,
          {
            halign: i % 2 === 1 ? 'center' : 'left',
            cellWidth: 'auto',
          },
        ])
      ),
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const isTotal = data.row.index === body.length - 1;
        if (isTotal) {
          data.cell.styles.fillColor = subHeaderBg;
          data.cell.styles.fontStyle = 'bold';
          return;
        }
        if (data.row.index % 2 === 1) {
          data.cell.styles.fillColor = altRow;
        }
      },
      tableWidth: 'auto',
    });

    const finalY = doc.lastAutoTable?.finalY || margin + 80;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8 * scale);
    doc.setTextColor(127, 154, 136);
    doc.text(
      `Generated by ${BRAND.companyName}  ·  Confidential`,
      pageWidth / 2,
      Math.min(finalY + 18, pageHeight - 16),
      { align: 'center' }
    );
  });

  doc.save(stampName('JSR_Bag_Orders'));
  return true;
}

function exportThermalIndividual(entries, selectedNames, options, paper) {
  const groups = buildPersonGroups(entries, selectedNames);
  if (groups.length === 0) return false;

  const doc = createThermalDoc(paper.pageWidthMm);
  const t = createThermalWriter(doc, paper);

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  t.write(BRAND.companyName, {
    bold: true,
    size: 11,
    align: 'center',
    color: t.primaryDark,
    gap: 1.4,
  });
  t.write(options.title || 'Individual Bag Report', { size: 8, align: 'center', gap: 1 });
  t.write(dateStr, { size: 7, align: 'center', color: t.muted, gap: 1.2 });
  t.rule({ before: 1.2, after: 2.8 });

  groups.forEach((group, idx) => {
    if (idx > 0) {
      t.rule({ before: 1.2, after: 2.6 });
    }
    t.write(group.name, { bold: true, size: 9, color: t.primaryDark, gap: 1.8 });
    for (const line of group.materials) {
      t.writeRow(line.materialName, line.bags, { size: 8, gap: 1.8 });
    }
    t.writeRow('Total', group.totalBags, { bold: true, size: 8, gap: 1.4 });
  });

  t.space(1.2);
  t.rule({ before: 0.8, after: 2.2 });
  t.write(`Generated by ${BRAND.companyName}`, {
    size: 6,
    align: 'center',
    color: t.muted,
    gap: 0.5,
  });
  t.finish();

  doc.save(stampName('JSR_Individual_Reports'));
  return true;
}

/**
 * Individual report PDF. Pass `paperSize`: a4 | a3 | thermal-80 | thermal-58
 */
export function exportIndividualBagReportPdf(entries, selectedNames, options = {}) {
  const paper = resolvePaper(options.paperSize, { sheet: false });
  if (paper.layout === 'thermal') {
    return exportThermalIndividual(entries, selectedNames, options, paper);
  }

  const groups = buildPersonGroups(entries, selectedNames);
  if (groups.length === 0) return false;

  const doc = new jsPDF({
    orientation: paper.orientation,
    unit: paper.unit,
    format: paper.format,
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = paper.margin;
  const contentWidth = pageWidth - margin * 2;
  const scale = paper.fontScale;

  const primary = hexToRgb(BRAND.primary);
  const primaryDark = hexToRgb(BRAND.primaryDark);
  const subHeaderBg = hexToRgb(BRAND.subHeaderBg);
  const subHeaderText = hexToRgb(BRAND.subHeaderText);
  const altRow = hexToRgb(BRAND.altRow);
  const border = hexToRgb(BRAND.border);
  const textDark = hexToRgb(BRAND.primaryDark);

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const drawHeader = () => {
    doc.setFillColor(...primaryDark);
    doc.rect(margin, margin, contentWidth, 32 * scale, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18 * scale);
    doc.text(BRAND.companyName, pageWidth / 2, margin + 21 * scale, { align: 'center' });

    doc.setFillColor(...subHeaderBg);
    doc.rect(margin, margin + 32 * scale, contentWidth, 22 * scale, 'F');
    doc.setTextColor(...primaryDark);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(10 * scale);
    const parts = [
      options.title || null,
      'Individual Bag Report',
      dateStr,
      paper.id.toUpperCase(),
    ].filter(Boolean);
    doc.text(parts.join('  ·  '), pageWidth / 2, margin + 46 * scale, { align: 'center' });
  };

  drawHeader();
  let cursorY = margin + 68 * scale;

  groups.forEach((group, groupIndex) => {
    const blockHeightEstimate = 28 + 22 + group.materials.length * 20 + 24 + 16;
    if (groupIndex > 0 && cursorY + Math.min(blockHeightEstimate, 120) > pageHeight - 40) {
      doc.addPage();
      drawHeader();
      cursorY = margin + 68 * scale;
    }

    autoTable(doc, {
      startY: cursorY,
      margin: { left: margin, right: margin, bottom: 36 },
      head: [
        [
          {
            content: group.name,
            colSpan: 2,
            styles: {
              fillColor: primary,
              textColor: 255,
              fontStyle: 'bold',
              halign: 'left',
              fontSize: 11 * scale,
            },
          },
        ],
        [
          {
            content: 'Material',
            styles: {
              fillColor: subHeaderBg,
              textColor: subHeaderText,
              fontStyle: 'bold',
              halign: 'left',
              fontSize: 9 * scale,
            },
          },
          {
            content: 'Qty',
            styles: {
              fillColor: subHeaderBg,
              textColor: subHeaderText,
              fontStyle: 'bold',
              halign: 'center',
              fontSize: 9 * scale,
            },
          },
        ],
      ],
      body: [
        ...group.materials.map((line) => [line.materialName, String(line.bags)]),
        [
          {
            content: 'Total',
            styles: { fontStyle: 'bold', fillColor: subHeaderBg },
          },
          {
            content: String(group.totalBags),
            styles: { fontStyle: 'bold', fillColor: subHeaderBg, halign: 'center' },
          },
        ],
      ],
      theme: 'grid',
      styles: {
        fontSize: 10 * scale,
        cellPadding: 4 * scale,
        valign: 'middle',
        textColor: textDark,
        lineColor: border,
        lineWidth: 0.4,
      },
      columnStyles: {
        0: { cellWidth: contentWidth * 0.72, halign: 'left' },
        1: { cellWidth: contentWidth * 0.28, halign: 'center' },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index < group.materials.length && data.row.index % 2 === 1) {
          data.cell.styles.fillColor = altRow;
        }
      },
      tableWidth: contentWidth,
    });

    cursorY = (doc.lastAutoTable?.finalY || cursorY) + 18;
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8 * scale);
  doc.setTextColor(127, 154, 136);
  const footerY = Math.min(cursorY + 4, pageHeight - 16);
  doc.text(
    `Generated by ${BRAND.companyName}  ·  Confidential`,
    pageWidth / 2,
    footerY,
    { align: 'center' }
  );

  doc.save(stampName('JSR_Individual_Reports'));
  return true;
}
