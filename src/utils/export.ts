/** Re-export Excel export via IPC — actual implementation runs in the main process. */
export async function exportLocationToExcel(locationId: number): Promise<string | null> {
  return window.bilpow.export.exportLocationToExcel(locationId);
}
