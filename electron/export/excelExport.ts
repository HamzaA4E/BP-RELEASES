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

interface ProjectInfo {
  name: string;
  engineer: string | null;
}

function addCompanyHeader(
  worksheet: ExcelJS.Worksheet,
  workbook: ExcelJS.Workbook,
  company: CompanySettings,
  title: string,
  project: ProjectInfo
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

  const canEmbedLogo =
    company.logo_base64 &&
    company.logo_mime &&
    company.logo_mime !== 'image/svg+xml';

  if (canEmbedLogo) {
    const ext = company.logo_mime.includes('png') ? 'png' : 'jpeg';
    const imageId = workbook.addImage({
      base64: stripBase64Prefix(company.logo_base64),
      extension: ext,
    });
    worksheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 180, height: 52 },
      editAs: 'oneCell',
    });
  } else {
    if (company.logo_base64 && company.logo_mime === 'image/svg+xml') {
      svgSkipped = true;
    }
    logoCell.value = company.company_name || 'BilPow';
    logoCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
    logoCell.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  worksheet.mergeCells('D1:F1');
  const titleCell = worksheet.getCell('D1');
  titleCell.value = title;
  titleCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PRIMARY_COLOR },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  worksheet.mergeCells('G1:I1');
  const infoCell = worksheet.getCell('G1');
  infoCell.value = {
    richText: [
      {
        text: `${company.company_name || ''}\n`,
        font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
      },
      {
        text: company.address ? `${company.address}\n` : '',
        font: { color: { argb: 'FFBFDBFE' }, size: 9 },
      },
      {
        text: company.phone ? `Tel: ${company.phone}   ` : '',
        font: { color: { argb: 'FFBFDBFE' }, size: 9 },
      },
      {
        text: company.email ? `Email: ${company.email}` : '',
        font: { color: { argb: 'FFBFDBFE' }, size: 9 },
      },
    ],
  };
  infoCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PRIMARY_COLOR },
  };
  infoCell.alignment = { vertical: 'middle', horizontal: 'right', wrapText: true };

  worksheet.mergeCells('A2:I2');
  const subCell = worksheet.getCell('A2');
  subCell.value = `Ingénieur : ${project.engineer || '—'}   |   Date : ${new Date().toLocaleDateString('fr-FR')}   |   ${company.website || ''}`;
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

  const projectInfo: ProjectInfo = {
    name: project.name,
    engineer: project.engineer,
  };

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
      projectInfo,
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
  if (category === 'eclairage') return 'Éclairage';
  if (category === 'prise') return 'Prise de courant';
  return 'Mixte';
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
  cell.value = `⚡  ${title}  —  Jeu de barres · ${category}`;
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: PRIMARY_COLOR },
  };
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  sheet.getRow(rowNum).height = 26;
  for (let c = 1; c <= colCount; c++) {
    applyBorder(sheet.getCell(rowNum, c));
  }
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
    projectInfo: ProjectInfo;
  }
): { svgSkipped: boolean } {
  const sheetName = sanitizeSheetName(data.panelName);
  const sheet = workbook.addWorksheet(sheetName);

  const { headerRow, svgSkipped } = addCompanyHeader(
    sheet,
    workbook,
    data.company,
    data.sheetTitle,
    data.projectInfo
  );

  const headers = [
    'N°',
    'Cat.',
    'Repère',
    'Type',
    'Désignation',
    'P.unitaire (W)',
    'Qté',
    'P.totale (W)',
    'ku',
    'ks',
    'fp',
  ];

  const headerRowObj = sheet.getRow(headerRow);
  headers.forEach((h, i) => {
    const cell = headerRowObj.getCell(i + 1);
    cell.value = h;
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
    totalPower += totalEl;

    const typeLabel =
      (el as { type_label?: string }).type_label ||
      el.designation ||
      (el.type === 'prise'
        ? (el as { phase_type?: string }).phase_type === 'tri'
          ? 'Triphasé'
          : 'Monophasé'
        : '');
    const emplacement = (el as { emplacement?: string }).emplacement ?? '';
    const ku = (el as { coef_ku?: number }).coef_ku ?? (el as { ku?: number }).ku ?? 1;
    const ks = (el as { coef_ks?: number }).coef_ks ?? (el as { ks?: number }).ks ?? 1;
    const fp = (el as { coef_fp?: number }).coef_fp ?? (el as { fp?: number }).fp ?? 1;

    const values = [
      dataRowIndex + 1,
      elementCategoryLabel(el),
      el.repere,
      typeLabel,
      emplacement,
      el.power_w,
      el.quantity,
      totalEl,
      ku,
      ks,
      fp,
    ];
    dataRowIndex++;

    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
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
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(7).value = totalPower;
  for (let c = 1; c <= COL_COUNT; c++) {
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
    `Puissance absorbée (ks=0.8): ${Math.round(data.absorbed)} W`,
    `Intensité de calcul: ${Math.round(data.current * 100) / 100} A`,
    `Disjoncteur général recommandé: ${data.breaker} A`,
  ];

  summaryLines.forEach((line, i) => {
    const cell = sheet.getCell(summaryStart + i, 1);
    cell.value = line;
    cell.font = { bold: i === summaryLines.length - 1, size: 10 };
  });

  sheet.columns = [
    { width: 5 },
    { width: 10 },
    { width: 10 },
    { width: 28 },
    { width: 22 },
    { width: 12 },
    { width: 6 },
    { width: 12 },
    { width: 6 },
    { width: 6 },
    { width: 6 },
  ];

  sheet.views = [{ state: 'frozen', ySplit: headerRow }];
  return { svgSkipped };
}
