import { contextBridge, ipcRenderer } from 'electron';
import type {
  ProjectExportResult,
  ProjectImportResult,
} from '../shared/bilpow';
import type {
  Folder,
  Project,
  ProjectWithStats,
  Location,
  LocationWithStats,
  Panel,
  PanelWithStats,
  Element,
  Article,
  Favorite,
  CreateProjectInput,
  UpdateProjectInput,
  CreateLocationInput,
  UpdateLocationInput,
  CreatePanelInput,
  UpdatePanelInput,
  CreateElementInput,
  UpdateElementInput,
  CreateArticleInput,
  UpdateArticleInput,
  CreateFavoriteInput,
  UpdateFavoriteInput,
  CompanySettings,
  UpdateCompanySettingsInput,
  UploadLogoResult,
  ExcelExportResult,
  ProjectExcelExportPayload,
  IpcResponse,
  PanelSavePayload,
  PanelSaveResult,
} from '../shared/types';

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = (await ipcRenderer.invoke(channel, ...args)) as IpcResponse<T>;
  if (!response.success) {
    throw new Error(response.error ?? 'IPC call failed');
  }
  return response.data as T;
}

const api = {
  folders: {
    getAll: (): Promise<Folder[]> => invoke('folders:getAll'),
    getById: (id: number): Promise<Folder | undefined> =>
      invoke('folders:getById', id),
    create: (data: { name: string; description?: string; folder_path?: string }): Promise<Folder> =>
      invoke('folders:create', data),
    update: (data: { id: number; name?: string; description?: string; folder_path?: string }): Promise<Folder> =>
      invoke('folders:update', data),
    delete: (id: number, option?: 'move' | 'delete'): Promise<boolean> => invoke('folders:delete', id, option),
    showFolderDialog: (defaultName: string): Promise<{ canceled: boolean; filePath: string | null }> =>
      ipcRenderer.invoke('folders:showFolderDialog', defaultName) as Promise<{ canceled: boolean; filePath: string | null }>,
  },
  projects: {
    getAll: (): Promise<ProjectWithStats[]> => invoke('projects:getAll'),
    getById: (id: number): Promise<Project | undefined> =>
      invoke('projects:getById', id),
    create: (data: CreateProjectInput): Promise<Project> =>
      invoke('projects:create', data),
    update: (data: UpdateProjectInput): Promise<Project> =>
      invoke('projects:update', data),
    delete: (id: number): Promise<boolean> => invoke('projects:delete', id),
    showSaveDialog: (defaultName: string): Promise<{ canceled: boolean; filePath: string | null }> =>
      ipcRenderer.invoke('projects:showSaveDialog', defaultName) as Promise<{ canceled: boolean; filePath: string | null }>,
  },
  locations: {
    getByProject: (projectId: number): Promise<LocationWithStats[]> =>
      invoke('locations:getByProject', projectId),
    create: (data: CreateLocationInput): Promise<Location> =>
      invoke('locations:create', data),
    update: (data: UpdateLocationInput): Promise<Location> =>
      invoke('locations:update', data),
    delete: (id: number): Promise<boolean> => invoke('locations:delete', id),
    reorder: (projectId: number, orderedIds: number[]): Promise<boolean> =>
      invoke('locations:reorder', projectId, orderedIds),
    duplicate: (id: number): Promise<Location> =>
      invoke('locations:duplicate', id),
  },
  panels: {
    getByLocation: (locationId: number): Promise<PanelWithStats[]> =>
      invoke('panels:getByLocation', locationId),
    create: (data: CreatePanelInput): Promise<Panel> =>
      invoke('panels:create', data),
    update: (data: UpdatePanelInput): Promise<Panel> =>
      invoke('panels:update', data),
    delete: (id: number): Promise<boolean> => invoke('panels:delete', id),
    duplicate: (id: number): Promise<Panel> =>
      invoke('panels:duplicate', id),
    saveChanges: (payload: PanelSavePayload & { filePath?: string }): Promise<PanelSaveResult> =>
      invoke('panel:saveChanges', payload),
    showSaveDialog: (defaultName: string): Promise<{ canceled: boolean; filePath: string | null }> =>
      invoke('panel:showSaveDialog', defaultName),
  },
  elements: {
    getByPanel: (panelId: number): Promise<Element[]> =>
      invoke('elements:getByPanel', panelId),
    create: (data: CreateElementInput): Promise<Element> =>
      invoke('elements:create', data),
    update: (data: UpdateElementInput): Promise<Element> =>
      invoke('elements:update', data),
    delete: (id: number): Promise<boolean> => invoke('elements:delete', id),
    reorder: (panelId: number, orderedIds: number[]): Promise<boolean> =>
      invoke('elements:reorder', panelId, orderedIds),
    getArticles: (elementId: number): Promise<Article[]> =>
      invoke('elements:getArticles', elementId),
    createArticle: (data: CreateArticleInput): Promise<Article> =>
      invoke('elements:createArticle', data),
    updateArticle: (data: UpdateArticleInput): Promise<Article> =>
      invoke('elements:updateArticle', data),
    deleteArticle: (id: number): Promise<boolean> =>
      invoke('elements:deleteArticle', id),
  },
  favorites: {
    getAll: (): Promise<Favorite[]> => invoke('favorites:getAll'),
    create: (data: CreateFavoriteInput): Promise<Favorite> =>
      invoke('favorites:create', data),
    update: (data: UpdateFavoriteInput): Promise<Favorite> =>
      invoke('favorites:update', data),
    delete: (id: number): Promise<boolean> => invoke('favorites:delete', id),
  },
  export: {
    exportLocationToExcel: (
      locationId: number,
      company?: CompanySettings,
      panelIds?: number[]
    ): Promise<ExcelExportResult> =>
      invoke('export:exportLocationToExcel', locationId, company, panelIds),
    exportProjectToPdf: (
      projectId: number,
      company?: CompanySettings
    ): Promise<string | null> =>
      invoke('export:exportProjectToPdf', projectId, company),
    exportProjectExcel: (
      payload: ProjectExcelExportPayload,
      company?: CompanySettings
    ): Promise<ExcelExportResult> =>
      invoke('export:projectExcel', payload, company),
  },
  settings: {
    get: (): Promise<CompanySettings> => invoke('settings:get'),
    save: (data: UpdateCompanySettingsInput): Promise<boolean> =>
      invoke('settings:save', data),
    uploadLogo: (): Promise<UploadLogoResult | null> => invoke('settings:uploadLogo'),
    removeLogo: (): Promise<boolean> => invoke('settings:removeLogo'),
    uploadClientLogo: (): Promise<UploadLogoResult | null> =>
      invoke('settings:uploadClientLogo'),
    removeClientLogo: (): Promise<boolean> => invoke('settings:removeClientLogo'),
  },
  app: {
    getPlatform: (): Promise<string> => invoke('app:getPlatform'),
    getNativeTheme: (): Promise<boolean> => invoke('app:getNativeTheme'),
    setNativeTheme: (theme: 'dark' | 'light' | 'system'): Promise<boolean> =>
      invoke('app:setNativeTheme', theme),
    hasUnsavedChanges: (): Promise<boolean> => invoke('app:hasUnsavedChanges'),
    setUnsavedChanges: (value: boolean): Promise<boolean> =>
      invoke('app:setUnsavedChanges', value),
  },
  shell: {
    openPath: (filePath: string): Promise<string> =>
      invoke('shell:openPath', filePath),
    openLocation: (itemType: 'project' | 'folder', itemId: number): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('shell:openLocation', itemType, itemId) as Promise<{ success: boolean; error?: string }>,
  },
  project: {
    export: (projectId: number): Promise<ProjectExportResult> =>
      ipcRenderer.invoke('project:export', projectId) as Promise<ProjectExportResult>,
    exportWithPath: (projectId: number, filePath: string): Promise<ProjectExportResult> =>
      ipcRenderer.invoke('project:exportWithPath', projectId, filePath) as Promise<ProjectExportResult>,
    import: (filePath?: string): Promise<ProjectImportResult> =>
      ipcRenderer.invoke('project:import', filePath) as Promise<ProjectImportResult>,
    restore: (projectId: number, filePath: string): Promise<ProjectImportResult> =>
      ipcRenderer.invoke('project:restore', projectId, filePath) as Promise<ProjectImportResult>,
    onAutoImport: (callback: (filePath: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, filePath: string): void => {
        callback(filePath);
      };
      ipcRenderer.on('auto-import', listener);
      return () => {
        ipcRenderer.removeListener('auto-import', listener);
      };
    },
    onFileRenamed: (callback: (data: { type: 'project' | 'folder'; id: number; newName: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { type: 'project' | 'folder'; id: number; newName: string }): void => {
        callback(data);
      };
      ipcRenderer.on('file-renamed', listener);
      return () => {
        ipcRenderer.removeListener('file-renamed', listener);
      };
    },
  },
  menu: {
    onNewProject: (callback: () => void): (() => void) => {
      const listener = (): void => { callback(); };
      ipcRenderer.on('menu:new-project', listener);
      return () => { ipcRenderer.removeListener('menu:new-project', listener); };
    },
    onOpenProject: (callback: () => void): (() => void) => {
      const listener = (): void => { callback(); };
      ipcRenderer.on('menu:open-project', listener);
      return () => { ipcRenderer.removeListener('menu:open-project', listener); };
    },
    onSave: (callback: () => void): (() => void) => {
      const listener = (): void => { callback(); };
      ipcRenderer.on('menu:save', listener);
      return () => { ipcRenderer.removeListener('menu:save', listener); };
    },
  },
  devtools: {
    open: (): Promise<void> => invoke('devtools:open'),
  },
  update: {
    checkForUpdates: (): Promise<{ success: boolean }> => invoke('update:checkForUpdates'),
    installUpdate: (): Promise<{ success: boolean }> => invoke('update:installUpdate'),
    getCurrentVersion: (): Promise<string> => invoke('update:getCurrentVersion'),
    onUpdateAvailable: (callback: (data: { version: string; releaseDate?: string; releaseNotes?: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { version: string; releaseDate?: string; releaseNotes?: string }): void => {
        callback(data);
      };
      ipcRenderer.on('update-available', listener);
      return () => {
        ipcRenderer.removeListener('update-available', listener);
      };
    },
    onUpdateNotAvailable: (callback: (data: { version: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { version: string }): void => {
        callback(data);
      };
      ipcRenderer.on('update-not-available', listener);
      return () => {
        ipcRenderer.removeListener('update-not-available', listener);
      };
    },
    onUpdateProgress: (callback: (data: { percent: number; transferred: number; total: number; bytesPerSecond: number; transferredFormatted: string; totalFormatted: string; speedFormatted: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { percent: number; transferred: number; total: number; bytesPerSecond: number; transferredFormatted: string; totalFormatted: string; speedFormatted: string }): void => {
        callback(data);
      };
      ipcRenderer.on('update-progress', listener);
      return () => {
        ipcRenderer.removeListener('update-progress', listener);
      };
    },
    onUpdateDownloaded: (callback: (data: { version: string; releaseDate?: string; releaseNotes?: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { version: string; releaseDate?: string; releaseNotes?: string }): void => {
        callback(data);
      };
      ipcRenderer.on('update-downloaded', listener);
      return () => {
        ipcRenderer.removeListener('update-downloaded', listener);
      };
    },
    onUpdateError: (callback: (data: { message: string; stack?: string }) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, data: { message: string; stack?: string }): void => {
        callback(data);
      };
      ipcRenderer.on('update-error', listener);
      return () => {
        ipcRenderer.removeListener('update-error', listener);
      };
    },
  },
};

export type BilPowAPI = typeof api;

contextBridge.exposeInMainWorld('bilpow', api);

declare global {
  interface Window {
    bilpow: BilPowAPI;
  }
}
