import { jsPDF } from 'jspdf';
import { dialog } from 'electron';
import { getProjectById } from '../database/projects';
import { getLocationsByProject } from '../database/locations';
import { getPanelsByLocation } from '../database/panels';
import { getElementsByPanel, getArticlesByElement } from '../database/elements';
import { getCompanySettings } from '../database/settings';
import type { CompanySettings } from '../../shared/types';
import type { ProjectRow } from '../database/projects';
import type { ElementRow } from '../database/elements';
import {
  calcPuissanceTotale,
  calcArticlePower,
  resolveElementCoefs,
  formatCoefsLine,
  wattsToKw,
} from '../../shared/powerCalculations';

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

function formatKw(powerW: number): string {
  return wattsToKw(powerW).toLocaleString('fr-FR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function addCoverPage(
  doc: jsPDF,
  company: CompanySettings,
  project: ProjectRow
): void {
  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, 210, 297, 'F');

  const hasRasterLogo =
    company.logo_base64 &&
    company.logo_mime &&
    !company.logo_mime.includes('svg');

  if (hasRasterLogo) {
    const imgFormat = company.logo_mime.includes('png') ? 'PNG' : 'JPEG';
    const maxW = 100;
    const maxH = 35;
    doc.addImage(
      `data:${company.logo_mime};base64,${company.logo_base64}`,
      imgFormat,
      (210 - maxW) / 2,
      45,
      maxW,
      maxH,
      undefined,
      'FAST'
    );
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(company.company_name || '', 105, 90, { align: 'center' });
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(28);
    doc.text(company.company_name || 'BilPow', 105, 70, { align: 'center' });
  }

  doc.setFontSize(16);
  doc.text(project.name, 105, 120, { align: 'center' });

  if (project.client) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(191, 219, 254);
    doc.text(`Client : ${project.client}`, 105, 135, { align: 'center' });
  }

  if (company.address) {
    doc.setFontSize(10);
    doc.text(company.address, 105, 155, { align: 'center' });
  }

  const contactParts: string[] = [];
  if (company.phone) contactParts.push(company.phone);
  if (company.email) contactParts.push(company.email);
  if (company.website) contactParts.push(company.website);
  if (contactParts.length > 0) {
    doc.text(contactParts.join('  ·  '), 105, 168, { align: 'center' });
  }

  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('BILAN DE PUISSANCE', 105, 200, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(191, 219, 254);
  doc.text(
    `Généré le ${new Date().toLocaleDateString('fr-FR')}`,
    105,
    212,
    { align: 'center' }
  );
}

function addPageHeader(
  doc: jsPDF,
  company: CompanySettings,
  project: ProjectRow,
  locationName: string
): void {
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFillColor(30, 58, 95);
  doc.rect(0, 0, pageWidth, 16, 'F');

  const hasRasterLogo =
    company.logo_base64 &&
    company.logo_mime &&
    !company.logo_mime.includes('svg');

  if (hasRasterLogo) {
    const imgFormat = company.logo_mime.includes('png') ? 'PNG' : 'JPEG';
    doc.addImage(
      `data:${company.logo_mime};base64,${company.logo_base64}`,
      imgFormat,
      3,
      1,
      28,
      14,
      undefined,
      'FAST'
    );
  } else {
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(company.company_name || 'BilPow', 5, 9);
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(project.name, pageWidth / 2, 7, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(191, 219, 254);
  doc.text(locationName, pageWidth / 2, 12, { align: 'center' });

  doc.setFillColor(241, 245, 249);
  doc.rect(0, 285, pageWidth, 12, 'F');
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const pageInfo = doc.getCurrentPageInfo();
  doc.text(`Page ${pageInfo.pageNumber}`, pageWidth / 2, 291, { align: 'center' });
  if (company.email) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.text(company.email, 15, 291);
  }
}

const COL_WIDTHS = [20, 38, 24, 12, 12, 12, 24, 28];

const TABLE_WIDTH = COL_WIDTHS.reduce((sum, w) => sum + w, 0);

const TABLE_LEFT = (210 - TABLE_WIDTH) / 2;

const TABLE_HEADERS = [
  'Repère',
  'Désignation',
  'P.Unitaire (kW)',
  'Qté',
  'Ks',
  'Ku',
  'P.Totale (kW)',
  // 'Coefficients',
];

const TABLE_HEADER_HEIGHT = 8;

function bandCenterBaselineY(
  doc: jsPDF,
  bandTop: number,
  bandHeight: number
): number {
  const fontSizeMm = doc.getFontSize() * 0.352778;
  return bandTop + bandHeight / 2 + fontSizeMm * 0.3;
}

function isJeuDeBarresRow(el: {
  type: string;
  row_kind?: string;
}): boolean {
  return el.type === 'jeu_de_barres' || el.row_kind === 'bar_set';
}

function jdbCategoryLabelPdf(category: string | null | undefined): string {
  if (category === 'prise') return 'Prise de courant';
  return 'Éclairage';
}

function colLeft(colIndex: number): number {
  let x = TABLE_LEFT;
  for (let i = 0; i < colIndex; i++) {
    x += COL_WIDTHS[i]!;
  }
  return x;
}

function colCenterX(colIndex: number): number {
  return colLeft(colIndex) + COL_WIDTHS[colIndex]! / 2;
}

function maxCharsForCol(colIndex: number): number {
  return Math.max(4, Math.floor(COL_WIDTHS[colIndex]! / 1.8));
}

function drawCenteredCell(
  doc: jsPDF,
  text: string,
  colIndex: number,
  y: number,
  maxWidth?: number
): void {
  const width = maxWidth ?? COL_WIDTHS[colIndex]! - 2;
  doc.text(text, colCenterX(colIndex), y, {
    align: 'center',
    maxWidth: width,
  });
}

function drawTableHeader(doc: jsPDF, y: number): number {
  doc.setFillColor(30, 58, 95);
  doc.rect(TABLE_LEFT, y, TABLE_WIDTH, TABLE_HEADER_HEIGHT, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const textY = bandCenterBaselineY(doc, y, TABLE_HEADER_HEIGHT);
  TABLE_HEADERS.forEach((h, i) => {
    drawCenteredCell(doc, h, i, textY);
  });
  return y + TABLE_HEADER_HEIGHT + 2;
}

function drawJeuDeBarresTitleRow(
  doc: jsPDF,
  el: ElementRow,
  y: number
): number {
  const title = el.type_label?.trim() || el.designation?.trim() || 'Jeu de barres';
  const category = jdbCategoryLabelPdf(el.jdb_category);
  const label = ` ${title}  —  Jeu de barres · ${category}`;

  doc.setFillColor(70, 100, 140);
  doc.rect(TABLE_LEFT, y - 4, TABLE_WIDTH, 9, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(label, TABLE_LEFT + TABLE_WIDTH / 2, y + 1.5, {
    align: 'center',
    maxWidth: TABLE_WIDTH - 4,
  });
  return y + 9;
}

function drawSubtotalRow(
  doc: jsPDF,
  label: string,
  totalPowerW: number,
  y: number
): number {
  doc.setFillColor(239, 246, 255);
  doc.rect(TABLE_LEFT, y - 4, TABLE_WIDTH, 7, 'F');
  doc.setTextColor(30, 58, 95);
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(7);
  doc.text(label, TABLE_LEFT + 2, y);
  doc.text(`${formatKw(totalPowerW)} kW`, colCenterX(6), y, { align: 'center' });
  return y + 7;
}

function addPanelPage(
  doc: jsPDF,
  company: CompanySettings,
  project: ProjectRow,
  locationName: string,
  panelName: string,
  elements: ElementRow[]
): void {
  addPageHeader(doc, company, project, locationName);

  doc.setTextColor(30, 58, 95);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(panelName, TABLE_LEFT, 24);

  let y = drawTableHeader(doc, 32);
  let dataRowIndex = 0;
  let currentJdb: ElementRow | null = null;
  let groupElements: ElementRow[] = [];

  const flushSubtotal = (): void => {
    if (!currentJdb || groupElements.length === 0) return;
    const total = groupElements.reduce((sum, el) => {
      if (el.is_multi) {
        const arts = getArticlesByElement(el.id);
        return sum + calcPuissanceTotale(el, arts);
      }
      return sum + calcPuissanceTotale(el);
    }, 0);
    const jdbTitle =
      currentJdb.type_label?.trim() ||
      currentJdb.designation?.trim() ||
      'Jeu de barres';
    y = drawSubtotalRow(doc, `Sous-total ${jdbTitle}`, total, y);
    groupElements = [];
  };

  elements.forEach((el) => {
    if (y > 268) {
      doc.addPage();
      addPageHeader(doc, company, project, locationName);
      y = drawTableHeader(doc, 24);
    }

    if (isJeuDeBarresRow(el)) {
      flushSubtotal();
      currentJdb = el;
      y = drawJeuDeBarresTitleRow(doc, el, y);
      return;
    }

    if (el.is_multi) {
      const articles = getArticlesByElement(el.id);

      articles.forEach((article, artIdx) => {
        if (y > 268) {
          doc.addPage();
          addPageHeader(doc, company, project, locationName);
          y = drawTableHeader(doc, 24);
        }

        if (dataRowIndex % 2 === 1) {
          doc.setFillColor(248, 249, 250);
          doc.rect(TABLE_LEFT, y - 4, TABLE_WIDTH, 7, 'F');
        }

        const ks = article.coef_ks ?? 1;
        const ku = article.coef_ku ?? 1;
        const totalArt = calcArticlePower(article);
        const coefsLine = ku === 1 ? `Ks=${ks}` : formatCoefsLine(ks, ku);

        const desLabel =
          article.designation?.trim() || article.type_label?.trim() || '';

        const row = [
          artIdx === 0 ? el.repere : '',
          desLabel,
          formatKw(article.power_w),
          String(article.quantity),
          String(ks),
          ku === 1 ? '' : ku.toFixed(2),
          formatKw(totalArt),
          coefsLine,
        ];

        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', artIdx === 0 ? 'bold' : 'normal');
        doc.setFontSize(7);
        row.forEach((cell, i) => {
          drawCenteredCell(doc, cell.slice(0, maxCharsForCol(i)), i, y);
        });
        y += 7;
        dataRowIndex++;
      });

      if (currentJdb) groupElements.push(el);
      return;
    }

    if (dataRowIndex % 2 === 1) {
      doc.setFillColor(248, 249, 250);
      doc.rect(TABLE_LEFT, y - 4, TABLE_WIDTH, 7, 'F');
    }

    const designation = el.emplacement?.trim() || el.type_label || '';
    const { ks, ku } = resolveElementCoefs(el);
    const totalEl = calcPuissanceTotale(el);
    const coefsLine = ku === 1 ? `Ks=${ks}` : formatCoefsLine(ks, ku);

    const row = [
      el.repere,
      designation,
      formatKw(el.power_w),
      String(el.quantity),
      String(ks),
      ku === 1 ? '' : ku.toFixed(2),
      formatKw(totalEl),
      coefsLine,
    ];

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    row.forEach((cell, i) => {
      const trimmed = cell.slice(0, maxCharsForCol(i));
      drawCenteredCell(doc, trimmed, i, y);
    });
    y += 7;
    dataRowIndex++;

    if (currentJdb) groupElements.push(el);
  });

  flushSubtotal();
}

export async function exportProjectToPdf(
  projectId: number,
  companyFromRenderer?: CompanySettings
): Promise<string | null> {
  const company = companyFromRenderer ?? getCompanySettings();
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  const defaultName = `${sanitizeFileName(project.name)}_bilan.pdf`;
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Exporter le projet en PDF',
    defaultPath: defaultName,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) return null;

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  addCoverPage(doc, company, project);

  const locations = getLocationsByProject(projectId);

  for (const location of locations) {
    const panels = getPanelsByLocation(location.id);
    for (const panel of panels) {
      const elements = getElementsByPanel(panel.id);
      if (elements.length === 0) continue;
      doc.addPage();
      addPanelPage(doc, company, project, location.name, panel.name, elements);
    }
  }

  if (doc.getNumberOfPages() === 1 && locations.every((l) => {
    const panels = getPanelsByLocation(l.id);
    return panels.every((p) => getElementsByPanel(p.id).length === 0);
  })) {
    doc.setPage(1);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.text('Aucun élément à exporter pour ce projet.', 105, 240, { align: 'center' });
  }

  doc.save(filePath);
  return filePath;
}
