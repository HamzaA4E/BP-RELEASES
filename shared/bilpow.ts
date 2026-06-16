import type {
  ElementRowKind,
  ElementType,
  JdbCategory,
  PhaseType,
} from './types';

export const BILPOW_VERSION = '1.0';
export const BILPOW_EXPORTED_BY = 'BilPow Desktop';

export interface BilpowProjectData {
  id: number;
  name: string;
  client: string;
  description: string;
  created_at: string;
}

export interface BilpowElementData {
  type: ElementType;
  repere: string;
  designation: string;
  type_label: string;
  emplacement: string;
  row_kind: ElementRowKind;
  bar_set_index: number;
  power_w: number;
  quantity: number;
  distance_m: number;
  phase_type: PhaseType;
  coef_ks: number;
  coef_ku: number;
  coef_fp: number;
  ku: number;
  ks: number;
  fp: number;
  jdb_category: JdbCategory | null;
  circuit: string;
  notes: string;
  order_index: number;
}

export interface BilpowPanelData {
  name: string;
  description: string;
  general_breaker_ampere: number;
  coef_ks?: number;
  coef_ku?: number;
  coef_fp?: number;
  order_index: number;
  elements: BilpowElementData[];
}

export interface BilpowLocationData {
  name: string;
  order_index: number;
  panels: BilpowPanelData[];
}

export interface BilpowFile {
  bilpow_version: string;
  exported_at: string;
  exported_by: string;
  project: BilpowProjectData;
  locations: BilpowLocationData[];
}

export interface ProjectExportResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export interface ProjectImportResult {
  success: boolean;
  projectId?: number;
  projectName?: string;
  isNew?: boolean;
  error?: string;
}

export function isBilpowFile(value: unknown): value is BilpowFile {
  if (value == null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.bilpow_version === 'string';
}
