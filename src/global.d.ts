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
  CompanySettings,
  UpdateCompanySettingsInput,
  UploadLogoResult,
  ExcelExportResult,
  ProjectExcelExportPayload,
  PanelSavePayload,
  PanelSaveResult,
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
    saveChanges: (payload: PanelSavePayload & { filePath?: string }) => Promise<PanelSaveResult>;
    showSaveDialog: (defaultName: string) => Promise<{ canceled: boolean; filePath: string | null }>;
  };
  elements: {
    getByPanel: (panelId: number) => Promise<Element[]>;
    create: (data: CreateElementInput) => Promise<Element>;
    update: (data: UpdateElementInput) => Promise<Element>;
    delete: (id: number) => Promise<boolean>;
    reorder: (panelId: number, orderedIds: number[]) => Promise<boolean>;
    getArticles: (elementId: number) => Promise<Article[]>;
    createArticle: (data: CreateArticleInput) => Promise<Article>;
    updateArticle: (data: UpdateArticleInput) => Promise<Article>;
    deleteArticle: (id: number) => Promise<boolean>;
  };
  favorites: {
    getAll: () => Promise<Favorite[]>;
    create: (data: CreateFavoriteInput) => Promise<Favorite>;
    delete: (id: number) => Promise<boolean>;
  };
  export: {
    exportLocationToExcel: (
      locationId: number,
      company?: CompanySettings,
      panelIds?: number[]
    ) => Promise<ExcelExportResult>;
    exportProjectToPdf: (
      projectId: number,
      company?: CompanySettings
    ) => Promise<string | null>;
    exportProjectExcel: (
      payload: ProjectExcelExportPayload,
      company?: CompanySettings
    ) => Promise<ExcelExportResult>;
  };
  settings: {
    get: () => Promise<CompanySettings>;
    save: (data: UpdateCompanySettingsInput) => Promise<boolean>;
    uploadLogo: () => Promise<UploadLogoResult | null>;
    removeLogo: () => Promise<boolean>;
    uploadClientLogo: () => Promise<UploadLogoResult | null>;
    removeClientLogo: () => Promise<boolean>;
  };
  app: {
    getPlatform: () => Promise<string>;
    getNativeTheme: () => Promise<boolean>;
    setNativeTheme: (theme: 'dark' | 'light' | 'system') => Promise<boolean>;
  };
  shell: {
    openPath: (filePath: string) => Promise<string>;
  };
  project: {
    export: (projectId: number) => Promise<ProjectExportResult>;
    exportWithPath: (projectId: number, filePath: string) => Promise<ProjectExportResult>;
    import: (filePath?: string) => Promise<ProjectImportResult>;
    onAutoImport: (callback: (filePath: string) => void) => () => void;
  };
  menu: {
    onNewProject: (callback: () => void) => () => void;
    onOpenProject: (callback: () => void) => () => void;
    onSave: (callback: () => void) => () => void;
  };
}

declare global {
  interface Window {
    bilpow: BilPowAPI;
  }
}

export {};
