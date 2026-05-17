import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  nativeTheme,
} from 'electron';
import path from 'path';
import { getDatabase, closeDatabase } from './database/db';
import * as projectsDb from './database/projects';
import * as locationsDb from './database/locations';
import * as panelsDb from './database/panels';
import * as elementsDb from './database/elements';
import * as favoritesDb from './database/favorites';
import { exportLocationToExcel } from './export/excelExport';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

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
        engineer?: string;
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
        engineer?: string;
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

  ipcMain.handle('elements:getByPanel', (_e, panelId: number) =>
    wrapHandler(() => elementsDb.getElementsByPanel(panelId))
  );
  ipcMain.handle(
    'elements:create',
    (
      _e,
      data: {
        panel_id: number;
        type: 'eclairage' | 'prise';
        repere: string;
        designation: string;
        power_w: number;
        quantity: number;
        distance_m: number;
        circuit?: string;
        notes?: string;
      }
    ) => wrapHandler(() => elementsDb.createElement(data))
  );
  ipcMain.handle(
    'elements:update',
    (
      _e,
      data: {
        id: number;
        type?: 'eclairage' | 'prise';
        repere?: string;
        designation?: string;
        power_w?: number;
        quantity?: number;
        distance_m?: number;
        circuit?: string;
        notes?: string;
      }
    ) => wrapHandler(() => elementsDb.updateElement(data))
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

  ipcMain.handle('favorites:getAll', () =>
    wrapHandler(() => favoritesDb.getAllFavorites())
  );
  ipcMain.handle(
    'favorites:create',
    (
      _e,
      data: {
        type: 'eclairage' | 'prise';
        designation: string;
        power_w: number;
        color?: string;
      }
    ) => wrapHandler(() => favoritesDb.createFavorite(data))
  );
  ipcMain.handle('favorites:delete', (_e, id: number) =>
    wrapHandler(() => {
      favoritesDb.deleteFavorite(id);
      return true;
    })
  );

  ipcMain.handle('export:exportLocationToExcel', (_e, locationId: number) =>
    wrapAsyncHandler(() => exportLocationToExcel(locationId))
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
}

app.whenReady().then(() => {
  getDatabase();
  registerIpcHandlers();
  createWindow();

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
