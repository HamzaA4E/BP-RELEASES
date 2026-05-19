export type ElementType = 'eclairage' | 'prise' | 'attente' | 'jeu_de_barres';
export type ElementRowKind = 'element' | 'bar_set';
export type PhaseType = 'mono' | 'tri';
export type JdbCategory = 'eclairage' | 'prise' | null;

export interface Project {
  id: number;
  name: string;
  client: string | null;
  engineer: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectWithStats extends Project {
  location_count: number;
  total_power_w: number;
}

export interface Location {
  id: number;
  project_id: number;
  name: string;
  order_index: number;
}

export interface LocationWithStats extends Location {
  total_power_w: number;
  panel_count: number;
}

export interface Panel {
  id: number;
  location_id: number;
  name: string;
  description: string | null;
  general_breaker_ampere: number;
  order_index: number;
}

export interface PanelWithStats extends Panel {
  element_count: number;
  installed_power_w: number;
  absorbed_power_w: number;
  used_power_w: number;
}

export interface Element {
  id: number;
  panel_id: number;
  type: ElementType;
  repere: string;
  /** @deprecated Synced with type_label — kept for legacy data and exports */
  designation: string;
  type_label: string;
  emplacement: string;
  row_kind: ElementRowKind;
  bar_set_index: number;
  phase_type: PhaseType;
  jdb_category: JdbCategory;
  power_w: number;
  quantity: number;
  distance_m: number;
  ku: number;
  ks: number;
  fp: number;
  coef_ks: number;
  coef_ku: number;
  coef_fp: number;
  circuit: string | null;
  notes: string | null;
  order_index: number;
}

export interface Favorite {
  id: number;
  type: ElementType;
  designation: string;
  power_w: number;
  color: string;
}

export interface CreateProjectInput {
  name: string;
  client?: string;
  engineer?: string;
  description?: string;
}

export interface UpdateProjectInput {
  id: number;
  name?: string;
  client?: string;
  engineer?: string;
  description?: string;
}

export interface CreateLocationInput {
  project_id: number;
  name: string;
}

export interface UpdateLocationInput {
  id: number;
  name?: string;
}

export interface CreatePanelInput {
  location_id: number;
  name: string;
  description?: string;
  general_breaker_ampere?: number;
}

export interface UpdatePanelInput {
  id: number;
  name?: string;
  description?: string;
  general_breaker_ampere?: number;
}

export interface CreateElementInput {
  panel_id: number;
  type: ElementType;
  repere: string;
  type_label: string;
  emplacement?: string;
  row_kind?: ElementRowKind;
  bar_set_index?: number;
  phase_type?: PhaseType;
  jdb_category?: JdbCategory;
  power_w: number;
  quantity: number;
  distance_m?: number;
  ku?: number;
  ks?: number;
  fp?: number;
  coef_ks?: number;
  coef_ku?: number;
  coef_fp?: number;
  circuit?: string;
  notes?: string;
}

export interface UpdateElementInput {
  id: number;
  type?: ElementType;
  repere?: string;
  type_label?: string;
  emplacement?: string;
  phase_type?: PhaseType;
  jdb_category?: JdbCategory;
  power_w?: number;
  quantity?: number;
  distance_m?: number;
  ku?: number;
  ks?: number;
  fp?: number;
  coef_ks?: number;
  coef_ku?: number;
  coef_fp?: number;
  circuit?: string;
  notes?: string;
}

export interface CreateFavoriteInput {
  type: ElementType;
  designation: string;
  power_w: number;
  color?: string;
}

export interface CompanySettings {
  id: number;
  company_name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo_path: string;
  logo_base64: string;
  logo_mime: string;
  updated_at: string;
}

export type UpdateCompanySettingsInput = Partial<
  Omit<CompanySettings, 'id' | 'updated_at'>
>;

export interface UploadLogoResult {
  base64: string;
  mime: string;
  path: string;
}

export interface ExcelExportResult {
  filePath: string | null;
  warning?: string;
}

export interface IpcResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type SelectionType = 'project' | 'location' | 'panel' | null;

export interface AppSelection {
  type: SelectionType;
  projectId: number | null;
  locationId: number | null;
  panelId: number | null;
}
