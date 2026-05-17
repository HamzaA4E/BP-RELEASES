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
} from '../shared/types';

export interface BilPowAPI {
  projects: {
    getAll: () => Promise<ProjectWithStats[]>;
    getById: (id: number) => Promise<Project | undefined>;
    create: (data: CreateProjectInput) => Promise<Project>;
    update: (data: UpdateProjectInput) => Promise<Project>;
    delete: (id: number) => Promise<boolean>;
  };
  locations: {
    getByProject: (projectId: number) => Promise<LocationWithStats[]>;
    create: (data: CreateLocationInput) => Promise<Location>;
    update: (data: UpdateLocationInput) => Promise<Location>;
    delete: (id: number) => Promise<boolean>;
    reorder: (projectId: number, orderedIds: number[]) => Promise<boolean>;
    duplicate: (id: number) => Promise<Location>;
  };
  panels: {
    getByLocation: (locationId: number) => Promise<PanelWithStats[]>;
    create: (data: CreatePanelInput) => Promise<Panel>;
    update: (data: UpdatePanelInput) => Promise<Panel>;
    delete: (id: number) => Promise<boolean>;
    duplicate: (id: number) => Promise<Panel>;
  };
  elements: {
    getByPanel: (panelId: number) => Promise<Element[]>;
    create: (data: CreateElementInput) => Promise<Element>;
    update: (data: UpdateElementInput) => Promise<Element>;
    delete: (id: number) => Promise<boolean>;
    reorder: (panelId: number, orderedIds: number[]) => Promise<boolean>;
  };
  favorites: {
    getAll: () => Promise<Favorite[]>;
    create: (data: CreateFavoriteInput) => Promise<Favorite>;
    delete: (id: number) => Promise<boolean>;
  };
  export: {
    exportLocationToExcel: (
      locationId: number,
      company?: CompanySettings
    ) => Promise<ExcelExportResult>;
    exportProjectToPdf: (
      projectId: number,
      company?: CompanySettings
    ) => Promise<string | null>;
  };
  settings: {
    get: () => Promise<CompanySettings>;
    save: (data: UpdateCompanySettingsInput) => Promise<boolean>;
    uploadLogo: () => Promise<UploadLogoResult | null>;
    removeLogo: () => Promise<boolean>;
  };
  app: {
    getPlatform: () => Promise<string>;
    getNativeTheme: () => Promise<boolean>;
    setNativeTheme: (theme: 'dark' | 'light' | 'system') => Promise<boolean>;
  };
  shell: {
    openPath: (filePath: string) => Promise<string>;
  };
}

declare global {
  interface Window {
    bilpow: BilPowAPI;
  }
}

export {};
