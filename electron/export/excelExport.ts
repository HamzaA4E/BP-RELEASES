import ExcelJS from 'exceljs';
import { dialog } from 'electron';
import { getDatabase } from '../database/db';
import { getProjectById } from '../database/projects';
import { getLocationById, getLocationsByProject } from '../database/locations';
import { getPanelsByLocation } from '../database/panels';
import { getElementsByPanel } from '../database/elements';
import { getCompanySettings } from '../database/settings';
import type {
  CompanySettings,
  ExcelExportResult,
  ProjectExcelExportPayload,
  PanelWithStats,
} from '../../shared/types';
import type { ElementRow } from '../database/elements';
import { panelPowerSummary, resolveElementCoefs } from '../../shared/powerCalculations';

const PRIMARY_COLOR = 'FF1E3A5F';
const ALT_ROW_COLOR = 'FFF8F9FA';
const TOTAL_ROW_COLOR = 'FFDBEAFE';
const SUBTOTAL_ROW_COLOR = 'FFEFF6FF';
const PROJECT_INFO_COLOR = 'FFE8F0FE';

const COL = {
  REPERE: 1,
  DESIGNATION: 2,
  POWER: 3,
  QTY: 4,
  KS: 5,
  KU: 6,
  TOTAL: 7,
  DISTANCE: 8,
  DROP: 9,
  SECTION: 10,
} as const;

const COL_COUNT = 10;

const STANDARD_SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50] as const;

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

function buildCompanyInfoRichText(company: CompanySettings): ExcelJS.CellValue {
  type RichPart = ExcelJS.RichText;
  const parts: RichPart[] = [];
  const name = toCellString(company.company_name || '');
  if (name) {
    parts.push({
      text: `${name}\n`,
      font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
    });
  }
  if (company.address) {
    parts.push({
      text: `${toCellString(company.address)}\n`,
      font: { color: { argb: 'FFBFDBFE' }, size: 9 },
    });
  }
  if (company.phone) {
    parts.push({
      text: `Tel: ${toCellString(company.phone)}   `,
      font: { color: { argb: 'FFBFDBFE' }, size: 9 },
    });
  }
  if (company.email) {
    parts.push({
      text: `Email: ${toCellString(company.email)}`,
      font: { color: { argb: 'FFBFDBFE' }, size: 9 },
    });
  }
  if (parts.length === 0) return '';
  return { richText: parts };
}

function isValidImageBase64(b64: string): boolean {
  try {
    const buf = Buffer.from(stripBase64Prefix(b64), 'base64');
    return buf.length >= 8;
  } catch {
    return false;
  }
}

function addWorksheetLogo(
  workbook: ExcelJS.Workbook,
  worksheet: ExcelJS.Worksheet,
  company: CompanySettings
): boolean {
  if (
    !company.logo_base64 ||
    !company.logo_mime ||
    company.logo_mime === 'image/svg+xml' ||
    !isValidImageBase64(company.logo_base64)
  ) {
    return false;
  }
  const mime = company.logo_mime.toLowerCase();
  const ext = mime.includes('png') ? 'png' : 'jpeg';
  const imageId = workbook.addImage({
    base64: stripBase64Prefix(company.logo_base64),
    extension: ext,
  });
  // Ancrage sur la ligne 1 uniquement — évite le conflit avec la fusion de la ligne 2.
  worksheet.addImage(imageId, {
    tl: { col: 0.05, row: 0.05 },
    br: { col: 2.95, row: 0.95 },
    editAs: 'oneCell',
  } as ExcelJS.ImageRange & { editAs: string });
  return true;
}

function addCompanyHeader(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  company: CompanySettings,
  title: string,
  projectInfo: { name: string; client: string | null }
): { headerRow: number; svgSkipped: boolean } {
  worksheet.getRow(1).height = 55;
  worksheet.getRow(2).height = 18;
  worksheet.getRow(3).height = 6;

  let svgSkipped = false;

  // Toutes les fusions d'en-tête avant l'image (l'ancrage image peut fusionner des cellules).
  safeMergeCells(worksheet, 1, 1, 1, 3);
  safeMergeCells(worksheet, 1, 4, 1, 7);
  safeMergeCells(worksheet, 1, 8, 1, COL_COUNT);
  safeMergeCells(worksheet, 2, 1, 2, COL_COUNT);

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

  const titleCell = worksheet.getCell(1, 4);
  titleCell.value = toCellString(title);
  titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PRIMARY_COLOR },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  const infoCell = worksheet.getCell(1, 8);
  infoCell.value = buildCompanyInfoRichText(company);
  infoCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PRIMARY_COLOR },
  };
  infoCell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };

  const projectCell = worksheet.getCell(2, 1);
  const clientPart = projectInfo.client ? ` | Client : ${projectInfo.client}` : '';
  projectCell.value = toCellString(
    `Projet : ${projectInfo.name}${clientPart} | Date : ${formatExportDate()}`
  );
  projectCell.font = { size: 10, color: { argb: 'FF1E3A5F' } };
  projectCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PROJECT_INFO_COLOR },
  };
  projectCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  return { headerRow: 4, svgSkipped };
}

function isJeuDeBarresRow(el: { type?: string; row_kind?: string }): boolean {
  return el.type === 'jeu_de_barres' || el.row_kind === 'bar_set';
}

function jdbCategoryLabelExcel(category: string | null | undefined): string {
  if (category === 'prise') return 'Prise de courant';
  return 'Éclairage';
}

function recommendedCableSection(
  distanceM: number,
  powerW: number,
  quantity: number,
  ks: number
): number {
  if (distanceM <= 0 || powerW <= 0 || quantity <= 0) return 2.5;
  const effectivePower = powerW * quantity * ks;
  for (const section of STANDARD_SECTIONS) {
    const drop =
      ((2 * distanceM * effectivePower) / (56 * 230 * section * 230)) * 100;
    if (drop <= 3) return section;
  }
  return STANDARD_SECTIONS[STANDARD_SECTIONS.length - 1] ?? 50;
}

function writeJeuDeBarresExcelRow(
  sheet: ExcelJS.Worksheet,
  rowNum: number,
  el: ElementRow
): void {
  const title = el.type_label?.trim() || el.designation?.trim() || 'Jeu de barres';
  const category = jdbCategoryLabelExcel(el.jdb_category);
  safeMergeCells(sheet, rowNum, 1, rowNum, COL_COUNT);
  const cell = sheet.getCell(rowNum, 1);
  cell.value = toCellString(`${title}  —  Jeu de barres · ${category}`);
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PRIMARY_COLOR },
  };
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(rowNum).height = 26;
  applyBorder(cell);
}

function writeSubtotalRow(
  sheet: ExcelJS.Worksheet,
  rowNum: number,
  label: string,
  sumFormula: string
): void {
  safeMergeCells(sheet, rowNum, COL.REPERE, rowNum, COL.DESIGNATION);
  const labelCell = sheet.getCell(rowNum, COL.REPERE);
  labelCell.value = toCellString(label);
  labelCell.font = { bold: true, italic: true, size: 10 };
  labelCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  labelCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: SUBTOTAL_ROW_COLOR },
  };

  const totalCell = sheet.getCell(rowNum, COL.TOTAL);
  totalCell.value = { formula: sumFormula };
  totalCell.font = { bold: true, italic: true, size: 10 };
  totalCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: SUBTOTAL_ROW_COLOR },
  };

  for (let c = 1; c <= COL_COUNT; c++) {
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
  }
): PanelSheetResult {
  const sheetName = uniqueSheetName(workbook, data.sheetName);
  const sheet = workbook.addWorksheet(sheetName);

  const { headerRow, svgSkipped } = addCompanyHeader(
    sheet,
    workbook,
    data.company,
    data.sheetTitle,
    { name: data.projectName, client: data.projectClient }
  );

  const headers = [
    'Repère',
    'Désignation',
    'P. Unitaire (W)',
    'Qté',
    'Ks',
    'Ku',
    'P. totale (W)',
    'Distance (m)',
    'Chute de tension (%)',
    'Section câble',
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

  let rowNum = headerRow;
  let dataRowIndex = 0;
  let currentJdb: ElementRow | null = null;
  let groupPowerRows: number[] = [];
  const allPowerRows: number[] = [];

  const flushSubtotal = (): void => {
    if (!currentJdb || groupPowerRows.length === 0) return;
    rowNum++;
    const first = groupPowerRows[0]!;
    const last = groupPowerRows[groupPowerRows.length - 1]!;
    const sumFormula = `SUM(${colLetter(COL.TOTAL)}${first}:${colLetter(COL.TOTAL)}${last})`;
    const jdbTitle =
      currentJdb.type_label?.trim() ||
      currentJdb.designation?.trim() ||
      'Jeu de barres';
    writeSubtotalRow(sheet, rowNum, `Sous-total ${jdbTitle}`, sumFormula);
    groupPowerRows = [];
  };

  for (const el of data.elements) {
    rowNum++;

    if (isJeuDeBarresRow(el)) {
      flushSubtotal();
      currentJdb = el;
      writeJeuDeBarresExcelRow(sheet, rowNum, el);
      continue;
    }

    const row = sheet.getRow(rowNum);
    const { ks, ku } = resolveElementCoefs(el);
    const designation = el.emplacement?.trim() || el.type_label || '';
    const section = recommendedCableSection(
      el.distance_m,
      el.power_w,
      el.quantity,
      ks
    );

    row.getCell(COL.REPERE).value = toCellValue(el.repere);
    row.getCell(COL.DESIGNATION).value = toCellValue(designation);
    row.getCell(COL.POWER).value = el.power_w;
    row.getCell(COL.QTY).value = el.quantity;
    row.getCell(COL.KS).value = ks;
    row.getCell(COL.KU).value = ku === 1 ? '' : ku;
    row.getCell(COL.TOTAL).value = {
      formula: `${colLetter(COL.POWER)}${rowNum}*${colLetter(COL.QTY)}${rowNum}*${colLetter(COL.KS)}${rowNum}`,
    };
    row.getCell(COL.DISTANCE).value = el.distance_m;
    row.getCell(COL.DROP).value = {
      formula: `(2*${colLetter(COL.DISTANCE)}${rowNum}*${colLetter(COL.POWER)}${rowNum}*${colLetter(COL.QTY)}${rowNum}*${colLetter(COL.KS)}${rowNum})/(56*230*${colLetter(COL.SECTION)}${rowNum}*230)*100`,
    };
    row.getCell(COL.SECTION).value = section;

    dataRowIndex++;
    if (dataRowIndex % 2 === 0) {
      for (let c = 1; c <= COL_COUNT; c++) {
        row.getCell(c).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: ALT_ROW_COLOR },
        };
      }
    }
    for (let c = 1; c <= COL_COUNT; c++) {
      applyBorder(row.getCell(c));
    }

    allPowerRows.push(rowNum);
    if (currentJdb) groupPowerRows.push(rowNum);
  }

  flushSubtotal();

  const dataStartRow = headerRow + 1;
  const dataEndRow = rowNum;
  rowNum++;
  const totalRowNum = rowNum;

  const totalRow = sheet.getRow(totalRowNum);
  safeMergeCells(sheet, totalRowNum, COL.REPERE, totalRowNum, COL.KU);
  totalRow.getCell(COL.REPERE).value = 'TOTAL';
  totalRow.getCell(COL.REPERE).font = { bold: true };
  totalRow.getCell(COL.REPERE).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: TOTAL_ROW_COLOR },
  };

  const powerRefs = allPowerRows.map((r) => `${colLetter(COL.TOTAL)}${r}`).join(',');
  const powerSumFormula = powerRefs ? `SUM(${powerRefs})` : '0';
  totalRow.getCell(COL.TOTAL).value = { formula: powerSumFormula };
  totalRow.getCell(COL.TOTAL).font = { bold: true };
  totalRow.getCell(COL.TOTAL).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: TOTAL_ROW_COLOR },
  };
  applyBorder(totalRow.getCell(COL.REPERE));
  applyBorder(totalRow.getCell(COL.TOTAL));

  const totalPowerCell = `${colLetter(COL.TOTAL)}${totalRowNum}`;
  const summaryStart = totalRowNum + 2;

  sheet.getCell(summaryStart, 1).value = 'Puissance installée :';
  sheet.getCell(summaryStart, 1).font = { bold: true, size: 10 };
  sheet.getCell(summaryStart, 2).value = { formula: totalPowerCell };
  sheet.getCell(summaryStart, 3).value = 'W';

  const currentRowNum = summaryStart + 1;
  sheet.getCell(currentRowNum, 1).value = 'Intensité de calcul :';
  sheet.getCell(currentRowNum, 1).font = { bold: true, size: 10 };
  const currentCellAddress = `${colLetter(2)}${currentRowNum}`;
  sheet.getCell(currentRowNum, 2).value = {
    formula: `${totalPowerCell}/(230*0.8)`,
  };
  sheet.getCell(currentRowNum, 3).value = 'A';

  const summary = panelPowerSummary(data.elements);
  const breakerRow = currentRowNum + 1;
  sheet.getCell(breakerRow, 1).value = 'DJ recommandé :';
  sheet.getCell(breakerRow, 1).font = { bold: true, size: 10 };
  sheet.getCell(breakerRow, 2).value = summary.breaker;
  sheet.getCell(breakerRow, 3).value = 'A';

  sheet.columns = [
    { width: 10 },
    { width: 28 },
    { width: 14 },
    { width: 6 },
    { width: 6 },
    { width: 6 },
    { width: 14 },
    { width: 12 },
    { width: 16 },
    { width: 12 },
  ];

  sheet.views = [{ state: 'frozen', ySplit: headerRow }];

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
  const sheet = workbook.addWorksheet(sheetName, { state: 'visible' });
  const { headerRow } = addCompanyHeader(
    sheet,
    workbook,
    company,
    sheetTitle,
    projectInfo
  );

  const headers = [
    'Emplacement',
    'Tableau',
    'P. installée (W)',
    'Intensité (A)',
    'DJ recommandé (A)',
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
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    applyBorder(cell);
  });

  let rowNum = headerRow;
  for (const meta of panelMetas) {
    rowNum++;
    const row = sheet.getRow(rowNum);
    row.getCell(1).value = toCellString(meta.locationName);
    row.getCell(2).value = toCellString(meta.panelName);
    row.getCell(3).value = { formula: meta.totalPowerCell };
    row.getCell(4).value = { formula: meta.currentCell };
    const currentFormula = meta.currentCell;
    row.getCell(5).value = {
      formula: `IF(${currentFormula}<=10,10,IF(${currentFormula}<=16,16,IF(${currentFormula}<=20,20,IF(${currentFormula}<=25,25,IF(${currentFormula}<=32,32,IF(${currentFormula}<=40,40,IF(${currentFormula}<=50,50,IF(${currentFormula}<=63,63,IF(${currentFormula}<=80,80,IF(${currentFormula}<=100,100,IF(${currentFormula}<=125,125,IF(${currentFormula}<=160,160,200))))))))))))`,
    };
    for (let c = 1; c <= 5; c++) applyBorder(row.getCell(c));
  }

  sheet.columns = [
    { width: 22 },
    { width: 22 },
    { width: 18 },
    { width: 14 },
    { width: 16 },
  ];
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
  companyFromRenderer?: CompanySettings
): Promise<ExcelExportResult> {
  const company = companyFromRenderer ?? getCompanySettings();
  const project = getProjectForLocation(locationId);
  const location = getLocationById(locationId);
  if (!location || !project) {
    throw new Error('Location or project not found');
  }

  const defaultName = `${sanitizeFileName(project.name)}_${sanitizeFileName(location.name)}.xlsx`;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exporter le bilan de puissance',
    defaultPath: defaultName,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });

  if (canceled || !filePath) return { filePath: null };

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BilPow';
  workbook.created = new Date();

  const panels = getPanelsByLocation(locationId);
  const panelInputs = panels.map((panel) => ({
    locationName: location.name,
    panelName: panel.name,
    elements: getElementsByPanel(panel.id),
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
    });
    if (result.svgSkipped) svgWarning = true;
    allPanelMetas.push(result.meta);
  }

  if (allPanelMetas.length > 0) {
    createSyntheseSheet(
      workbook,
      company,
      { name: payload.project.name, client: payload.project.client },
      'SYNTHESE GENERALE',
      'SYNTHESE GENERALE',
      allPanelMetas
    );
    const generalSheet = workbook.getWorksheet('SYNTHESE GENERALE');
    if (generalSheet) {
      const idx = workbook.worksheets.indexOf(generalSheet);
      if (idx > 0) {
        workbook.worksheets.splice(idx, 1);
        workbook.worksheets.unshift(generalSheet);
      }
    }
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
