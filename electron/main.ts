import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  nativeTheme,
  dialog,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { getDatabase, getDatabasePath, closeDatabase } from './database/db';
import * as projectsDb from './database/projects';
import * as locationsDb from './database/locations';
import * as panelsDb from './database/panels';
import * as elementsDb from './database/elements';
import * as favoritesDb from './database/favorites';
import { applyPanelChanges } from './database/panelSave';
import { getCompanySettings, saveCompanySettings } from './database/settings';
import { exportLocationToExcel, exportProjectToExcel } from './export/excelExport';
import type { ProjectExcelExportPayload } from '../shared/types';
// import { exportProjectToPdf } from './export/pdfExport';
import {
  exportProjectForBilpow,
  importProjectFromBilpow,
  validateBilpowElements,
} from './database/projectShare';
import { isBilpowFile } from '../shared/bilpow';
import type {
  CompanySettings,
  UpdateCompanySettingsInput,
  CreateElementInput,
  CreateFavoriteInput,
  UpdateElementInput,
  PanelSavePayload,
  UploadLogoResult,
} from '../shared/types';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let pendingBilpowImportPath: string | null = null;

function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'projet';
}

function findBilpowArgPath(argv: string[]): string | null {
  for (const arg of argv) {
    if (arg.toLowerCase().endsWith('.bilpow') && fs.existsSync(arg)) {
      return path.resolve(arg);
    }
  }
  return null;
}

function scheduleAutoImport(filePath: string): void {
  const send = (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('auto-import', filePath);
    }
  };
  if (mainWindow?.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(send, 1500);
    });
  } else {
    setTimeout(send, 1500);
  }
}

function createWindow(): void {
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1280,
    minHeight: 800,
    title: 'BilPow - Bilan de Puissance',
    icon: path.join(app.getAppPath(), 'public', 'icon.svg'),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    frame: !isMac,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    if (process.env.BILPOW_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function wrapHandler<T>(
  handler: () => T
): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = handler();
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[IPC Error]', message);
    return { success: false, error: message };
  }
}

async function wrapAsyncHandler<T>(
  handler: () => Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  try {
    const data = await handler();
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[IPC Error]', message);
    return { success: false, error: message };
  }
}

type SettingsLogoKind = 'company' | 'client';

const SETTINGS_LOGO_FIELDS: Record<
  SettingsLogoKind,
  { path: keyof CompanySettings; base64: keyof CompanySettings; mime: keyof CompanySettings; filename: string; title: string }
> = {
  company: {
    path: 'logo_path',
    base64: 'logo_base64',
    mime: 'logo_mime',
    filename: 'company_logo',
    title: 'Choisir le logo de la société',
  },
  client: {
    path: 'client_logo_path',
    base64: 'client_logo_base64',
    mime: 'client_logo_mime',
    filename: 'client_logo',
    title: 'Choisir le logo du client',
  },
};

async function uploadSettingsLogo(kind: SettingsLogoKind): Promise<UploadLogoResult | null> {
  const fields = SETTINGS_LOGO_FIELDS[kind];
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: fields.title,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'svg'] }],
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;

  const srcPath = filePaths[0]!;
  const ext = path.extname(srcPath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
  };
  const mime = mimeMap[ext] ?? 'image/png';

  const buffer = fs.readFileSync(srcPath);
  if (buffer.length > 2 * 1024 * 1024) {
    throw new Error('Le logo ne doit pas dépasser 2 Mo.');
  }

  const base64 = buffer.toString('base64');
  const userDataPath = app.getPath('userData');
  const logoDir = path.join(userDataPath, 'logos');
  if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });
  const destPath = path.join(logoDir, `${fields.filename}${ext}`);
  fs.copyFileSync(srcPath, destPath);

  saveCompanySettings({
    [fields.path]: destPath,
    [fields.base64]: base64,
    [fields.mime]: mime,
  });

  return { base64, mime, path: destPath };
}

function removeSettingsLogo(kind: SettingsLogoKind): boolean {
  const fields = SETTINGS_LOGO_FIELDS[kind];
  const current = getCompanySettings();
  const logoPath = current[fields.path] as string;
  if (logoPath && fs.existsSync(logoPath)) {
    try {
      fs.unlinkSync(logoPath);
    } catch {
      /* ignore */
    }
  }
  saveCompanySettings({
    [fields.path]: '',
    [fields.base64]: '',
    [fields.mime]: '',
  });
  return true;
}

function registerIpcHandlers(): void {
  ipcMain.handle('projects:getAll', () =>
    wrapHandler(() => projectsDb.getAllProjects())
  );
  ipcMain.handle('projects:getById', (_e, id: number) =>
    wrapHandler(() => projectsDb.getProjectById(id))
  );
  ipcMain.handle(
    'projects:create',
    (
      _e,
      data: {
        name: string;
        client?: string;
        description?: string;
      }
    ) => wrapHandler(() => projectsDb.createProject(data))
  );
  ipcMain.handle(
    'projects:update',
    (
      _e,
      data: {
        id: number;
        name?: string;
        client?: string;
        description?: string;
      }
    ) => wrapHandler(() => projectsDb.updateProject(data))
  );
  ipcMain.handle('projects:delete', (_e, id: number) =>
    wrapHandler(() => {
      projectsDb.deleteProject(id);
      return true;
    })
  );

  ipcMain.handle('locations:getByProject', (_e, projectId: number) =>
    wrapHandler(() => locationsDb.getLocationsByProject(projectId))
  );
  ipcMain.handle(
    'locations:create',
    (_e, data: { project_id: number; name: string }) =>
      wrapHandler(() => locationsDb.createLocation(data))
  );
  ipcMain.handle(
    'locations:update',
    (_e, data: { id: number; name?: string }) =>
      wrapHandler(() => locationsDb.updateLocation(data))
  );
  ipcMain.handle('locations:delete', (_e, id: number) =>
    wrapHandler(() => {
      locationsDb.deleteLocation(id);
      return true;
    })
  );
  ipcMain.handle(
    'locations:reorder',
    (_e, projectId: number, orderedIds: number[]) =>
      wrapHandler(() => {
        locationsDb.reorderLocations(projectId, orderedIds);
        return true;
      })
  );
  ipcMain.handle('locations:duplicate', (_e, id: number) =>
    wrapHandler(() => locationsDb.duplicateLocation(id))
  );

  ipcMain.handle('panels:getByLocation', (_e, locationId: number) =>
    wrapHandler(() => panelsDb.getPanelsByLocation(locationId))
  );
  ipcMain.handle(
    'panels:create',
    (
      _e,
      data: {
        location_id: number;
        name: string;
        description?: string;
        general_breaker_ampere?: number;
      }
    ) => wrapHandler(() => panelsDb.createPanel(data))
  );
  ipcMain.handle(
    'panels:update',
    (
      _e,
      data: {
        id: number;
        name?: string;
        description?: string;
        general_breaker_ampere?: number;
        coef_ks?: number;
        coef_ku?: number;
      }
    ) => wrapHandler(() => panelsDb.updatePanel(data))
  );
  ipcMain.handle('panels:delete', (_e, id: number) =>
    wrapHandler(() => {
      panelsDb.deletePanel(id);
      return true;
    })
  );
  ipcMain.handle('panels:duplicate', (_e, id: number) =>
    wrapHandler(() => panelsDb.duplicatePanel(id))
  );

  ipcMain.handle(
    'panel:saveChanges',
    async (_event, payload: PanelSavePayload & { filePath?: string }) => {
      try {
        const { filePath, ...savePayload } = payload;

        // Appliquer les changements dans la base de données
        await applyPanelChanges(savePayload.panelId, savePayload.changes);

        // Si un chemin est fourni, sauvegarder le fichier .bilpow
        if (filePath) {
          const panel = panelsDb.getPanelById(savePayload.panelId);
          if (!panel) {
            return { success: false, error: 'Panneau non trouvé' };
          }

          const location = locationsDb.getLocationById(panel.location_id);
          if (!location) {
            return { success: false, error: 'Localisation non trouvée' };
          }

          const project = projectsDb.getProjectById(location.project_id);
          if (!project) {
            return { success: false, error: 'Projet non trouvé' };
          }

          const data = exportProjectForBilpow(project.id);
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
          return { success: true, filePath };
        }

        return { success: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inconnue';
        console.error('[panel:saveChanges]', message, err);
        return { success: false, error: message };
      }
    }
  );

  ipcMain.handle(
    'panel:showSaveDialog',
    async (_e, defaultName: string) => {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Enregistrer le projet',
        defaultPath: `${defaultName}.bilpow`,
        filters: [{ name: 'Projet BilPow', extensions: ['bilpow'] }],
      });
      if (canceled || !filePath) return { canceled: true, filePath: null };
      return { canceled: false, filePath };
    }
  );

  ipcMain.handle('elements:getByPanel', (_e, panelId: number) =>
    wrapHandler(() => elementsDb.getElementsByPanel(panelId))
  );
  ipcMain.handle('elements:create', (_e, data: CreateElementInput) =>
    wrapHandler(() => elementsDb.createElement(data))
  );
  ipcMain.handle('elements:update', (_e, data: UpdateElementInput) =>
    wrapHandler(() => elementsDb.updateElement(data))
  );
  ipcMain.handle('elements:delete', (_e, id: number) =>
    wrapHandler(() => {
      elementsDb.deleteElement(id);
      return true;
    })
  );
  ipcMain.handle(
    'elements:reorder',
    (_e, panelId: number, orderedIds: number[]) =>
      wrapHandler(() => {
        elementsDb.reorderElements(panelId, orderedIds);
        return true;
      })
  );
  ipcMain.handle('elements:getArticles', (_e, elementId: number) =>
    wrapHandler(() => elementsDb.getArticlesByElement(elementId))
  );
  ipcMain.handle(
    'elements:createArticle',
    (
      _e,
      data: {
        element_id: number;
        type_label?: string;
        designation: string;
        power_w: number;
        quantity: number;
        coef_ks?: number;
        coef_ku?: number;
        order_index?: number;
      }
    ) => wrapHandler(() => elementsDb.createArticle(data))
  );
  ipcMain.handle(
    'elements:updateArticle',
    (
      _e,
      data: {
        id: number;
        type_label?: string;
        designation?: string;
        power_w?: number;
        quantity?: number;
        coef_ks?: number;
        coef_ku?: number;
        order_index?: number;
      }
    ) => wrapHandler(() => elementsDb.updateArticle(data))
  );
  ipcMain.handle('elements:deleteArticle', (_e, id: number) =>
    wrapHandler(() => {
      elementsDb.deleteArticle(id);
      return true;
    })
  );

  ipcMain.handle('favorites:getAll', () =>
    wrapHandler(() => favoritesDb.getAllFavorites())
  );
  ipcMain.handle('favorites:create', (_e, data: CreateFavoriteInput) =>
    wrapHandler(() => favoritesDb.createFavorite(data))
  );
  ipcMain.handle('favorites:delete', (_e, id: number) =>
    wrapHandler(() => {
      favoritesDb.deleteFavorite(id);
      return true;
    })
  );

  ipcMain.handle(
    'export:exportLocationToExcel',
    (_e, locationId: number, company?: CompanySettings) =>
      wrapAsyncHandler(() => exportLocationToExcel(locationId, company))
  );

  // ipcMain.handle('export:exportProjectToPdf', (_e, projectId: number, company?: CompanySettings) =>
  //   wrapAsyncHandler(() => exportProjectToPdf(projectId, company))
  // );

  ipcMain.handle(
    'export:projectExcel',
    (_e, payload: ProjectExcelExportPayload, company?: CompanySettings) =>
      wrapAsyncHandler(() => exportProjectToExcel(payload, company))
  );

  ipcMain.handle('settings:get', () => wrapHandler(() => getCompanySettings()));

  ipcMain.handle('settings:save', (_e, data: UpdateCompanySettingsInput) =>
    wrapHandler(() => {
      saveCompanySettings(data);
      return true;
    })
  );

  ipcMain.handle('settings:uploadLogo', async () =>
    wrapAsyncHandler(() => uploadSettingsLogo('company'))
  );

  ipcMain.handle('settings:removeLogo', () =>
    wrapHandler(() => removeSettingsLogo('company'))
  );

  ipcMain.handle('settings:uploadClientLogo', async () =>
    wrapAsyncHandler(() => uploadSettingsLogo('client'))
  );

  ipcMain.handle('settings:removeClientLogo', () =>
    wrapHandler(() => removeSettingsLogo('client'))
  );

  ipcMain.handle('app:getPlatform', () => process.platform);
  ipcMain.handle('app:getNativeTheme', () => nativeTheme.shouldUseDarkColors);
  ipcMain.handle('app:setNativeTheme', (_e, theme: 'dark' | 'light' | 'system') => {
    nativeTheme.themeSource = theme;
    return nativeTheme.shouldUseDarkColors;
  });
  ipcMain.handle('shell:openPath', (_e, filePath: string) =>
    shell.openPath(filePath)
  );

  ipcMain.handle('project:export', async (_e, projectId: number) => {
    try {
      const data = exportProjectForBilpow(projectId);
      const defaultName = `${sanitizeFileName(data.project.name)}.bilpow`;

      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Exporter le projet pour partage',
        defaultPath: defaultName,
        filters: [{ name: 'Projet BilPow', extensions: ['bilpow'] }],
      });

      if (canceled || !filePath) {
        return { success: false, error: 'Export annulé' };
      }

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      // shell.showItemInFolder(filePath);
      return { success: true, filePath };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      console.error('[project:export]', message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('project:import', async (_e, filePathArg?: string) => {
    try {
      let filePath = filePathArg;

      if (!filePath) {
        const { filePaths, canceled } = await dialog.showOpenDialog({
          title: 'Importer un projet BilPow',
          filters: [{ name: 'Projet BilPow', extensions: ['bilpow'] }],
          properties: ['openFile'],
        });
        if (canceled || filePaths.length === 0) {
          return { success: false, error: 'Import annulé' };
        }
        filePath = filePaths[0];
      }

      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: 'Fichier introuvable' };
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);

      if (!isBilpowFile(parsed)) {
        return {
          success: false,
          error: "Fichier invalide — ce n'est pas un fichier BilPow.",
        };
      }

      if (!parsed.project?.name) {
        return {
          success: false,
          error: 'Fichier invalide — données de projet manquantes.',
        };
      }

      validateBilpowElements(parsed.locations ?? []);
      const { projectId, projectName } = importProjectFromBilpow(parsed);
      return { success: true, projectId, projectName };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      console.error('[project:import]', message);
      return { success: false, error: message };
    }
  });
}

app.whenReady().then(() => {
  // Base SQLite dans userData — valide en dev et en production
  // path.join(app.getPath('userData'), 'bilpow.db') — voir database/db.ts
  if (isDev) {
    console.log('[BilPow] Database path:', getDatabasePath());
  }

  pendingBilpowImportPath = findBilpowArgPath(process.argv);

  getDatabase();
  registerIpcHandlers();
  createWindow();

  if (pendingBilpowImportPath) {
    scheduleAutoImport(pendingBilpowImportPath);
    pendingBilpowImportPath = null;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  closeDatabase();
});
