import ExcelJS from 'exceljs';
import { dialog } from 'electron';
import { getDatabase } from '../database/db';
import { getProjectById } from '../database/projects';
import { getLocationById, getLocationsByProject } from '../database/locations';
import { getPanelsByLocation } from '../database/panels';
import {
  getElementsByPanel,
  getArticlesByElement,
  type ArticleRow,
} from '../database/elements';
import { getCompanySettings } from '../database/settings';
import type {
  CompanySettings,
  ExcelExportResult,
  ProjectExcelExportPayload,
  PanelWithStats,
} from '../../shared/types';
import type { ElementRow } from '../database/elements';
import {
  excelCurrentFormula,
  resolveElementCoefs,
  wattsToKw,
} from '../../shared/powerCalculations';

const PRIMARY_COLOR = 'FF1E3A5F';
const ALT_ROW_COLOR = 'FFF0F4F8'; // Légèrement plus visible pour une meilleure lisibilité
const TOTAL_ROW_COLOR = 'FFDBEAFE';
const SUBTOTAL_ROW_COLOR = 'FFEFF6FF';
const PROJECT_INFO_COLOR = 'FFE8F0FE';
const DATA_ROW_COLOR = 'FFFFFFFF'; // Blanc pour les lignes impaires

interface PanelSheetMeta {
  sheetName: string;
  totalPowerCell: string;
  currentCell: string;
  locationName: string;
  panelName: string;
}

function colLetter(col: number): string {
  let letter = '';
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31);
}

function uniqueSheetName(workbook: ExcelJS.Workbook, baseName: string): string {
  const sanitized = sanitizeSheetName(baseName);
  if (!workbook.getWorksheet(sanitized)) return sanitized;
  let i = 2;
  while (i < 100) {
    const suffix = `_${i}`;
    const candidate = sanitizeSheetName(baseName.slice(0, 31 - suffix.length) + suffix);
    if (!workbook.getWorksheet(candidate)) return candidate;
    i++;
  }
  return sanitizeSheetName(`${baseName.slice(0, 20)}_${Date.now()}`);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

function determineOptimalOrientation(colCount: number): 'portrait' | 'landscape' {
  // A4 dimensions in inches: 8.27 x 11.69
  // Portrait: width = 8.27, Landscape: width = 11.69
  // With 0.5" margins: usable width = 7.27 (portrait) or 10.69 (landscape)
  // Each character ~0.1" at 10pt font
  const totalWidth = colCount * 2.5; // Approximate width per column in inches
  return totalWidth > 7.5 ? 'landscape' : 'portrait';
}

function calculateOptimalColumnWidths(colCount: number, orientation: 'portrait' | 'landscape'): number[] {
  const usableWidth = orientation === 'portrait' ? 7.27 : 10.69;
  const baseWidth = usableWidth / colCount;
  
  // Return widths in Excel units (1 unit ≈ 0.09 inches)
  const excelWidth = baseWidth / 0.09;
  
  // Distribute widths based on column importance
  if (colCount === 8) {
    return [excelWidth * 1.3, excelWidth * 1.2, excelWidth * 1.2, excelWidth * 0.8, excelWidth * 0.5, excelWidth * 0.5, excelWidth * 0.5, excelWidth * 0.8];
  } else if (colCount === 7) {
    return [excelWidth * 1.4, excelWidth * 1.3, excelWidth * 1.3, excelWidth * 0.9, excelWidth * 0.6, excelWidth * 0.6, excelWidth * 0.9];
  }
  return Array(colCount).fill(excelWidth);
}

function setupPrintArea(worksheet: ExcelJS.Worksheet, dataEndRow: number, colCount: number): void {
  const lastCol = colLetter(colCount);
  worksheet.pageSetup.printArea = `A1:${lastCol}${dataEndRow}`;
}

function optimizeRowHeights(worksheet: ExcelJS.Worksheet, startRow: number, endRow: number): void {
  for (let r = startRow; r <= endRow; r++) {
    const row = worksheet.getRow(r);
    if (!row.height) {
      row.height = 22; // Default height for data rows
    }
  }
}

function formatExportDate(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function applyBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
}

/** Merge sans erreur si la plage est déjà fusionnée ou chevauche une fusion existante. */
function safeMergeCells(
  worksheet: ExcelJS.Worksheet,
  top: number,
  left: number,
  bottom: number,
  right: number
): void {
  try {
    worksheet.mergeCells(top, left, bottom, right);
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (!message.includes('already merged')) throw err;
  }
}

function stripBase64Prefix(b64: string): string {
  const idx = b64.indexOf('base64,');
  return idx >= 0 ? b64.slice(idx + 7) : b64;
}

function sanitizeExcelString(value: string): string {
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '');
}

function toCellString(value: string): string {
  return sanitizeExcelString(value);
}

function toCellValue(value: string | number): string | number {
  return typeof value === 'string' ? toCellString(value) : value;
}

function isValidImageBase64(b64: string): boolean {
  try {
    const buf = Buffer.from(stripBase64Prefix(b64), 'base64');
    return buf.length >= 8;
  } catch {
    return false;
  }
}

function addWorksheetImageLogo(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  base64: string,
  mime: string,
  tlCol: number,
  brCol: number
): boolean {
  if (!base64 || !mime || mime === 'image/svg+xml' || !isValidImageBase64(base64)) {
    return false;
  }
  const ext = mime.toLowerCase().includes('png') ? 'png' : 'jpeg';
  const imageId = workbook.addImage({
    base64: stripBase64Prefix(base64),
    extension: ext,
  });
  worksheet.addImage(imageId, {
    tl: { col: tlCol, row: 0 },
    br: { col: brCol, row: 1 },
    editAs: 'oneCell',
  } as ExcelJS.ImageRange & { editAs: string });
  return true;
}

function addWorksheetLogo(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  company: CompanySettings
): boolean {
  return addWorksheetImageLogo(
    workbook,
    worksheet,
    company.logo_base64,
    company.logo_mime,
    0,
    2
  );
}

function addWorksheetClientLogo(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  company: CompanySettings,
  colCount: number
): boolean {
  return addWorksheetImageLogo(
    workbook,
    worksheet,
    company.client_logo_base64,
    company.client_logo_mime,
    5,
    colCount
  );
}

function applyProjectInfoStyle(cell: ExcelJS.Cell, isLabel: boolean): void {
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PROJECT_INFO_COLOR },
  };
  cell.font = isLabel
    ? { bold: true, size: 10, color: { argb: 'FF1E3A5F' } }
    : { size: 11, color: { argb: 'FF1E3A5F' } };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  applyBorder(cell);
}

function writeProjectInfoZone(
  worksheet: ExcelJS.Worksheet,
  row: number,
  startCol: number,
  endCol: number,
  value: string,
  isLabel: boolean
): void {
  if (endCol > startCol) {
    safeMergeCells(worksheet, row, startCol, row, endCol);
  }
  const cell = worksheet.getCell(row, startCol);
  cell.value = toCellString(value);
  applyProjectInfoStyle(cell, isLabel);
}

function addCompanyHeader(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  company: CompanySettings,
  title: string,
  projectInfo: { name: string; client: string | null },
  colCount: number = 7
): { headerRow: number; svgSkipped: boolean } {
  worksheet.getRow(1).height = 57;  // ~95px
  worksheet.getRow(2).height = 27;  // ~36px
  worksheet.getRow(3).height = 30;  // ~40px

  const projetEndCol = 4;
  const clientStartCol = 5;
  const clientEndCol = colCount >= 8 ? 7 : 6;
  const dateCol = colCount;

  let svgSkipped = false;

  // Toutes les fusions d'en-tête avant l'image (l'ancrage image peut fusionner des cellules).
  safeMergeCells(worksheet, 1, 1, 1, 2);
  safeMergeCells(worksheet, 1, 3, 1, 5);
  safeMergeCells(worksheet, 1, 6, 1, colCount);

  const logoCell = worksheet.getCell(1, 1);
  logoCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PRIMARY_COLOR },
  };

  const logoEmbedded = addWorksheetLogo(workbook, worksheet, company);
  if (!logoEmbedded) {
    if (company.logo_base64 && company.logo_mime === 'image/svg+xml') {
      svgSkipped = true;
    }
    logoCell.value = toCellString(company.company_name || 'BilPow');
    logoCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
    logoCell.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  const titleCell = worksheet.getCell(1, 3);
  titleCell.value = toCellString(title);
  titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PRIMARY_COLOR },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  const infoCell = worksheet.getCell(1, 6);
  infoCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PRIMARY_COLOR },
  };
  infoCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  const clientLogoEmbedded = addWorksheetClientLogo(workbook, worksheet, company, colCount);
  if (!clientLogoEmbedded) {
    if (company.client_logo_base64 && company.client_logo_mime === 'image/svg+xml') {
      svgSkipped = true;
    }
    const clientFallback = projectInfo.client?.trim() || 'Logo client';
    infoCell.value = toCellString(clientFallback);
    infoCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  }

  writeProjectInfoZone(worksheet, 2, 1, projetEndCol, 'Projet', true);
  writeProjectInfoZone(worksheet, 2, clientStartCol, clientEndCol, 'Client', true);
  writeProjectInfoZone(worksheet, 2, dateCol, dateCol, 'Date', true);

  writeProjectInfoZone(worksheet, 3, 1, projetEndCol, projectInfo.name, false);
  writeProjectInfoZone(
    worksheet,
    3,
    clientStartCol,
    clientEndCol,
    projectInfo.client?.trim() || '—',
    false
  );
  writeProjectInfoZone(worksheet, 3, dateCol, dateCol, formatExportDate(), false);

  return { headerRow: 5, svgSkipped };
}

function isJeuDeBarresRow(el: { type?: string; row_kind?: string }): boolean {
  return el.type === 'jeu_de_barres' || el.row_kind === 'bar_set';
}

function departCategoryOf(el: {
  type?: string;
  phase_type?: string | null;
}): string {
  // Divers elements should be grouped with their parent category (eclairage or prise)
  if (el.type === 'divers') {
    // Divers don't have their own category - they inherit from context
    // For Excel export, we need to determine the parent category
    // Since divers are always children of eclairage or prise, we need to look at the repere context
    // For now, return 'divers' but the actual grouping should be based on parent
    return 'divers';
  }
  if (el.type === 'eclairage') return 'eclairage';
  if (el.type === 'prise') {
    return el.phase_type === 'tri' ? 'prise-tri' : 'prise-mono';
  }
  return 'eclairage';
}

/** Clé de regroupement repère : même repère + catégories différentes = départs indépendants. */
function repereGroupKey(el: ElementRow & { _parentCategory?: string }): string {
  // For divers elements, use the parent category if available
  if (el.type === 'divers') {
    const category = el._parentCategory || departCategoryOf(el);
    return `${el.repere.trim().toUpperCase()}|${category}`;
  }
  return `${el.repere.trim().toUpperCase()}|${departCategoryOf(el)}`;
}

function jdbCategoryLabelExcel(category: string | null | undefined): string {
  if (category === 'prise') return 'Prise de courant';
  return 'Éclairage';
}

function writeJeuDeBarresExcelRow(
  sheet: ExcelJS.Worksheet,
  rowNum: number,
  el: ElementRow,
  colCount: number
): void {
  const title = el.type_label?.trim() || el.designation?.trim() || 'Jeu de barres';
  const category = jdbCategoryLabelExcel(el.jdb_category);
  safeMergeCells(sheet, rowNum, 1, rowNum, colCount);
  const cell = sheet.getCell(rowNum, 1);
  cell.value = toCellString(`${title}  —  Jeu de barres · ${category}`);
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PRIMARY_COLOR },
  };
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  sheet.getRow(rowNum).height = 26;
  applyBorder(cell);
}

function writeMultiDepartExcelRows(
  sheet: ExcelJS.Worksheet,
  startRowNum: number,
  el: ElementRow,
  articles: ArticleRow[],
  colMapping: { REPERE: number; TYPE: number; DESIGNATION: number; POWER: number; QTY: number; KS: number; KU: number; TOTAL: number },
  colCount: number,
  showKu: boolean,
  departIndex: number
): { endRow: number; powerRows: number[] } {
  const powerRows: number[] = [];
  let rowNum = startRowNum - 1;
  let isFirstArticle = true;
  let articleIndex = 0;

  // Color based on depart index for consistent coloring across all lines of the depart
  const rowColor = departIndex % 2 === 0 ? ALT_ROW_COLOR : DATA_ROW_COLOR;

  for (const article of articles) {
    rowNum++;
    articleIndex++;
    const row = sheet.getRow(rowNum);

    // Only set repère for the first article in the multi depart
    if (isFirstArticle) {
      row.getCell(colMapping.REPERE).value = toCellValue(el.repere);
      isFirstArticle = false;
    } else {
      row.getCell(colMapping.REPERE).value = '';
    }

    row.getCell(colMapping.TYPE).value =
    article.type_label?.trim() || '';

    row.getCell(colMapping.DESIGNATION).value =
    article.designation?.trim() || '';
    row.getCell(colMapping.POWER).value = wattsToKw(article.power_w);
    row.getCell(colMapping.QTY).value = article.quantity;
    const ks = article.coef_ks ?? 1;
    const ku = article.coef_ku ?? 1;
    row.getCell(colMapping.KS).value = ks;
    if (showKu) {
      row.getCell(colMapping.KU).value = ku;
    }

    const kuCol = showKu ? colLetter(colMapping.KU) : '1';
    const kuValue = showKu ? `${kuCol}${rowNum}` : '1';
    const ksCol = colLetter(colMapping.KS);
    row.getCell(colMapping.TOTAL).value = {
      formula: `${colLetter(colMapping.POWER)}${rowNum}*${colLetter(colMapping.QTY)}${rowNum}*${ksCol}${rowNum}*${kuValue}`,
    };
    powerRows.push(rowNum);

    // Apply professional row styling - color by depart (all lines same color)
    for (let c = 1; c <= colCount; c++) {
      row.getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowColor },
      };
      applyBorder(row.getCell(c));
    }
  }

  return { endRow: rowNum, powerRows };
}

function writeSubtotalRow(
  sheet: ExcelJS.Worksheet,
  rowNum: number,
  label: string,
  sumFormula: string,
  colMapping: { REPERE: number; DESIGNATION: number; POWER: number; QTY: number; KS: number; KU: number; TOTAL: number },
  colCount: number
): void {
  safeMergeCells(sheet, rowNum, colMapping.REPERE, rowNum, colMapping.TOTAL - 1);
  const labelCell = sheet.getCell(rowNum, colMapping.REPERE);
  labelCell.value = toCellString(label);
  labelCell.font = { bold: true, italic: true, size: 10 };
  labelCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  const totalCell = sheet.getCell(rowNum, colMapping.TOTAL);
  totalCell.value = { formula: sumFormula };
  totalCell.font = { bold: true, italic: true, size: 10 };
  totalCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: SUBTOTAL_ROW_COLOR },
  };
  totalCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  for (let c = 1; c <= colCount; c++) {
    applyBorder(sheet.getCell(rowNum, c));
  }
  sheet.getRow(rowNum).height = 22;
}

interface PanelSheetResult {
  svgSkipped: boolean;
  meta: PanelSheetMeta;
  dataStartRow: number;
  dataEndRow: number;
  totalRowNum: number;
  totalPowerCell: string;
  currentCell: string;
}

function hasNonUnitaryKu(elements: ElementRow[]): boolean {
  for (const el of elements) {
    if (isJeuDeBarresRow(el)) continue;
    
    if (el.is_multi) {
      const articles = getArticlesByElement(el.id);
      for (const article of articles) {
        if ((article.coef_ku ?? 1) !== 1) return true;
      }
    } else {
      const resolvedCoefs = resolveElementCoefs(el);
      if (resolvedCoefs.ku !== 1) return true;
    }
  }
  return false;
}

function createPanelSheet(
  workbook: ExcelJS.Workbook,
  data: {
    projectName: string;
    projectClient: string | null;
    locationName: string;
    panelName: string;
    elements: ElementRow[];
    company: CompanySettings;
    sheetTitle: string;
    sheetName: string;
    ksGlobal?: number;
  }
): PanelSheetResult {
  const sheetName = uniqueSheetName(workbook, data.sheetName);
  const sheet = workbook.addWorksheet(sheetName);

  // Pre-process elements: determine parent category for divers elements
  // Divers should inherit the category of their parent (eclairage or prise)
  const elementsWithParentCategory = data.elements.map(el => {
    if (el.type === 'divers') {
      // Find the parent element with the same repere that is not divers
      const parent = data.elements.find(
        parent => parent.repere.trim().toUpperCase() === el.repere.trim().toUpperCase() &&
                 parent.type !== 'divers' &&
                 parent.id !== el.id
      );
      if (parent) {
        // Create a modified element with the parent's category for grouping purposes
        return { ...el, _parentCategory: departCategoryOf(parent) };
      }
    }
    return el;
  });

  // Check if Ku is needed BEFORE calling addCompanyHeader
  const showKu = hasNonUnitaryKu(data.elements);
  const COL_COUNT_DYNAMIC = showKu ? 8 : 7;

  const { headerRow, svgSkipped } = addCompanyHeader(
    sheet,
    workbook,
    data.company,
    data.sheetTitle,
    { name: data.projectName, client: data.projectClient },
    COL_COUNT_DYNAMIC
  );

  // Dynamic column mapping
  const COL_DYNAMIC = {
    REPERE: 1,
    TYPE: 2,
    DESIGNATION: 3,
    POWER: 4,
    QTY: 5,
    KS: 6,
    KU: showKu ? 7 : 0,
    TOTAL: showKu ? 8 : 7,
  } as const;

  const headers = showKu
    ? [
        'Repère',
        'Type',
        'Désignation',
        'P. Unitaire (kW)',
        'Qté',
        'Ks',
        'Ku',
        'P. totale (kW)',
      ]
    : [
        'Repère',
        'Type',
        'Désignation',
        'P. Unitaire (kW)',
        'Qté',
        'Ks',
        'P. totale (kW)',
      ];

  const headerRowObj = sheet.getRow(headerRow);

  headers.forEach((h, i) => {
    const cell = headerRowObj.getCell(i + 1);
    cell.value = toCellString(h);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: PRIMARY_COLOR },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    applyBorder(cell);
  });
  headerRowObj.height = 28;

  // Calculate optimal orientation early (needed for page break logic)
  const orientation = determineOptimalOrientation(COL_COUNT_DYNAMIC);

  let rowNum = headerRow;
  let dataRowIndex = 0;
  let departIndex = 0; // Track depart index for coloring by depart instead of by line
  let currentJdb: ElementRow | null = null;
  let groupPowerRows: number[] = [];
  const allPowerRows: number[] = [];

  // Tracking for repère merging (only within same repère + category, e.g. multi-départ)
  let currentRepereGroupKey = '';
  let currentRepereStartRow = 0;

  const flushRepereGroup = (endRow: number = rowNum): void => {
    if (currentRepereGroupKey && currentRepereStartRow > 0 && endRow > currentRepereStartRow) {
      safeMergeCells(sheet, currentRepereStartRow, COL_DYNAMIC.REPERE, endRow, COL_DYNAMIC.REPERE);
    }
  };

  const flushSubtotal = (): void => {
    if (!currentJdb || groupPowerRows.length === 0) return;
    rowNum++;
    const first = groupPowerRows[0]!;
    const last = groupPowerRows[groupPowerRows.length - 1]!;
    const sumFormula = `SUM(${colLetter(COL_DYNAMIC.TOTAL)}${first}:${colLetter(COL_DYNAMIC.TOTAL)}${last})`;
    const jdbTitle =
      currentJdb.type_label?.trim() ||
      currentJdb.designation?.trim() ||
      'Jeu de barres';
    writeSubtotalRow(sheet, rowNum, `Sous-total ${jdbTitle}`, sumFormula, COL_DYNAMIC, COL_COUNT_DYNAMIC);
    groupPowerRows = [];
  };

  for (const el of elementsWithParentCategory) {
    if (isJeuDeBarresRow(el)) {
      flushRepereGroup();
      flushSubtotal();        // sous-total sur rowNum courant (ligne précédente)
      rowNum++;               // nouvelle ligne pour le titre JDB
      currentJdb = el;
      currentRepereGroupKey = '';
      currentRepereStartRow = 0;
      writeJeuDeBarresExcelRow(sheet, rowNum, el, COL_COUNT_DYNAMIC);
      continue;
    }
    rowNum++;
    const groupKey = repereGroupKey(el);
    if (groupKey !== currentRepereGroupKey) {
      flushRepereGroup(rowNum - 1);
      currentRepereGroupKey = groupKey;
      currentRepereStartRow = rowNum;
      departIndex++; // Increment depart index for each new depart
    }

    if (el.is_multi) {
      const articles = getArticlesByElement(el.id);
      const titleRowNum = rowNum;
      const { endRow, powerRows } = writeMultiDepartExcelRows(
        sheet,
        titleRowNum,
        el,
        articles,
        COL_DYNAMIC,
        COL_COUNT_DYNAMIC,
        showKu,
        departIndex // Pass depart index for consistent coloring
      );
      rowNum = endRow;
      dataRowIndex++;
      allPowerRows.push(...powerRows);
      if (currentJdb) groupPowerRows.push(...powerRows);
      continue;
    }

    const row = sheet.getRow(rowNum);
    const { ks, ku } = resolveElementCoefs(el);
    const typeValue = el.type_label || '';
    const designation = el.emplacement?.trim() || '';

    row.getCell(COL_DYNAMIC.REPERE).value = el.repere;
    row.getCell(COL_DYNAMIC.TYPE).value = typeValue;
    row.getCell(COL_DYNAMIC.DESIGNATION).value = designation;
    row.getCell(COL_DYNAMIC.POWER).value = wattsToKw(el.power_w);
    row.getCell(COL_DYNAMIC.QTY).value = el.quantity;
    row.getCell(COL_DYNAMIC.KS).value = ks;
    if (showKu) {
      row.getCell(COL_DYNAMIC.KU).value = ku;
    }

    const kuCol = showKu ? colLetter(COL_DYNAMIC.KU) : '1';
    const kuValue = showKu ? `${kuCol}${rowNum}` : '1';
    row.getCell(COL_DYNAMIC.TOTAL).value = {
      formula: `${colLetter(COL_DYNAMIC.POWER)}${rowNum}*${colLetter(COL_DYNAMIC.QTY)}${rowNum}*${colLetter(COL_DYNAMIC.KS)}${rowNum}*${kuValue}`,
    };

    dataRowIndex++;
    // Apply professional row styling - color by depart instead of by line
    const rowColor = departIndex % 2 === 0 ? ALT_ROW_COLOR : DATA_ROW_COLOR;
    for (let c = 1; c <= COL_COUNT_DYNAMIC; c++) {
      row.getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowColor },
      };
    }
    for (let c = 1; c <= COL_COUNT_DYNAMIC; c++) {
      applyBorder(row.getCell(c));
    }

    allPowerRows.push(rowNum);
    if (currentJdb) groupPowerRows.push(rowNum);
  }

  flushRepereGroup();
  flushSubtotal();

  const dataStartRow = headerRow + 1;
  const dataEndRow = rowNum;
  rowNum++;
  const totalRowNum = rowNum;

  const totalRow = sheet.getRow(totalRowNum);
  const mergeEndCol = showKu ? COL_DYNAMIC.KU : COL_DYNAMIC.KS;
  safeMergeCells(sheet, totalRowNum, COL_DYNAMIC.REPERE, totalRowNum, mergeEndCol);
  totalRow.getCell(COL_DYNAMIC.REPERE).value = 'TOTAL';
  totalRow.getCell(COL_DYNAMIC.REPERE).font = { bold: true };
  totalRow.getCell(COL_DYNAMIC.REPERE).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: TOTAL_ROW_COLOR },
  };

  const powerRefs = allPowerRows.map((r) => `${colLetter(COL_DYNAMIC.TOTAL)}${r}`).join(',');
  const powerSumFormula = powerRefs ? `SUM(${powerRefs})` : '0';
  totalRow.getCell(COL_DYNAMIC.TOTAL).value = { formula: powerSumFormula };
  totalRow.getCell(COL_DYNAMIC.TOTAL).numFmt = '0.000';
  totalRow.getCell(COL_DYNAMIC.TOTAL).font = { bold: true };
  totalRow.getCell(COL_DYNAMIC.TOTAL).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: TOTAL_ROW_COLOR },
  };
  applyBorder(totalRow.getCell(COL_DYNAMIC.REPERE));
  applyBorder(totalRow.getCell(COL_DYNAMIC.TOTAL));

  const totalPowerCell = `${colLetter(COL_DYNAMIC.TOTAL)}${totalRowNum}`;
  const valueCol = COL_DYNAMIC.TOTAL;
  const ksGlobalRow = totalRowNum + 1;
  const puissanceGlobaleRow = ksGlobalRow + 1;
  const intensiteRow = puissanceGlobaleRow + 1;

  const writeSummaryLabel = (row: number, text: string, bgColor?: string): void => {
    safeMergeCells(sheet, row, COL_DYNAMIC.REPERE, row, mergeEndCol);
    const labelCell = sheet.getCell(row, COL_DYNAMIC.REPERE);
    labelCell.value = text;
    labelCell.font = { bold: true, size: 10 };
    labelCell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (bgColor) {
      labelCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bgColor },
      };
    }
    applyBorder(labelCell);
  };

  // Ks global
  writeSummaryLabel(ksGlobalRow, 'Ks global :', TOTAL_ROW_COLOR);
  const ksGlobalCell = sheet.getCell(ksGlobalRow, valueCol);
  ksGlobalCell.value = data.ksGlobal ?? 1;
  ksGlobalCell.numFmt = '0.00';
  ksGlobalCell.font = { bold: true, size: 10, color: { argb: 'FF1E3A5F' } };
  ksGlobalCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEF9C3' },
  };
  ksGlobalCell.border = {
    top: { style: 'medium', color: { argb: 'FF1E3A5F' } },
    left: { style: 'medium', color: { argb: 'FF1E3A5F' } },
    bottom: { style: 'medium', color: { argb: 'FF1E3A5F' } },
    right: { style: 'medium', color: { argb: 'FF1E3A5F' } },
  };
  ksGlobalCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorder(ksGlobalCell);

  // Puissance globale = puissance installée × Ks global
  writeSummaryLabel(puissanceGlobaleRow, 'Puissance globale :', TOTAL_ROW_COLOR);
  const ksGlobalCellAddress = `${colLetter(valueCol)}${ksGlobalRow}`;
  const puissanceGlobaleCell = `${colLetter(valueCol)}${puissanceGlobaleRow}`;
  const puissanceGlobaleValueCell = sheet.getCell(puissanceGlobaleRow, valueCol);
  puissanceGlobaleValueCell.value = {
    formula: `${totalPowerCell}*${ksGlobalCellAddress}`,
  };
  puissanceGlobaleValueCell.numFmt = '0.00 "kW"';
  puissanceGlobaleValueCell.font = { bold: true };
  puissanceGlobaleValueCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: TOTAL_ROW_COLOR },
  };
  puissanceGlobaleValueCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorder(puissanceGlobaleValueCell);

  // Intensité de calcul basée sur la puissance globale
  writeSummaryLabel(intensiteRow, 'Intensité de calcul :', TOTAL_ROW_COLOR);
  const currentCellAddress = `${colLetter(valueCol)}${intensiteRow}`;
  const intensiteValueCell = sheet.getCell(intensiteRow, valueCol);
  intensiteValueCell.value = {
    formula: excelCurrentFormula(puissanceGlobaleCell),
  };
  intensiteValueCell.numFmt = '0.00 "A"';
  intensiteValueCell.font = { bold: true };
  intensiteValueCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: TOTAL_ROW_COLOR },
  };
  intensiteValueCell.alignment = { horizontal: 'center', vertical: 'middle' };
  applyBorder(intensiteValueCell);
  // Calculate optimal column widths for A4 (orientation already calculated above)
  const optimalWidths = calculateOptimalColumnWidths(COL_COUNT_DYNAMIC, orientation);
  
  sheet.columns = optimalWidths.map(width => ({ width }));
  
  // Optimize row heights for content
  optimizeRowHeights(sheet, dataStartRow, dataEndRow);
  
  // Set print area to avoid printing empty cells
  setupPrintArea(sheet, dataEndRow, COL_COUNT_DYNAMIC);

  sheet.views = [{ state: 'frozen', ySplit: headerRow }];
  sheet.pageSetup = {
    printTitlesRow: '1:5',  // répète les lignes 1 à 5 (header + colonnes) sur chaque page imprimée
    paperSize: 9,           // A4
    orientation: orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.7,
      bottom: 0.7,
      header: 0.3,
      footer: 0.3,
    },
  };
  return {
    svgSkipped,
    meta: {
      sheetName,
      totalPowerCell: `'${sheetName}'!${totalPowerCell}`,
      currentCell: `'${sheetName}'!${currentCellAddress}`,
      locationName: data.locationName,
      panelName: data.panelName,
    },
    dataStartRow,
    dataEndRow,
    totalRowNum,
    totalPowerCell,
    currentCell: currentCellAddress,
  };
}

function createSyntheseSheet(
  workbook: ExcelJS.Workbook,
  company: CompanySettings,
  projectInfo: { name: string; client: string | null },
  sheetTitle: string,
  sheetName: string,
  panelMetas: PanelSheetMeta[]
): void {
  const sheet = workbook.addWorksheet(sheetName, { state: "visible" });

  const { headerRow } = addCompanyHeader(
    sheet,
    workbook,
    company,
    sheetTitle,
    projectInfo
  );

  // Fusion des cellules d'en-tête
  sheet.mergeCells(headerRow, 1, headerRow, 2); // A:B
  sheet.mergeCells(headerRow, 3, headerRow, 4); // C:D
  sheet.mergeCells(headerRow, 5, headerRow, 6); // E:F

  const headers = [
    { col: 1, label: "Emplacement" },
    { col: 3, label: "Tableau" },
    { col: 5, label: "P. Totale (kW)" },
    { col: 7, label: "Intensité (A)" },
  ];

  const headerRowObj = sheet.getRow(headerRow);
  headerRowObj.height = 28; // Match panel sheet header row height
  headers.forEach(({ col, label }) => {
    const cell = headerRowObj.getCell(col);

    cell.value = toCellString(label);
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: PRIMARY_COLOR },
    };

    cell.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: 10,
    };

    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
    };

    applyBorder(cell);
  });

  // Apply fill and font to second cells of merged header pairs
  const fillHeaderSecondCell = (secondCol: number) => {
    const cell = headerRowObj.getCell(secondCol);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: PRIMARY_COLOR },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorder(cell);
  };
  fillHeaderSecondCell(2); // B (second cell of A:B merge)
  fillHeaderSecondCell(4); // D (second cell of C:D merge)
  fillHeaderSecondCell(6); // F (second cell of E:F merge)

  let rowNum = headerRow;
  let dataRowIndex = 0;
  let locationIndex = 0; // Track location index for coloring by location

  // Group panels by location to merge location cells
  const groupedByLocation: Record<string, PanelSheetMeta[]> = {};
  for (const meta of panelMetas) {
    const locationKey = meta.locationName.trim();
    if (!groupedByLocation[locationKey]) {
      groupedByLocation[locationKey] = [];
    }
    groupedByLocation[locationKey].push(meta);
  }

  for (const locationName in groupedByLocation) {
    const panels = groupedByLocation[locationName]!;
    const firstRowOfGroup = rowNum + 1;

    // Determine color for this location (same logic as depart coloring)
    const locationColor = locationIndex % 2 === 0 ? ALT_ROW_COLOR : DATA_ROW_COLOR;

    // First, create all rows without setting location value and without any merge for A:B
    for (const meta of panels) {
      rowNum++;
      dataRowIndex++;

      // Fusion des cellules de données - sauter A:B pour l'instant
      safeMergeCells(sheet, rowNum, 3, rowNum, 4); // C:D
      safeMergeCells(sheet, rowNum, 5, rowNum, 6); // E:F

      const row = sheet.getRow(rowNum);
      row.height = 28; // Match panel sheet data row height

      row.getCell(3).value = toCellString(meta.panelName);
      row.getCell(5).value = { formula: meta.totalPowerCell };
      row.getCell(7).value = { formula: meta.currentCell };

      // Alignement
      [1, 3, 5, 7].forEach((col) => {
        row.getCell(col).alignment = {
          horizontal: "center",
          vertical: "middle",
        };
      });

      // Bordures sur toutes les colonnes utilisées (A à G)
      for (let c = 1; c <= 7; c++) {
        applyBorder(row.getCell(c));
      }

      // Apply location-based coloring - same color for all rows in this location
      for (let c = 1; c <= 7; c++) {
        const cell = row.getCell(c);
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: locationColor },
        };
      }
    }

    // Merge location cells as a single merged area (both columns A and B together)
    if (panels.length > 1) {
      safeMergeCells(sheet, firstRowOfGroup, 1, rowNum, 2); // A:B merged vertically across all rows
    } else {
      // Single panel - just merge horizontally
      safeMergeCells(sheet, firstRowOfGroup, 1, firstRowOfGroup, 2); // A:B merged horizontally
    }
    // Set location name in the top-left cell of the merged area
    sheet.getCell(firstRowOfGroup, 1).value = toCellString(locationName);

    // Increment location index for next location
    locationIndex++;
  }

  // Calculate optimal orientation and column widths for A4
  const orientation = determineOptimalOrientation(7);
  const optimalWidths = calculateOptimalColumnWidths(7, orientation);
  
  // Adjust for synthese sheet structure (merged columns)
  sheet.columns = [
    { width: optimalWidths[0] }, // A - Emplacement (part 1)
    { width: optimalWidths[0] }, // B - Emplacement (part 2) - same width for merge
    { width: optimalWidths[1] }, // C - Tableau (part 1)
    { width: optimalWidths[1] }, // D - Tableau (part 2) - same width for merge
    { width: optimalWidths[4] }, // E - P. Totale (part 1)
    { width: optimalWidths[4] }, // F - P. Totale (part 2) - same width for merge
    { width: optimalWidths[6] }, // G - Intensité
  ];
  
  // Set print area for synthese sheet
  setupPrintArea(sheet, rowNum, 7);

  sheet.views = [{ state: 'frozen', ySplit: headerRow }];
  sheet.pageSetup = {
    printTitlesRow: '1:5',
    paperSize: 9,
    orientation: orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.7,
      bottom: 0.7,
      header: 0.3,
      footer: 0.3,
    },
  };
}

function buildWorkbookFromPanels(
  workbook: ExcelJS.Workbook,
  company: CompanySettings,
  project: { name: string; client: string | null },
  panels: Array<{
    locationName: string;
    panelName: string;
    elements: ElementRow[];
    sheetName?: string;
    ksGlobal?: number;
  }>,
  syntheseTitle: string
): { filePath: null; warning?: string } | { svgWarning: boolean; panelMetas: PanelSheetMeta[] } {
  let svgWarning = false;
  const panelMetas: PanelSheetMeta[] = [];

  for (const panel of panels) {
    const sheetTitle = `BILAN DE PUISSANCE — ${panel.panelName} — ${panel.locationName}`;
    const result = createPanelSheet(workbook, {
      projectName: project.name,
      projectClient: project.client,
      locationName: panel.locationName,
      panelName: panel.panelName,
      elements: panel.elements,
      company,
      sheetTitle,
      sheetName: panel.sheetName ?? panel.panelName,
      ksGlobal: panel.ksGlobal,
    });
    if (result.svgSkipped) svgWarning = true;
    panelMetas.push(result.meta);
  }

  if (panelMetas.length > 0) {
    createSyntheseSheet(workbook, company, project, syntheseTitle, 'SYNTHESE', panelMetas);
  }

  return { svgWarning, panelMetas };
}

export async function exportLocationToExcel(
  locationId: number,
  companyFromRenderer?: CompanySettings,
  panelIds?: number[]
): Promise<ExcelExportResult> {
  const company = companyFromRenderer ?? getCompanySettings();
  const project = getProjectForLocation(locationId);
  const location = getLocationById(locationId);
  if (!location || !project) {
    throw new Error('Location or project not found');
  }

  const allPanels = getPanelsByLocation(locationId);
  const panels = allPanels.filter(
    (panel) => !panelIds || panelIds.length === 0 || panelIds.includes(panel.id)
  );

  const selectedPanelNames =
    panelIds && panelIds.length > 0 && panelIds.length < allPanels.length
      ? panels.map((p) => sanitizeFileName(p.name)).join('_')
      : null;
  const defaultName = selectedPanelNames
    ? `${sanitizeFileName(project.name)}_${sanitizeFileName(location.name)}_${selectedPanelNames}.xlsx`
    : `${sanitizeFileName(project.name)}_${sanitizeFileName(location.name)}.xlsx`;

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exporter le bilan de puissance',
    defaultPath: defaultName,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });

  if (canceled || !filePath) return { filePath: null };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BilPow';
  workbook.created = new Date();
  const panelInputs = panels.map((panel) => ({
    locationName: location.name,
    panelName: panel.name,
    elements: getElementsByPanel(panel.id),
    ksGlobal: panel.coef_ks ?? 1,
  }));

  const buildResult = buildWorkbookFromPanels(
    workbook,
    company,
    { name: project.name, client: project.client },
    panelInputs,
    `SYNTHESE — ${location.name}`
  );

  await workbook.xlsx.writeFile(filePath);

  const result: ExcelExportResult = { filePath };
  if ('svgWarning' in buildResult && buildResult.svgWarning) {
    result.warning =
      'Note : les logos SVG ne sont pas supportés dans Excel. Le nom de la société sera affiché à la place. Utilisez un PNG pour un rendu optimal.';
  }
  return result;
}

export async function exportProjectToExcel(
  payload: ProjectExcelExportPayload,
  companyFromRenderer?: CompanySettings
): Promise<ExcelExportResult> {
  const company = companyFromRenderer ?? getCompanySettings();

  const defaultName = `${sanitizeFileName(payload.project.name)}_Complet.xlsx`;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exporter le projet complet',
    defaultPath: defaultName,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });

  if (canceled || !filePath) return { filePath: null };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BilPow';
  workbook.created = new Date();

  const panelInputs: Array<{
    locationName: string;
    panelName: string;
    elements: ElementRow[];
    sheetName: string;
    ksGlobal: number;
  }> = [];

  for (const location of payload.locations) {
    const panels = payload.panelsByLocation[location.id] ?? [];
    for (const panel of panels) {
      const elements = payload.elementsByPanel[panel.id] ?? [];
      if (elements.length === 0) continue;
      const baseSheetName = `${location.name}-${panel.name}`;
      panelInputs.push({
        locationName: location.name,
        panelName: panel.name,
        elements,
        sheetName: baseSheetName,
        ksGlobal: panel.coef_ks ?? 1,
      });
    }
  }

  const allPanelMetas: PanelSheetMeta[] = [];
  let svgWarning = false;

  for (const panel of panelInputs) {
    const sheetTitle = `BILAN DE PUISSANCE — ${panel.panelName} — ${panel.locationName}`;
    const result = createPanelSheet(workbook, {
      projectName: payload.project.name,
      projectClient: payload.project.client,
      locationName: panel.locationName,
      panelName: panel.panelName,
      elements: panel.elements,
      company,
      sheetTitle,
      sheetName: panel.sheetName,
      ksGlobal: panel.ksGlobal,
    });
    if (result.svgSkipped) svgWarning = true;
    allPanelMetas.push(result.meta);
  }

  // Add synthesis sheet for complete project export
  if (allPanelMetas.length > 0) {
    createSyntheseSheet(workbook, company, payload.project, 'SYNTHESE — PROJET COMPLET', 'SYNTHESE', allPanelMetas);
  }

  await workbook.xlsx.writeFile(filePath);

  const result: ExcelExportResult = { filePath };
  if (svgWarning) {
    result.warning =
      'Note : les logos SVG ne sont pas supportés dans Excel. Le nom de la société sera affiché à la place. Utilisez un PNG pour un rendu optimal.';
  }
  return result;
}

function getProjectForLocation(locationId: number) {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT p.* FROM projects p
       JOIN locations l ON l.project_id = p.id
       WHERE l.id = ?`
    )
    .get(locationId) as ReturnType<typeof getProjectById>;
  return row;
}

export async function exportProjectToExcelFromDb(
  projectId: number,
  companyFromRenderer?: CompanySettings
): Promise<ExcelExportResult> {
  const project = getProjectById(projectId);
  if (!project) throw new Error('Project not found');

  const locations = getLocationsByProject(projectId);
  const panelsByLocation: Record<number, PanelWithStats[]> = {};
  const elementsByPanel: Record<number, ElementRow[]> = {};

  for (const loc of locations) {
    panelsByLocation[loc.id] = getPanelsByLocation(loc.id);
    for (const panel of panelsByLocation[loc.id]!) {
      elementsByPanel[panel.id] = getElementsByPanel(panel.id);
    }
  }

  return exportProjectToExcel(
    { project, locations, panelsByLocation, elementsByPanel },
    companyFromRenderer
  );
}
