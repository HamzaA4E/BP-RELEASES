import { jsPDF } from 'jspdf';
import { dialog } from 'electron';
import { getProjectById } from '../database/projects';
import { getLocationsByProject } from '../database/locations';
import { getPanelsByLocation } from '../database/panels';
import { getElementsByPanel } from '../database/elements';
import { getCompanySettings } from '../database/settings';
import type { CompanySettings } from '../../shared/types';
import type { ProjectRow } from '../database/projects';

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
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

  if (project.engineer) {
    doc.text(`Ingénieur : ${project.engineer}`, 105, 222, { align: 'center' });
  }
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

  const pageInfo = doc.getCurrentPageInfo();
  doc.setTextColor(191, 219, 254);
  doc.setFontSize(8);
  doc.text(`Page ${pageInfo.pageNumber}`, pageWidth - 5, 9, { align: 'right' });

  doc.setFillColor(241, 245, 249);
  doc.rect(0, 285, pageWidth, 12, 'F');
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.text(
    `Généré par BilPow — ${new Date().toLocaleDateString('fr-FR')}`,
    15,
    291
  );
  if (company.email) {
    doc.text(company.email, pageWidth / 2, 291, { align: 'center' });
  }
  doc.text('Document confidentiel', pageWidth - 15, 291, { align: 'right' });
}

function addPanelPage(
  doc: jsPDF,
  company: CompanySettings,
  project: ProjectRow,
  locationName: string,
  panelName: string,
  elements: ReturnType<typeof getElementsByPanel>
): void {
  addPageHeader(doc, company, project, locationName);

  doc.setTextColor(30, 58, 95);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(panelName, 15, 24);

  const startY = 32;
  const colWidths = [8, 16, 14, 40, 28, 14, 10, 14, 10, 10, 10];
  const headers = ['N°', 'Cat.', 'Rep.', 'Type', 'Désig.', 'P.(W)', 'Qté', 'Tot.', 'ku', 'ks', 'fp'];
  let x = 15;

  doc.setFillColor(30, 58, 95);
  doc.rect(15, startY, 183, 8, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7);
  headers.forEach((h, i) => {
    doc.text(h, x + 1, startY + 5.5);
    x += colWidths[i]!;
  });

  let y = startY + 10;
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');

  elements.forEach((el, index) => {
    if (y > 270) {
      doc.addPage();
      addPageHeader(doc, company, project, locationName);
      y = 24;
    }

    if (index % 2 === 1) {
      doc.setFillColor(248, 249, 250);
      doc.rect(15, y - 4, 183, 7, 'F');
    }

    const categoryLabel = el.type === 'eclairage' ? 'Écl.' : 'Prise';
    const rowKind = el.row_kind ?? 'element';
    const isJdb = el.type === 'jeu_de_barres' || rowKind === 'bar_set';
    const total = isJdb ? '' : String(el.power_w * el.quantity);
    const row = [
      String(index + 1),
      categoryLabel,
      el.repere,
      (el.type_label || el.designation).slice(0, 22),
      (el.emplacement ?? '').slice(0, 16),
      isJdb ? '' : String(el.power_w),
      isJdb ? '' : String(el.quantity),
      total,
      isJdb ? '' : String(el.ku ?? 1),
      isJdb ? '' : String(el.ks ?? 1),
      isJdb ? '' : String(el.fp ?? 1),
    ];

    x = 15;
    row.forEach((cell, i) => {
      doc.text(cell, x + 1, y);
      x += colWidths[i]!;
    });
    y += 7;
  });
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
