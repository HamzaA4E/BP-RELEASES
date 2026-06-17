import type {
  CompanySettings,
  Element,
  PanelWithStats,
  ProjectExcelExportPayload,
} from '@/types';
import { exportProjectToExcel } from '@/utils/exportExcel';

export async function buildProjectExcelExportPayload(
  projectId: number
): Promise<ProjectExcelExportPayload> {
  const project = await window.bilpow.projects.getById(projectId);

  if (!project) {
    throw new Error('Projet introuvable');
  }

  const locations = await window.bilpow.locations.getByProject(projectId);
  const panelsByLocation: Record<number, PanelWithStats[]> = {};
  const elementsByPanel: Record<number, Element[]> = {};

  for (const location of locations) {
    const panels = await window.bilpow.panels.getByLocation(location.id);
    panelsByLocation[location.id] = panels;

    for (const panel of panels) {
      elementsByPanel[panel.id] = await window.bilpow.elements.getByPanel(panel.id);
    }
  }

  return {
    project,
    locations,
    panelsByLocation,
    elementsByPanel,
  };
}

export async function exportProjectExcelById(
  projectId: number,
  company?: CompanySettings
) {
  const payload = await buildProjectExcelExportPayload(projectId);
  return exportProjectToExcel(payload, company);
}
