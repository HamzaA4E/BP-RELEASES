import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  nativeTheme,
  dialog,
  Menu,
} from 'electron';
import path from 'path';
import fs from 'fs';
import { getDatabase, getDatabasePath, closeDatabase } from './database/db';
import * as projectsDb from './database/projects';
import * as locationsDb from './database/locations';
import * as panelsDb from './database/panels';
import * as elementsDb from './database/elements';
import * as favoritesDb from './database/favorites';
import * as foldersDb from './database/folders';
import { applyPanelChanges } from './database/panelSave';
import { getCompanySettings, saveCompanySettings } from './database/settings';
import { exportLocationToExcel, exportProjectToExcel } from './export/excelExport';
import type { ProjectExcelExportPayload } from '../shared/types';
// import { exportProjectToPdf } from './export/pdfExport';
import {
  exportProjectForBilpow,
  importProjectFromBilpow,
  restoreProjectFromBilpow,
  validateBilpowElements,
} from './database/projectShare';
import { isBilpowFile } from '../shared/bilpow';
import type {
  CompanySettings,
  UpdateCompanySettingsInput,
  CreateElementInput,
  CreateFavoriteInput,
  UpdateFavoriteInput,
  UpdateElementInput,
  PanelSavePayload,
  UploadLogoResult,
} from '../shared/types';

const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;
let pendingBilpowImportPath: string | null = null;
let hasUnsavedChanges = false;
let fileWatcher: any = null;

// File watcher maps for tracking renames
let filePathMap = new Map<string, { type: 'project' | 'folder'; id: number; name: string }>();
let idMap = new Map<number, { type: 'project' | 'folder'; path: string; name: string }>();

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

  createApplicationMenu();

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

  mainWindow.on('close', (e) => {
    if (hasUnsavedChanges) {
      e.preventDefault();
      const choice = dialog.showMessageBoxSync(mainWindow!, {
        type: 'warning',
        title: 'Modifications non sauvegardées',
        message: 'Vous avez des modifications non sauvegardées. Voulez-vous les enregistrer avant de fermer ?',
        buttons: ['Enregistrer et fermer', 'Fermer sans enregistrer', 'Annuler'],
        defaultId: 0,
        cancelId: 2,
      });

      if (choice === 0) {
        // Enregistrer et fermer
        mainWindow?.webContents.send('app:before-close-save');
        // La fermeture sera effectuée après la sauvegarde
      } else if (choice === 1) {
        // Fermer sans enregistrer
        hasUnsavedChanges = false;
        mainWindow?.close();
      }
      // Si choice === 2 (Annuler), ne rien faire
    }
  });
}

function createApplicationMenu(): void {
  const isMac = process.platform === 'darwin';

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Fichier',
      submenu: [
        {
          label: 'Ajouter un projet',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow?.webContents.send('menu:new-project');
          },
        },
        {
          label: 'Ouvrir un projet',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow?.webContents.send('menu:open-project');
          },
        },
        { type: 'separator' },
        {
          label: 'Sauvegarder',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow?.webContents.send('menu:save');
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Fermer' } : { role: 'quit', label: 'Quitter' },
      ],
    },
    {
      label: 'Édition',
      submenu: [
        { role: 'undo', label: 'Annuler' },
        { role: 'redo', label: 'Rétablir' },
        { type: 'separator' },
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { role: 'selectAll', label: 'Tout sélectionner' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { role: 'reload', label: 'Recharger' },
        { role: 'forceReload', label: 'Forcer le rechargement' },
       
        { type: 'separator' },
        { role: 'resetZoom', label: 'Réinitialiser le zoom' },
        { role: 'zoomIn', label: 'Zoom avant' },
        { role: 'zoomOut', label: 'Zoom arrière' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Plein écran' },
      ],
    },
  ];

  if (isMac) {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about', label: 'À propos' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: 'Masquer' },
        { role: 'hideOthers', label: 'Masquer les autres' },
        { role: 'unhide', label: 'Afficher tout' },
        { type: 'separator' },
        { role: 'quit', label: 'Quitter' },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
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

async function setupFileWatcher(): Promise<void> {
  try {
    const db = getDatabase();
    
    // Get all watched paths (project files and folders)
    const projects = db.prepare('SELECT id, file_path, name FROM projects WHERE file_path IS NOT NULL').all() as Array<{ id: number; file_path: string; name: string }>;
    const folders = db.prepare('SELECT id, folder_path, name FROM folders WHERE folder_path IS NOT NULL').all() as Array<{ id: number; folder_path: string; name: string }>;
    
    const watchedDirectories = new Set<string>();
    
    // Add project file directories
    for (const project of projects) {
      if (project.file_path) {
        watchedDirectories.add(path.dirname(project.file_path));
      }
    }
    
    // Add folder paths
    for (const folder of folders) {
      if (folder.folder_path) {
        watchedDirectories.add(folder.folder_path);
      }
    }
    
    if (watchedDirectories.size === 0) {
      console.log('[FileWatcher] No directories to watch');
      return;
    }
    
    console.log('[FileWatcher] Setting up watcher for directories:', Array.from(watchedDirectories));
    
    // Clear and reinitialize the global maps with current paths
    filePathMap.clear();
    idMap.clear();
    
    for (const project of projects) {
      if (project.file_path) {
        filePathMap.set(project.file_path, { type: 'project', id: project.id, name: project.name });
        idMap.set(project.id, { type: 'project', path: project.file_path, name: project.name });
      }
    }
    for (const folder of folders) {
      if (folder.folder_path) {
        filePathMap.set(folder.folder_path, { type: 'folder', id: folder.id, name: folder.name });
        idMap.set(folder.id, { type: 'folder', path: folder.folder_path, name: folder.name });
      }
    }
    
    // Use native fs.watch instead of chokidar
    const watchers: fs.FSWatcher[] = [];
    
    for (const dir of watchedDirectories) {
      try {
        // Check if directory exists before watching
        if (!fs.existsSync(dir)) {
          console.log('[FileWatcher] Skipping non-existent directory:', dir);
          continue;
        }
        
        const watcher = fs.watch(dir, { persistent: true }, (eventType, filename) => {
          if (!filename) return;
          
          const fullPath = path.join(dir, filename);
          
          console.log('[FileWatcher] Event detected:', { eventType, filename, fullPath, dir });
          
          if (eventType === 'rename') {
            // Check if this is a tracked file that was deleted/renamed
            const tracked = filePathMap.get(fullPath);
            if (tracked) {
              console.log('[FileWatcher] Tracked file renamed/deleted:', tracked.id, tracked.name);
            }
            
            // Check if this is a new .bilpow file that might be a rename
            if (filename.endsWith('.bilpow')) {
              console.log('[FileWatcher] New .bilpow file detected, checking for rename:', fullPath);
              setTimeout(() => {
                console.log('[FileWatcher] Checking for missing files in directory:', dir);
                // Check all projects/folders in this directory to see if any are missing
                for (const [id, info] of idMap.entries()) {
                  if (path.dirname(info.path) === dir && !fs.existsSync(info.path)) {
                    console.log('[FileWatcher] Missing file found:', id, info.path);
                    // This file was deleted, check if the new file is the renamed version
                    if (fs.existsSync(fullPath)) {
                      // Update the path in the database
                      const newFileName = path.basename(fullPath);
                      const sanitizedName = newFileName.replace('.bilpow', '').replace(/_/g, ' ');
                      
                      console.log('[FileWatcher] Updating path in DB:', id, 'from', info.path, 'to', fullPath);
                      
                      if (info.type === 'project') {
                        db.prepare('UPDATE projects SET name = ?, file_path = ?, updated_at = datetime(\'now\') WHERE id = ?').run(sanitizedName, fullPath, id);
                        filePathMap.delete(info.path);
                        filePathMap.set(fullPath, { type: 'project', id, name: sanitizedName });
                        idMap.set(id, { type: 'project', path: fullPath, name: sanitizedName });
                        mainWindow?.webContents.send('file-renamed', { type: 'project', id, newName: sanitizedName });
                      } else if (info.type === 'folder') {
                        db.prepare('UPDATE folders SET name = ?, folder_path = ? WHERE id = ?').run(sanitizedName, fullPath, id);
                        filePathMap.delete(info.path);
                        filePathMap.set(fullPath, { type: 'folder', id, name: sanitizedName });
                        idMap.set(id, { type: 'folder', path: fullPath, name: sanitizedName });
                        mainWindow?.webContents.send('file-renamed', { type: 'folder', id, newName: sanitizedName });
                      }
                      
                      console.log('[FileWatcher] Successfully updated:', id, sanitizedName);
                      break;
                    } else {
                      console.log('[FileWatcher] New file does not exist:', fullPath);
                    }
                  }
                }
              }, 500);
            }
            
            // Check if this is a directory that might be a renamed folder
            if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
              console.log('[FileWatcher] New directory detected, checking for rename:', fullPath);
              setTimeout(() => {
                console.log('[FileWatcher] Checking for missing folders in directory:', dir);
                // Check all folders in this directory to see if any are missing
                for (const [id, info] of idMap.entries()) {
                  if (info.type === 'folder' && path.dirname(info.path) === dir && !fs.existsSync(info.path)) {
                    console.log('[FileWatcher] Missing folder found:', id, info.path);
                    // This folder was deleted, check if the new directory is the renamed version
                    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
                      // Update the path in the database
                      const newFolderName = path.basename(fullPath);
                      const sanitizedName = newFolderName.replace(/_/g, ' ');
                      
                      console.log('[FileWatcher] Updating folder path in DB:', id, 'from', info.path, 'to', fullPath);
                      
                      db.prepare('UPDATE folders SET name = ?, folder_path = ? WHERE id = ?').run(sanitizedName, fullPath, id);
                      filePathMap.delete(info.path);
                      filePathMap.set(fullPath, { type: 'folder', id, name: sanitizedName });
                      idMap.set(id, { type: 'folder', path: fullPath, name: sanitizedName });
                      mainWindow?.webContents.send('file-renamed', { type: 'folder', id, newName: sanitizedName });
                      
                      console.log('[FileWatcher] Successfully updated folder:', id, sanitizedName);
                      break;
                    }
                  }
                }
              }, 500);
            }
          }
        });
        
        watchers.push(watcher);
        console.log('[FileWatcher] Watching directory:', dir);
      } catch (err) {
        console.error('[FileWatcher] Failed to watch directory:', dir, err);
      }
    }
    
    // Store watchers for cleanup
    (fileWatcher as any) = { close: () => watchers.forEach(w => w.close()) };
  } catch (err) {
    console.error('[FileWatcher] Failed to setup file watcher:', err);
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
      const { filePath } = projectsDb.deleteProject(id);
      
      // Delete the physical file if it exists
      if (filePath && fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error('[projects:delete] Failed to delete file:', err);
        }
      }
      
      return true;
    })
  );

  ipcMain.handle('folders:getAll', () =>
    wrapHandler(() => foldersDb.getAllFolders())
  );
  ipcMain.handle('folders:getById', (_e, id: number) =>
    wrapHandler(() => foldersDb.getFolderById(id))
  );
  ipcMain.handle(
    'folders:create',
    (
      _e,
      data: {
        name: string;
        description?: string;
        folder_path?: string;
      }
    ) => wrapHandler(() => foldersDb.createFolder(data))
  );
  ipcMain.handle(
    'folders:update',
    (
      _e,
      data: {
        id: number;
        name?: string;
        description?: string;
        folder_path?: string;
      }
    ) => wrapHandler(() => foldersDb.updateFolder(data))
  );
  ipcMain.handle('folders:delete', (_e, id: number, option: 'move' | 'delete' = 'move') =>
    wrapHandler(() => {
      console.log('[folders:delete] Starting deletion with option:', option, 'for folder id:', id);
      const folder = foldersDb.getFolderById(id);
      const db = getDatabase();
      
      if (option === 'delete') {
        console.log('[folders:delete] Option is DELETE - will delete all projects');
        // Delete all projects in the folder
        const projects = db.prepare('SELECT id, file_path FROM projects WHERE folder_id = ?').all(id) as Array<{ id: number; file_path: string | null }>;
        console.log('[folders:delete] Found projects to delete:', projects.length);
        
        for (const project of projects) {
          console.log('[folders:delete] Deleting project:', project.id, 'with file:', project.file_path);
          if (project.file_path && fs.existsSync(project.file_path)) {
            try {
              fs.unlinkSync(project.file_path);
              console.log('[folders:delete] Deleted file:', project.file_path);
            } catch (err) {
              console.error('[folders:delete] Failed to delete project file:', err);
            }
          }
          db.prepare('DELETE FROM projects WHERE id = ?').run(project.id);
          console.log('[folders:delete] Deleted project from DB:', project.id);
        }
      } else {
        console.log('[folders:delete] Option is MOVE - will move projects to root');
        // Move projects to root (set folder_id to null) and move physical files to default location
        const projects = db.prepare('SELECT id, file_path FROM projects WHERE folder_id = ?').all(id) as Array<{ id: number; file_path: string | null }>;
        console.log('[folders:delete] Found projects to move:', projects.length);
        
        for (const project of projects) {
          console.log('[folders:delete] Moving project:', project.id, 'with file:', project.file_path);
          // Set folder_id to null
          db.prepare('UPDATE projects SET folder_id = NULL WHERE id = ?').run(project.id);
          console.log('[folders:delete] Set folder_id to NULL for project:', project.id);
          
          // Move physical file to default location if it exists
          if (project.file_path && fs.existsSync(project.file_path)) {
            try {
              const os = require('os');
              const desktopPath = path.join(os.homedir(), 'Desktop');
              const bilpowFolder = path.join(desktopPath, 'Projet BilPow');
              
              if (!fs.existsSync(bilpowFolder)) {
                fs.mkdirSync(bilpowFolder, { recursive: true });
              }
              
              const fileName = path.basename(project.file_path);
              const newFilePath = path.join(bilpowFolder, fileName);
              
              // Only move if not already in BilPow folder
              if (project.file_path !== newFilePath) {
                fs.copyFileSync(project.file_path, newFilePath);
                fs.unlinkSync(project.file_path);
                db.prepare('UPDATE projects SET file_path = ? WHERE id = ?').run(newFilePath, project.id);
                console.log('[folders:delete] Moved file from:', project.file_path, 'to:', newFilePath);
              }
            } catch (err) {
              console.error('[folders:delete] Failed to move project file to BilPow folder:', err);
            }
          }
        }
      }
      
      // Delete the physical folder
      if (folder?.folder_path && fs.existsSync(folder.folder_path)) {
        try {
          fs.rmSync(folder.folder_path, { recursive: true, force: true });
          console.log('[folders:delete] Deleted physical folder:', folder.folder_path);
        } catch (err) {
          console.error('[folders:delete] Failed to delete physical folder:', err);
        }
      }
      
      foldersDb.deleteFolder(id);
      console.log('[folders:delete] Deleted folder from DB:', id);
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

// DevTools handler
ipcMain.handle('devtools:open', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.openDevTools();
  }
  return Promise.resolve();
});

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
        repere_prefix?: string | null;
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
    (_e, payload: PanelSavePayload) =>
      wrapHandler(() => applyPanelChanges(payload.panelId, payload.changes))
  );

  ipcMain.handle('panel:showSaveDialog', async (_e, defaultName: string) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Enregistrer le projet',
      defaultPath: defaultName,
      filters: [{ name: 'Projet BilPow', extensions: ['bilpow'] }],
    });
    return { canceled, filePath: filePath || null };
  });

  ipcMain.handle('projects:showSaveDialog', async (_e, defaultName: string) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: 'Enregistrer le nouveau projet',
      defaultPath: defaultName,
      filters: [{ name: 'Projet BilPow', extensions: ['bilpow'] }],
    });
    return { canceled, filePath: filePath || null };
  });

  ipcMain.handle('folders:showFolderDialog', async (_e, defaultName: string) => {
    try {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: 'Choisir l\'emplacement du dossier',
        properties: ['openDirectory', 'createDirectory'],
      });
      
      if (canceled || !filePaths || filePaths.length === 0) {
        return { canceled: true, filePath: null };
      }
      
      const parentPath = filePaths[0]!;
      const newFolderPath = path.join(parentPath, defaultName || 'Nouveau Dossier');
      
      // Create the physical folder
      if (!fs.existsSync(newFolderPath)) {
        fs.mkdirSync(newFolderPath, { recursive: true });
      }
      
      return { canceled: false, filePath: newFolderPath };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      console.error('[folders:showFolderDialog]', message);
      throw new Error(message);
    }
  });

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
  ipcMain.handle('favorites:update', (_e, data: UpdateFavoriteInput) =>
    wrapHandler(() => favoritesDb.updateFavorite(data))
  );
  ipcMain.handle('favorites:delete', (_e, id: number) =>
    wrapHandler(() => {
      favoritesDb.deleteFavorite(id);
      return true;
    })
  );

  ipcMain.handle(
    'export:exportLocationToExcel',
    (_e, locationId: number, company?: CompanySettings, panelIds?: number[]) =>
      wrapAsyncHandler(() => exportLocationToExcel(locationId, company, panelIds))
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
    wrapAsyncHandler(() => shell.openPath(filePath))
  );

  ipcMain.handle('project:export', async (_e, projectId: number) => {
    try {
      const data = exportProjectForBilpow(projectId);
      const defaultName = `${sanitizeFileName(data.project.name)}.bilpow`;

      // Get project's folder to determine default save location
      const db = getDatabase();
      const project = db.prepare('SELECT folder_id FROM projects WHERE id = ?').get(projectId) as { folder_id: number | null } | undefined;
      
      let defaultPath = defaultName;
      if (project?.folder_id) {
        const folder = db.prepare('SELECT folder_path FROM folders WHERE id = ?').get(project.folder_id) as { folder_path: string | null } | undefined;
        if (folder?.folder_path) {
          defaultPath = path.join(folder.folder_path, defaultName);
        }
      }

      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Exporter le projet pour partage',
        defaultPath,
        filters: [{ name: 'Projet BilPow', extensions: ['bilpow'] }],
      });

      if (canceled || !filePath) {
        return { success: false, error: 'Export annulé' };
      }

      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      
      // Update the project's file_path in the database
      db.prepare('UPDATE projects SET file_path = ? WHERE id = ?').run(filePath, projectId);
      
      // shell.showItemInFolder(filePath);
      return { success: true, filePath };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      console.error('[project:export]', message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('project:exportWithPath', async (_e, projectId: number, filePath: string) => {
    try {
      const data = exportProjectForBilpow(projectId);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      
      // Update the project's file_path in the database
      const db = getDatabase();
      db.prepare('UPDATE projects SET file_path = ? WHERE id = ?').run(filePath, projectId);
      
      return { success: true, filePath };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      console.error('[project:exportWithPath]', message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('app:hasUnsavedChanges', () => {
    return { success: true, data: hasUnsavedChanges };
  });

  ipcMain.handle('app:setUnsavedChanges', (_e, value: boolean) => {
    hasUnsavedChanges = value;
    return { success: true, data: hasUnsavedChanges };
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
      
      if (!raw || raw.trim().length === 0) {
        return { success: false, error: 'Fichier vide ou corrompu' };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (parseError) {
        return { 
          success: false, 
          error: 'Fichier JSON invalide — impossible de lire le fichier.' 
        };
      }

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
      const { projectId, projectName, isNew } = importProjectFromBilpow(parsed, filePath);
      return { success: true, projectId, projectName, isNew };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      console.error('[project:import]', message);
      return { success: false, error: message };
    }
  });

  ipcMain.handle('project:restore', async (_e, projectId: number, filePath: string) => {
    try {
      if (!filePath || !fs.existsSync(filePath)) {
        return { success: false, error: 'Fichier introuvable' };
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      
      if (!raw || raw.trim().length === 0) {
        return { success: false, error: 'Fichier vide ou corrompu' };
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (parseError) {
        return { 
          success: false, 
          error: 'Fichier JSON invalide — impossible de lire le fichier.' 
        };
      }

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
      const { projectName } = restoreProjectFromBilpow(projectId, parsed);
      return { success: true, projectId, projectName };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur inconnue';
      console.error('[project:restore]', message);
      return { success: false, error: message };
    }
  });
}

app.whenReady().then(async () => {
  // Base SQLite dans userData — valide en dev et en production
  // path.join(app.getPath('userData'), 'bilpow.db') — voir database/db.ts
  if (isDev) {
    console.log('[BilPow] Database path:', getDatabasePath());
  }

  pendingBilpowImportPath = findBilpowArgPath(process.argv);

  getDatabase();
  registerIpcHandlers();
  createWindow();
  await setupFileWatcher();

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
  if (fileWatcher) {
    fileWatcher.close();
  }
  closeDatabase();
});
