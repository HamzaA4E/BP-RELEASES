import ExcelJS from 'exceljs';
import { dialog } from 'electron';
import { getDatabase } from '../database/db';
import { getProjectById } from '../database/projects';
import { getLocationById } from '../database/locations';
import { getPanelsByLocation } from '../database/panels';
import { getElementsByPanel } from '../database/elements';
import { getCompanySettings } from '../database/settings';
import type { CompanySettings, ExcelExportResult } from '../../shared/types';

const PRIMARY_COLOR = 'FF1E3A5F';
const ALT_ROW_COLOR = 'FFF8F9FA';
const TOTAL_ROW_COLOR = 'FFDBEAFE';
const COL_COUNT = 11;

const STANDARD_BREAKERS = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200];

function recommendedBreaker(current: number): number {
  const breaker = STANDARD_BREAKERS.find((b) => b >= current);
  return breaker !== undefined
    ? breaker
    : STANDARD_BREAKERS[STANDARD_BREAKERS.length - 1]!;
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31);
}

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

function applyBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };
}

function stripBase64Prefix(b64: string): string {
  const idx = b64.indexOf('base64,');
  return idx >= 0 ? b64.slice(idx + 7) : b64;
}

/** Strip characters illegal in OOXML shared strings. */
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

function buildCompanyInfoRichText(
  company: CompanySettings
): ExcelJS.CellValue {
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

  // tl+ext+editAs on oneCellAnchor is invalid OOXML; use twoCellAnchor (tl+br).
  worksheet.addImage(imageId, {
    tl: { col: 0, row: 0 },
    br: { col: 3, row: 1 },
    editAs: 'twoCell',
  } as ExcelJS.ImageRange & { editAs: string });
  return true;
}

function addCompanyHeader(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  company: CompanySettings,
  title: string
): { headerRow: number; svgSkipped: boolean } {
  worksheet.getRow(1).height = 55;
  worksheet.getRow(2).height = 16;
  worksheet.getRow(3).height = 6;

  let svgSkipped = false;

  worksheet.mergeCells('A1:C1');
  const logoCell = worksheet.getCell('A1');
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

  worksheet.mergeCells('D1:G1');
  const titleCell = worksheet.getCell('D1');
  titleCell.value = toCellString(title);
  titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PRIMARY_COLOR },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  worksheet.mergeCells('H1:K1');
  const infoCell = worksheet.getCell('H1');
  infoCell.value = buildCompanyInfoRichText(company);
  infoCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PRIMARY_COLOR },
  };
  infoCell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };

  worksheet.mergeCells('A2:K2');
  const subCell = worksheet.getCell('A2');
  subCell.value = toCellString(
    `Date : ${new Date().toLocaleDateString('fr-FR')}     ${company.website || ''}`
  );
  subCell.font = { italic: true, size: 9, color: { argb: 'FF475569' } };
  subCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFDBEAFE' },
  };
  subCell.alignment = { vertical: 'middle', horizontal: 'center' };

  return { headerRow: 4, svgSkipped };
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
  const panelDataList: Array<{
    panelName: string;
    elements: ReturnType<typeof getElementsByPanel>;
    installed: number;
    absorbed: number;
    current: number;
    breaker: number;
  }> = [];

  for (const panel of panels) {
    const elements = getElementsByPanel(panel.id);
    const installed = elements
      .filter((e) => {
        const el = e as { row_kind?: string; type?: string };
        return el.type !== 'jeu_de_barres' && el.row_kind !== 'bar_set';
      })
      .reduce((s, e) => s + e.power_w * e.quantity, 0);
    const absorbed = installed * 0.8;
    const current = absorbed / (230 * 0.8);
    const breaker = recommendedBreaker(current);

    panelDataList.push({
      panelName: panel.name,
      elements,
      installed,
      absorbed,
      current,
      breaker,
    });
  }

  let svgWarning = false;

  for (const panelData of panelDataList) {
    const sheetTitle = `BILAN DE PUISSANCE — ${panelData.panelName} — ${location.name}`;
    const panelResult = createPanelSheet(workbook, {
      projectName: project.name,
      locationName: location.name,
      panelName: panelData.panelName,
      elements: panelData.elements,
      installed: panelData.installed,
      absorbed: panelData.absorbed,
      current: panelData.current,
      breaker: panelData.breaker,
      company,
      sheetTitle,
    });
    if (panelResult.svgSkipped) svgWarning = true;
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

function jdbCategoryLabelExcel(category: string | null | undefined): string {
  if (category === 'prise') return 'Prise de courant';
  return 'Éclairage';
}

function isJeuDeBarresRow(el: {
  type?: string;
  row_kind?: string;
}): boolean {
  return el.type === 'jeu_de_barres' || el.row_kind === 'bar_set';
}

function elementCategoryLabel(el: {
  type: string;
  row_kind?: string;
}): string {
  if (isJeuDeBarresRow(el)) return 'Jeu de barres';
  if (el.type === 'eclairage') return 'Éclairage';
  if (el.type === 'prise') return 'Prise';
  if (el.type === 'attente') return 'Attente';
  return el.type;
}

function calcUsedPower(el: {
  type: string;
  power_w: number;
  quantity: number;
  coef_ks?: number;
  coef_ku?: number;
  coef_fp?: number;
  ks?: number;
  ku?: number;
  fp?: number;
}): number {
  if (el.type === 'attente' || el.type === 'jeu_de_barres') return 0;
  const ks = el.coef_ks ?? el.ks ?? 1;
  const ku = el.coef_ku ?? el.ku ?? 1;
  const fp = el.coef_fp ?? el.fp ?? 1;
  return Math.round(el.power_w * el.quantity * ks * ku * fp);
}

function writeJeuDeBarresExcelRow(
  sheet: ExcelJS.Worksheet,
  rowNum: number,
  el: ReturnType<typeof getElementsByPanel>[number],
  colCount: number
): void {
  const title =
    (el as { type_label?: string }).type_label?.trim() ||
    el.designation?.trim() ||
    'Jeu de barres';
  const category = jdbCategoryLabelExcel(
    (el as { jdb_category?: string | null }).jdb_category
  );

  sheet.mergeCells(rowNum, 1, rowNum, colCount);
  const cell = sheet.getCell(rowNum, 1);
  cell.value = toCellString(`${title}  —  Jeu de barres · ${category}`);
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PRIMARY_COLOR },
  };
  cell.font = { bold: true, color: { argb: 'FF4A6B8A' }, size: 11 };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(rowNum).height = 26;
  applyBorder(cell);
}

function createPanelSheet(
  workbook: ExcelJS.Workbook,
  data: {
    projectName: string;
    locationName: string;
    panelName: string;
    elements: ReturnType<typeof getElementsByPanel>;
    installed: number;
    absorbed: number;
    current: number;
    breaker: number;
    company: CompanySettings;
    sheetTitle: string;
  }
): { svgSkipped: boolean } {
  const sheetName = sanitizeSheetName(data.panelName);
  const sheet = workbook.addWorksheet(sheetName);

  const { headerRow, svgSkipped } = addCompanyHeader(
    sheet,
    workbook,
    data.company,
    data.sheetTitle
  );

  const headers = [
    'Catégorie',
    'Repère',
    'Type',
    'Désignation',
    'P. Unitaire (W)',
    'Qté',
    'Ks',
    'Ku',
    'FP',
    'P. totale (W)',
    'P. Utile (W)',
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

  let totalPower = 0;
  let totalUsed = 0;
  let dataRowIndex = 0;
  data.elements.forEach((el, index) => {
    const rowNum = headerRow + 1 + index;
    const isJdb = isJeuDeBarresRow(el);

    if (isJdb) {
      writeJeuDeBarresExcelRow(sheet, rowNum, el, COL_COUNT);
      return;
    }

    const row = sheet.getRow(rowNum);
    const totalEl = el.power_w * el.quantity;
    const usedEl = calcUsedPower(el);
    totalPower += totalEl;
    totalUsed += usedEl;

    const typeLabel =
      (el as { type_label?: string }).type_label ||
      el.designation ||
      (el.type === 'prise'
        ? (el as { phase_type?: string }).phase_type === 'tri'
          ? 'Triphasé'
          : 'Monophasé'
        : '');
    const emplacement = (el as { emplacement?: string }).emplacement ?? '';
    const ks = (el as { coef_ks?: number }).coef_ks ?? (el as { ks?: number }).ks ?? 1;
    const ku = (el as { coef_ku?: number }).coef_ku ?? (el as { ku?: number }).ku ?? 1;
    const fp = (el as { coef_fp?: number }).coef_fp ?? (el as { fp?: number }).fp ?? 1;

    const values = [
      elementCategoryLabel(el),
      el.repere,
      typeLabel,
      emplacement,
      el.power_w,
      el.quantity,
      ks,
      ku,
      fp,
      totalEl,
      usedEl > 0 ? usedEl : '',
    ];
    dataRowIndex++;

    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = toCellValue(v);
      if (dataRowIndex % 2 === 0) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: ALT_ROW_COLOR },
        };
      }
      applyBorder(cell);
    });
  });

  const totalRowNum = headerRow + 1 + data.elements.length;
  const totalRow = sheet.getRow(totalRowNum);
  sheet.mergeCells(totalRowNum, 1, totalRowNum, 9);
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(10).value = totalPower;
  totalRow.getCell(11).value = totalUsed;
  for (const c of [1, 10, 11]) {
    const cell = totalRow.getCell(c);
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: TOTAL_ROW_COLOR },
    };
    cell.font = { bold: true };
    applyBorder(cell);
  }

  const summaryStart = totalRowNum + 2;
  const summaryLines = [
    `Puissance installée totale: ${Math.round(data.installed)} W`,
    // `Puissance absorbée (ks=0.8): ${Math.round(data.absorbed)} W`,
    // `Intensité de calcul: ${Math.round(data.current * 100) / 100} A`,
    // `Disjoncteur général recommandé: ${data.breaker} A`,
  ];

  summaryLines.forEach((line, i) => {
    const cell = sheet.getCell(summaryStart + i, 1);
    cell.value = toCellString(line);
    cell.font = { bold: i === summaryLines.length - 1, size: 10 };
  });

  sheet.columns = [
    { width: 10 },
    { width: 10 },
    { width: 28 },
    { width: 22 },
    { width: 12 },
    { width: 6 },
    { width: 6 },
    { width: 6 },
    { width: 6 },
    { width: 12 },
    { width: 12 },
  ];

  sheet.views = [{ state: 'frozen', ySplit: headerRow }];
  return { svgSkipped };
}
