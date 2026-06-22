import type { CompanySettings, ExcelExportResult } from '@/types';

/** Excel export via IPC — implementation runs in the main process. */
export async function exportLocationToExcel(
  locationId: number,
  company?: CompanySettings,
  panelIds?: number[]
): Promise<ExcelExportResult> {
  return window.bilpow.export.exportLocationToExcel(locationId, company, panelIds);
}

/** PDF export via IPC — implementation runs in the main process. */
export async function exportProjectToPdf(
  projectId: number,
  company?: CompanySettings
): Promise<string | null> {
  return window.bilpow.export.exportProjectToPdf(projectId, company);
}
