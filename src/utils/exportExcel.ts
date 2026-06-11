import type {
  CompanySettings,
  ExcelExportResult,
  ProjectExcelExportPayload,
} from '@/types';

export type { ProjectExcelExportPayload };

/** Export complet du projet en un fichier Excel multi-feuilles. */
export async function exportProjectToExcel(
  payload: ProjectExcelExportPayload,
  company?: CompanySettings
): Promise<ExcelExportResult> {
  return window.bilpow.export.exportProjectExcel(payload, company);
}
