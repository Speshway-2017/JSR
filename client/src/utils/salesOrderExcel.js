import ExcelJS from 'exceljs';

export const BRAND = {
  companyName: 'JSR',
  tagline: 'Agricultural Trading — Bag Order Sheet',
  primary: '2F6B3A',
  primaryDark: '1F4D28',
  accent: 'E8913A',
  headerText: 'FFFFFF',
  subHeaderBg: 'E8F2EA',
  subHeaderText: '1F4D28',
  altRow: 'F5F9F6',
  border: 'B8D0BE',
};

/**
 * Group entries by material for Excel / on-screen preview.
 * Material names are merged case-insensitively (Mirchi / mirchi → one column).
 * @param {Array<{ id?: string, customerName: string, materialName: string, bags: number }>} entries
 */
export function buildMaterialColumns(entries) {
  const materialMap = new Map();
  const displayByKey = new Map();

  for (const row of entries) {
    const display = (row.materialName || '').trim();
    if (!display) continue;
    const key = display.toLowerCase();
    if (!displayByKey.has(key)) displayByKey.set(key, display);
    const label = displayByKey.get(key);
    if (!materialMap.has(label)) materialMap.set(label, []);
    materialMap.get(label).push({
      id: row.id,
      customerName: (row.customerName || '').trim(),
      bags: Number(row.bags) || 0,
    });
  }

  const materials = Array.from(materialMap.keys()).sort((a, b) => a.localeCompare(b));
  const maxRows = materials.length
    ? Math.max(...materials.map((m) => materialMap.get(m).length), 0)
    : 0;

  const totals = Object.fromEntries(
    materials.map((mat) => [
      mat,
      (materialMap.get(mat) || []).reduce((sum, e) => sum + (Number(e.bags) || 0), 0),
    ])
  );

  return { materials, materialMap, maxRows, totals };
}

/**
 * Group entries by person name for individual reports.
 * Optional selectedNames filters which people to include (case-insensitive).
 * @param {Array<{ customerName: string, materialName: string, bags: number }>} entries
 * @param {string[]} [selectedNames]
 */
export function buildPersonGroups(entries, selectedNames) {
  const selected =
    selectedNames && selectedNames.length > 0
      ? new Set(selectedNames.map((n) => String(n).trim().toLowerCase()).filter(Boolean))
      : null;

  const byName = new Map();
  const displayByKey = new Map();

  for (const row of entries) {
    const display = (row.customerName || '').trim();
    if (!display) continue;
    const key = display.toLowerCase();
    if (selected && !selected.has(key)) continue;
    if (!displayByKey.has(key)) displayByKey.set(key, display);
    const label = displayByKey.get(key);
    if (!byName.has(label)) byName.set(label, []);
    byName.get(label).push({
      materialName: (row.materialName || '').trim(),
      bags: Number(row.bags) || 0,
    });
  }

  const names = Array.from(byName.keys()).sort((a, b) => a.localeCompare(b));

  return names.map((name) => {
    const lines = byName.get(name) || [];
    const matMap = new Map();
    for (const line of lines) {
      if (!line.materialName) continue;
      const mKey = line.materialName.toLowerCase();
      if (!matMap.has(mKey)) {
        matMap.set(mKey, { materialName: line.materialName, bags: 0 });
      }
      matMap.get(mKey).bags += line.bags;
    }
    const materials = Array.from(matMap.values()).sort((a, b) =>
      a.materialName.localeCompare(b.materialName)
    );
    const totalBags = materials.reduce((s, m) => s + m.bags, 0);
    return { name, materials, totalBags };
  });
}

/**
 * Unique person names from entries (sorted).
 */
export function listPersonNames(entries) {
  const map = new Map();
  for (const row of entries) {
    const display = (row.customerName || '').trim();
    if (!display) continue;
    const key = display.toLowerCase();
    if (!map.has(key)) map.set(key, display);
  }
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b));
}

/**
 * Individual report: each selected person with their materials & quantities.
 * @param {Array<{ customerName: string, materialName: string, bags: number }>} entries
 * @param {string[]} selectedNames
 * @param {{ title?: string }} [options]
 */
export async function exportIndividualBagReportExcel(entries, selectedNames, options = {}) {
  const groups = buildPersonGroups(entries, selectedNames);
  if (groups.length === 0) return false;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = BRAND.companyName;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Individual Reports', {
    views: [{ showGridLines: false }],
  });
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 12;

  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  sheet.mergeCells(1, 1, 1, 2);
  const title = sheet.getCell(1, 1);
  title.value = BRAND.companyName;
  title.font = { name: 'Calibri', size: 22, bold: true, color: { argb: `FF${BRAND.headerText}` } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.primaryDark}` } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 36;

  sheet.mergeCells(2, 1, 2, 2);
  const subtitle = sheet.getCell(2, 1);
  subtitle.value = [
    options.title || null,
    'Individual Bag Report',
    dateStr,
  ]
    .filter(Boolean)
    .join('  ·  ');
  subtitle.font = { name: 'Calibri', size: 11, italic: true, color: { argb: `FF${BRAND.primaryDark}` } };
  subtitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.subHeaderBg}` } };
  subtitle.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 22;

  let row = 4;
  for (const group of groups) {
    sheet.mergeCells(row, 1, row, 2);
    const nameCell = sheet.getCell(row, 1);
    nameCell.value = group.name;
    nameCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: `FF${BRAND.headerText}` } };
    nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.primary}` } };
    nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
    nameCell.border = thinBorder();
    sheet.getCell(row, 2).border = thinBorder();
    sheet.getRow(row).height = 22;
    row += 1;

    styleSubHeader(sheet.getCell(row, 1), 'Material');
    styleSubHeader(sheet.getCell(row, 2), 'Qty');
    sheet.getRow(row).height = 18;
    row += 1;

    group.materials.forEach((line, i) => {
      const alt = i % 2 === 1;
      const matCell = sheet.getCell(row, 1);
      const qtyCell = sheet.getCell(row, 2);
      matCell.value = line.materialName;
      qtyCell.value = line.bags;
      styleDataCell(matCell, alt, false);
      styleDataCell(qtyCell, alt, true);
      sheet.getRow(row).height = 18;
      row += 1;
    });

    const totalLabel = sheet.getCell(row, 1);
    const totalQty = sheet.getCell(row, 2);
    totalLabel.value = 'Total';
    totalQty.value = group.totalBags;
    styleTotalCell(totalLabel, false);
    styleTotalCell(totalQty, true);
    sheet.getRow(row).height = 18;
    row += 2;
  }

  sheet.mergeCells(row, 1, row, 2);
  const footer = sheet.getCell(row, 1);
  footer.value = `Generated by ${BRAND.companyName}  ·  Confidential`;
  footer.font = { name: 'Calibri', size: 9, color: { argb: 'FF7F9A88' } };
  footer.alignment = { horizontal: 'center' };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `JSR_Individual_Reports_${stamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

/**
 * @param {Array<{ customerName: string, materialName: string, bags: number }>} entries
 */
export async function exportBrandedBagBagExcel(entries) {
  const { materials, materialMap, maxRows, totals } = buildMaterialColumns(entries);
  if (materials.length === 0) return false;

  const colCount = materials.length * 2;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = BRAND.companyName;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Bag Orders', {
    views: [{ showGridLines: false }],
  });

  for (let i = 1; i <= colCount; i++) {
    sheet.getColumn(i).width = i % 2 === 1 ? 20 : 10;
  }

  sheet.mergeCells(1, 1, 1, Math.max(colCount, 2));
  const title = sheet.getCell(1, 1);
  title.value = BRAND.companyName;
  title.font = { name: 'Calibri', size: 22, bold: true, color: { argb: `FF${BRAND.headerText}` } };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.primaryDark}` } };
  title.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(1).height = 36;

  sheet.mergeCells(2, 1, 2, Math.max(colCount, 2));
  const subtitle = sheet.getCell(2, 1);
  const dateStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  subtitle.value = `${BRAND.tagline}  ·  ${dateStr}`;
  subtitle.font = { name: 'Calibri', size: 11, italic: true, color: { argb: `FF${BRAND.primaryDark}` } };
  subtitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.subHeaderBg}` } };
  subtitle.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.getRow(2).height = 22;

  sheet.getRow(3).height = 8;

  const matRow = sheet.getRow(4);
  matRow.height = 24;
  materials.forEach((name, i) => {
    const c1 = i * 2 + 1;
    const c2 = i * 2 + 2;
    sheet.mergeCells(4, c1, 4, c2);
    const cell = sheet.getCell(4, c1);
    cell.value = name;
    cell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: `FF${BRAND.headerText}` } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.primary}` } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder();
    sheet.getCell(4, c2).border = thinBorder();
  });

  materials.forEach((_, i) => {
    const c1 = i * 2 + 1;
    const c2 = i * 2 + 2;
    styleSubHeader(sheet.getCell(5, c1), 'Name');
    styleSubHeader(sheet.getCell(5, c2), 'Qty');
  });
  sheet.getRow(5).height = 20;

  for (let r = 0; r < maxRows; r++) {
    const excelRow = 6 + r;
    sheet.getRow(excelRow).height = 18;
    const alt = r % 2 === 1;

    materials.forEach((name, i) => {
      const entry = materialMap.get(name)[r];
      const c1 = i * 2 + 1;
      const c2 = i * 2 + 2;
      const nameCell = sheet.getCell(excelRow, c1);
      const qtyCell = sheet.getCell(excelRow, c2);
      nameCell.value = entry ? entry.customerName : '';
      qtyCell.value = entry ? entry.bags : '';
      styleDataCell(nameCell, alt, false);
      styleDataCell(qtyCell, alt, true);
    });
  }

  const totalExcelRow = 6 + maxRows;
  sheet.getRow(totalExcelRow).height = 20;
  materials.forEach((name, i) => {
    const c1 = i * 2 + 1;
    const c2 = i * 2 + 2;
    const labelCell = sheet.getCell(totalExcelRow, c1);
    const qtyCell = sheet.getCell(totalExcelRow, c2);
    labelCell.value = 'Total';
    qtyCell.value = totals[name] || 0;
    styleTotalCell(labelCell, false);
    styleTotalCell(qtyCell, true);
  });

  const footerRow = totalExcelRow + 2;
  sheet.mergeCells(footerRow, 1, footerRow, Math.max(colCount, 2));
  const footer = sheet.getCell(footerRow, 1);
  footer.value = `Generated by ${BRAND.companyName}  ·  Confidential`;
  footer.font = { name: 'Calibri', size: 9, color: { argb: 'FF7F9A88' } };
  footer.alignment = { horizontal: 'center' };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `JSR_Bag_Orders_${stamp}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

function thinBorder() {
  const side = { style: 'thin', color: { argb: `FF${BRAND.border}` } };
  return { top: side, left: side, bottom: side, right: side };
}

function styleSubHeader(cell, text) {
  cell.value = text;
  cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: `FF${BRAND.subHeaderText}` } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.subHeaderBg}` } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  cell.border = thinBorder();
}

function styleDataCell(cell, alt, center) {
  cell.font = { name: 'Calibri', size: 10, color: { argb: `FF${BRAND.primaryDark}` } };
  cell.alignment = { horizontal: center ? 'center' : 'left', vertical: 'middle' };
  cell.border = thinBorder();
  if (alt) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.altRow}` } };
  }
}

function styleTotalCell(cell, center) {
  cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: `FF${BRAND.primaryDark}` } };
  cell.alignment = { horizontal: center ? 'center' : 'left', vertical: 'middle' };
  cell.border = thinBorder();
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND.subHeaderBg}` } };
}
