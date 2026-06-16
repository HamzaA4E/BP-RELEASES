import { getDatabase } from './db';
import { getProjectById } from './projects';
import { getElementsByPanel } from './elements';
import type { ElementRow } from './elements';
import type { PanelRow } from './panels';
import type { LocationRow } from './locations';
import {
  BILPOW_EXPORTED_BY,
  BILPOW_VERSION,
  type BilpowElementData,
  type BilpowFile,
  type BilpowLocationData,
  type BilpowPanelData,
} from '../../shared/bilpow';
import { resolveJdbCategory, type ElementType, type PhaseType } from '../../shared/types';

function elementToExport(el: ElementRow): BilpowElementData {
  return {
    type: el.type,
    repere: el.repere,
    designation: el.type_label,
    type_label: el.type_label,
    emplacement: el.emplacement,
    row_kind: el.row_kind,
    bar_set_index: el.bar_set_index,
    power_w: el.power_w,
    quantity: el.quantity,
    distance_m: el.distance_m,
    phase_type: el.phase_type,
    coef_ks: el.coef_ks,
    coef_ku: el.coef_ku,
    coef_fp: 1,
    ku: el.ku,
    ks: el.ks,
    fp: 1,
    jdb_category: el.jdb_category,
    circuit: el.circuit ?? '',
    notes: el.notes ?? '',
    order_index: el.order_index,
  };
}

function panelHasCoefColumns(): boolean {
  const db = getDatabase();
  const cols = db.pragma('table_info(panels)') as Array<{ name: string }>;
  return cols.some((c) => c.name === 'coef_ks');
}

function panelToExport(panel: PanelRow & Partial<{ coef_ks: number; coef_ku: number; coef_fp: number }>): BilpowPanelData {
  const elements = getElementsByPanel(panel.id).map(elementToExport);
  const base: BilpowPanelData = {
    name: panel.name,
    description: panel.description ?? '',
    general_breaker_ampere: panel.general_breaker_ampere,
    order_index: panel.order_index,
    elements,
  };
  if (panelHasCoefColumns() && panel.coef_ks != null) {
    base.coef_ks = panel.coef_ks;
    base.coef_ku = panel.coef_ku ?? 1;
    base.coef_fp = panel.coef_fp ?? 1;
  }
  return base;
}

export function exportProjectForBilpow(projectId: number): BilpowFile {
  const project = getProjectById(projectId);
  if (!project) {
    throw new Error('Projet introuvable');
  }

  const db = getDatabase();
  const locations = db
    .prepare(
      'SELECT * FROM locations WHERE project_id = ? ORDER BY order_index, id'
    )
    .all(projectId) as LocationRow[];

  const locationData: BilpowLocationData[] = locations.map((loc) => {
    const panels = db
      .prepare(
        'SELECT * FROM panels WHERE location_id = ? ORDER BY order_index, id'
      )
      .all(loc.id) as Array<
      PanelRow & Partial<{ coef_ks: number; coef_ku: number; coef_fp: number }>
    >;

    return {
      name: loc.name,
      order_index: loc.order_index,
      panels: panels.map(panelToExport),
    };
  });

  return {
    bilpow_version: BILPOW_VERSION,
    exported_at: new Date().toISOString(),
    exported_by: BILPOW_EXPORTED_BY,
    project: {
      id: project.original_id || project.id,
      name: project.name,
      client: project.client ?? '',
      description: project.description ?? '',
      created_at: project.created_at,
    },
    locations: locationData,
  };
}

function resolveImportProjectName(name: string): string {
  const db = getDatabase();
  const existing = db
    .prepare('SELECT id FROM projects WHERE name = ?')
    .get(name) as { id: number } | undefined;
  if (existing) {
    return `${name} (importé)`;
  }
  return name;
}

function insertElement(
  panelId: number,
  el: BilpowElementData
): void {
  const db = getDatabase();
  const type_label = (el.type_label || el.designation || '').trim();
  const isJdb = el.type === 'jeu_de_barres';
  const row_kind = el.row_kind ?? (isJdb ? 'bar_set' : 'element');

  db.prepare(
    `INSERT INTO elements (
      panel_id, type, repere, designation, type_label, emplacement,
      row_kind, bar_set_index, phase_type, jdb_category,
      power_w, quantity, distance_m,
      ku, ks, fp, coef_ks, coef_ku, coef_fp,
      circuit, notes, order_index
    ) VALUES (
      @panel_id, @type, @repere, @designation, @type_label, @emplacement,
      @row_kind, @bar_set_index, @phase_type, @jdb_category,
      @power_w, @quantity, @distance_m,
      @ku, @ks, @fp, @coef_ks, @coef_ku, @coef_fp,
      @circuit, @notes, @order_index
    )`
  ).run({
    panel_id: panelId,
    type: el.type,
    repere: el.repere,
    designation: type_label,
    type_label,
    emplacement: el.emplacement ?? '',
    row_kind,
    bar_set_index: el.bar_set_index ?? 0,
    phase_type: el.phase_type ?? 'mono',
    jdb_category: isJdb ? resolveJdbCategory(el.jdb_category) : null,
    power_w: el.power_w,
    quantity: el.quantity,
    distance_m: el.distance_m ?? 0,
    ku: el.ku ?? 1,
    ks: el.ks ?? 1,
    fp: el.fp ?? 1,
    coef_ks: el.coef_ks,
    coef_ku: el.coef_ku,
    coef_fp: el.coef_fp,
    circuit: el.circuit || null,
    notes: el.notes || null,
    order_index: el.order_index,
  });
}

function insertPanel(
  locationId: number,
  panel: BilpowPanelData
): number {
  const db = getDatabase();
  const hasCoef = panelHasCoefColumns();

  if (hasCoef) {
    const result = db
      .prepare(
        `INSERT INTO panels (
          location_id, name, description, general_breaker_ampere,
          coef_ks, coef_ku, coef_fp, order_index
        ) VALUES (
          @location_id, @name, @description, @general_breaker_ampere,
          @coef_ks, @coef_ku, @coef_fp, @order_index
        )`
      )
      .run({
        location_id: locationId,
        name: panel.name,
        description: panel.description || null,
        general_breaker_ampere: panel.general_breaker_ampere ?? 0,
        coef_ks: panel.coef_ks ?? 0.8,
        coef_ku: panel.coef_ku ?? 1,
        coef_fp: panel.coef_fp ?? 1,
        order_index: panel.order_index,
      });
    return Number(result.lastInsertRowid);
  }

  const result = db
    .prepare(
      `INSERT INTO panels (location_id, name, description, general_breaker_ampere, order_index)
       VALUES (@location_id, @name, @description, @general_breaker_ampere, @order_index)`
    )
    .run({
      location_id: locationId,
      name: panel.name,
      description: panel.description || null,
      general_breaker_ampere: panel.general_breaker_ampere ?? 0,
      order_index: panel.order_index,
    });
  return Number(result.lastInsertRowid);
}

export function importProjectFromBilpow(file: BilpowFile): {
  projectId: number;
  projectName: string;
  isNew: boolean;
} {
  const db = getDatabase();

  // Vérifier si le projet existe déjà par son original_id (si disponible)
  const existingProjectByOriginalId = db
    .prepare('SELECT id, name FROM projects WHERE original_id = ?')
    .get(file.project.id) as { id: number; name: string } | undefined;

  if (existingProjectByOriginalId) {
    // Le projet existe déjà, retourner ses informations
    return { projectId: existingProjectByOriginalId.id, projectName: existingProjectByOriginalId.name, isNew: false };
  }

  // Vérifier si le projet existe déjà par son id local (pour les projets exportés avant la migration)
  const existingProjectById = db
    .prepare('SELECT id, name, original_id FROM projects WHERE id = ?')
    .get(file.project.id) as { id: number; name: string; original_id: number | null } | undefined;

  if (existingProjectById) {
    // Si le projet n'a pas d'original_id, c'est probablement le même projet
    if (!existingProjectById.original_id) {
      // Mettre à jour le projet avec l'original_id pour les futures imports
      db.prepare('UPDATE projects SET original_id = ? WHERE id = ?').run(file.project.id, file.project.id);
      return { projectId: existingProjectById.id, projectName: existingProjectById.name, isNew: false };
    }
  }

  // Le projet n'existe pas, l'importer
  const projectName = resolveImportProjectName(file.project.name);

  const importTx = db.transaction(() => {
    const projectResult = db
      .prepare(
        `INSERT INTO projects (name, client, description, created_at, original_id)
         VALUES (@name, @client, @description, @created_at, @original_id)`
      )
      .run({
        name: projectName,
        client: file.project.client || null,
        description: file.project.description || null,
        created_at: file.project.created_at || new Date().toISOString(),
        original_id: file.project.id,
      });

    const projectId = Number(projectResult.lastInsertRowid);

    for (const location of file.locations ?? []) {
      const locResult = db
        .prepare(
          'INSERT INTO locations (project_id, name, order_index) VALUES (?, ?, ?)'
        )
        .run(projectId, location.name, location.order_index);
      const locationId = Number(locResult.lastInsertRowid);

      for (const panel of location.panels) {
        const panelId = insertPanel(locationId, panel);
        const sortedElements = [...panel.elements].sort(
          (a, b) => a.order_index - b.order_index
        );
        for (const el of sortedElements) {
          insertElement(panelId, el);
        }
      }
    }

    return { projectId, projectName, isNew: true };
  });

  return importTx();
}

export function validateBilpowElements(locations: BilpowFile['locations']): void {
  for (const loc of locations) {
    for (const panel of loc.panels) {
      for (const el of panel.elements) {
        const validTypes: ElementType[] = [
          'eclairage',
          'prise',
          'divers',
          'jeu_de_barres',
        ];
        if (!validTypes.includes(el.type)) {
          throw new Error(`Type d'élément invalide: ${String(el.type)}`);
        }
        const phase = el.phase_type as PhaseType;
        if (phase !== 'mono' && phase !== 'tri') {
          throw new Error(`Type de phase invalide pour ${el.repere}`);
        }
        if (
          el.jdb_category != null &&
          el.jdb_category !== 'eclairage' &&
          el.jdb_category !== 'prise'
        ) {
          throw new Error(`Catégorie JDB invalide pour ${el.repere}`);
        }
      }
    }
  }
}
