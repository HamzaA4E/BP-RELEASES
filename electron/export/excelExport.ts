import ExcelJS from 'exceljs';
import { dialog } from 'electron';
import { getDatabase } from '../database/db';
import { getProjectById } from '../database/projects';
import { getLocationById } from '../database/locations';
import { getPanelsByLocation } from '../database/panels';
import { getElementsByPanel } from '../database/elements';

const PRIMARY_COLOR = 'FF1E3A5F';
const ALT_ROW_COLOR = 'FFF8F9FA';
const TOTAL_ROW_COLOR = 'FFDBEAFE';

const STANDARD_BREAKERS = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200];

function recommendedBreaker(current: number): number {
  const breaker = STANDARD_BREAKERS.find((b) => b >= current);
  return breaker !== undefined
    ? breaker
    : STANDARD_BREAKERS[STANDARD_BREAKERS.length - 1]!;
}

function voltageDropPercent(
  distanceM: number,
  powerW: number,
  quantity: number
): number {
  if (distanceM <= 0 || powerW <= 0 || quantity <= 0) return 0;
  const cosPhi = 0.8;
  const voltage = 230;
  const sectionMm2 = 2.5;
  const numerator = 2 * distanceM * powerW * quantity;
  const denominator = cosPhi * voltage * sectionMm2 * 56;
  return (numerator / denominator) * 100;
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/*?:\[\]]/g, '_').slice(0, 31);
}

function applyBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };
}

interface PanelSummary {
  name: string;
  installed: number;
  absorbed: number;
  current: number;
  breaker: number;
}

export async function exportLocationToExcel(
  locationId: number
): Promise<string | null> {
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

  if (canceled || !filePath) return null;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BilPow';
  workbook.created = new Date();

  const panels = getPanelsByLocation(locationId);
  const summaries: PanelSummary[] = [];
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
    const installed = elements.reduce((s, e) => s + e.power_w * e.quantity, 0);
    const absorbed = installed * 0.8;
    const current = absorbed / (230 * 0.8);
    const breaker = recommendedBreaker(current);

    summaries.push({
      name: panel.name,
      installed,
      absorbed,
      current,
      breaker,
    });

    panelDataList.push({
      panelName: panel.name,
      elements,
      installed,
      absorbed,
      current,
      breaker,
    });
  }

  createSyntheseSheet(workbook, summaries);

  for (const panelData of panelDataList) {
    createPanelSheet(workbook, {
      projectName: project.name,
      locationName: location.name,
      panelName: panelData.panelName,
      engineer: project.engineer ?? '',
      elements: panelData.elements,
      installed: panelData.installed,
      absorbed: panelData.absorbed,
      current: panelData.current,
      breaker: panelData.breaker,
    });
  }

  await workbook.xlsx.writeFile(filePath);
  return filePath;
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

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

function createSyntheseSheet(
  workbook: ExcelJS.Workbook,
  summaries: PanelSummary[]
): void {
  const sheet = workbook.addWorksheet('SYNTHESE', { state: 'visible' });
  workbook.worksheets.forEach((ws) => {
    if (ws.name === 'SYNTHESE') return;
  });

  const headers = [
    'Tableau',
    'P. installée (W)',
    'P. absorbée (W)',
    'I. calcul (A)',
    'DJ général (A)',
  ];

  const headerRow = sheet.addRow(headers);
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: PRIMARY_COLOR },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    applyBorder(cell);
  });

  summaries.forEach((s, i) => {
    const row = sheet.addRow([
      s.name,
      Math.round(s.installed),
      Math.round(s.absorbed),
      Math.round(s.current * 100) / 100,
      s.breaker,
    ]);
    row.eachCell((cell) => {
      if (i % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: ALT_ROW_COLOR },
        };
      }
      applyBorder(cell);
    });
  });

  sheet.columns = [
    { width: 30 },
    { width: 18 },
    { width: 18 },
    { width: 14 },
    { width: 14 },
  ];

  sheet.views = [{ state: 'frozen', ySplit: 1 }];
}

function createPanelSheet(
  workbook: ExcelJS.Workbook,
  data: {
    projectName: string;
    locationName: string;
    panelName: string;
    engineer: string;
    elements: ReturnType<typeof getElementsByPanel>;
    installed: number;
    absorbed: number;
    current: number;
    breaker: number;
  }
): void {
  const sheetName = sanitizeSheetName(data.panelName);
  const sheet = workbook.addWorksheet(sheetName);

  const colCount = 9;

  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = data.projectName;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  sheet.mergeCells(2, 1, 2, colCount);
  const subtitleCell = sheet.getCell(2, 1);
  subtitleCell.value = `${data.locationName} — ${data.panelName}`;
  subtitleCell.font = { bold: true, size: 11 };

  sheet.getRow(3).height = 8;

  const dateRow = sheet.getRow(4);
  const exportDate = new Date().toLocaleDateString('fr-FR');
  const dateText = data.engineer
    ? `Exporté le ${exportDate} — Ingénieur: ${data.engineer}`
    : `Exporté le ${exportDate}`;
  sheet.mergeCells(4, 1, 4, colCount);
  dateRow.getCell(1).value = dateText;
  dateRow.getCell(1).alignment = { horizontal: 'right' };
  dateRow.getCell(1).font = { italic: true, size: 9 };

  sheet.getRow(5).height = 8;

  const headers = [
    'N°',
    'Type',
    'Repère',
    'Désignation',
    'P.unitaire (W)',
    'Qté',
    'P.totale (W)',
    'Distance (m)',
    'Chute de tension (%)',
  ];

  const headerRow = sheet.getRow(6);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
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
  headerRow.height = 28;

  let totalPower = 0;
  data.elements.forEach((el, index) => {
    const rowNum = 7 + index;
    const row = sheet.getRow(rowNum);
    const totalEl = el.power_w * el.quantity;
    totalPower += totalEl;
    const drop = voltageDropPercent(el.distance_m, el.power_w, el.quantity);

    const typeLabel = el.type === 'eclairage' ? 'Éclairage' : 'Prise';
    const values = [
      index + 1,
      typeLabel,
      el.repere,
      el.designation,
      el.power_w,
      el.quantity,
      totalEl,
      el.distance_m,
      Math.round(drop * 100) / 100,
    ];

    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      if (index % 2 === 1) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: ALT_ROW_COLOR },
        };
      }
      applyBorder(cell);
    });
  });

  const totalRowNum = 7 + data.elements.length;
  const totalRow = sheet.getRow(totalRowNum);
  totalRow.getCell(1).value = 'TOTAL';
  totalRow.getCell(7).value = totalPower;
  for (let c = 1; c <= colCount; c++) {
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
    { width: 12 },
    { width: 10 },
    { width: 35 },
    { width: 14 },
    { width: 6 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
  ];

  sheet.views = [{ state: 'frozen', ySplit: 6 }];
}
