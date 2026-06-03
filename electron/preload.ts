import { contextBridge, ipcRenderer } from 'electron';
import type {
  ProjectExportResult,
  ProjectImportResult,
} from '../shared/bilpow';
import type {
  Project,
  ProjectWithStats,
  Location,
  LocationWithStats,
  Panel,
  PanelWithStats,
  Element,
  Favorite,
  CreateProjectInput,
  UpdateProjectInput,
  CreateLocationInput,
  UpdateLocationInput,
  CreatePanelInput,
  UpdatePanelInput,
  CreateElementInput,
  UpdateElementInput,
  CreateFavoriteInput,
  CompanySettings,
  UpdateCompanySettingsInput,
  UploadLogoResult,
  ExcelExportResult,
  IpcResponse,
} from '../shared/types';

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = (await ipcRenderer.invoke(channel, ...args)) as IpcResponse<T>;
  if (!response.success) {
    throw new Error(response.error ?? 'IPC call failed');
  }
  return response.data as T;
}

const api = {
  projects: {
    getAll: (): Promise<ProjectWithStats[]> => invoke('projects:getAll'),
    getById: (id: number): Promise<Project | undefined> =>
      invoke('projects:getById', id),
    create: (data: CreateProjectInput): Promise<Project> =>
      invoke('projects:create', data),
    update: (data: UpdateProjectInput): Promise<Project> =>
      invoke('projects:update', data),
    delete: (id: number): Promise<boolean> => invoke('projects:delete', id),
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
  },
  favorites: {
    getAll: (): Promise<Favorite[]> => invoke('favorites:getAll'),
    create: (data: CreateFavoriteInput): Promise<Favorite> =>
      invoke('favorites:create', data),
    delete: (id: number): Promise<boolean> => invoke('favorites:delete', id),
  },
  export: {
    exportLocationToExcel: (
      locationId: number,
      company?: CompanySettings
    ): Promise<ExcelExportResult> =>
      invoke('export:exportLocationToExcel', locationId, company),
    exportProjectToPdf: (
      projectId: number,
      company?: CompanySettings
    ): Promise<string | null> =>
      invoke('export:exportProjectToPdf', projectId, company),
  },
  settings: {
    get: (): Promise<CompanySettings> => invoke('settings:get'),
    save: (data: UpdateCompanySettingsInput): Promise<boolean> =>
      invoke('settings:save', data),
    uploadLogo: (): Promise<UploadLogoResult | null> => invoke('settings:uploadLogo'),
    removeLogo: (): Promise<boolean> => invoke('settings:removeLogo'),
  },
  app: {
    getPlatform: (): Promise<string> => invoke('app:getPlatform'),
    getNativeTheme: (): Promise<boolean> => invoke('app:getNativeTheme'),
    setNativeTheme: (theme: 'dark' | 'light' | 'system'): Promise<boolean> =>
      invoke('app:setNativeTheme', theme),
  },
  shell: {
    openPath: (filePath: string): Promise<string> =>
      invoke('shell:openPath', filePath),
  },
  project: {
    export: (projectId: number): Promise<ProjectExportResult> =>
      ipcRenderer.invoke('project:export', projectId) as Promise<ProjectExportResult>,
    import: (filePath?: string): Promise<ProjectImportResult> =>
      ipcRenderer.invoke('project:import', filePath) as Promise<ProjectImportResult>,
    onAutoImport: (callback: (filePath: string) => void): (() => void) => {
      const listener = (_event: Electron.IpcRendererEvent, filePath: string): void => {
        callback(filePath);
      };
      ipcRenderer.on('auto-import', listener);
      return () => {
        ipcRenderer.removeListener('auto-import', listener);
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
