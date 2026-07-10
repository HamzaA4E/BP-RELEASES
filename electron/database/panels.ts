import { getDatabase } from './db';
import {
  getElementsByPanel,
  createElement,
  getArticlesByPanel,
  ELEMENT_INSTALLED_POWER_SQL,
} from './elements';
import { panelTotalPower } from '../../shared/powerCalculations';
import type { ElementType } from '../../shared/types';

export interface PanelRow {
  id: number;
  location_id: number;
  name: string;
  description: string | null;
  general_breaker_ampere: number;
  order_index: number;
  coef_ks?: number;
  repere_prefix?: string | null;
}

export interface PanelWithStatsRow extends PanelRow {
  element_count: number;
  installed_power_w: number;
  absorbed_power_w: number;
  used_power_w: number;
}

export function getPanelsByLocation(locationId: number): PanelWithStatsRow[] {
  const db = getDatabase();
  const panels = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM elements e WHERE e.panel_id = p.id) as element_count,
        COALESCE((
          SELECT SUM(${ELEMENT_INSTALLED_POWER_SQL}) FROM elements e
          WHERE e.panel_id = p.id AND e.type != 'jeu_de_barres' AND e.type != 'divers'
        ), 0) as installed_power_w
      FROM panels p
      WHERE p.location_id = ?
      ORDER BY p.order_index, p.id`
    )
    .all(locationId) as Array<
    PanelRow & { element_count: number; installed_power_w: number }
  >;

  return panels.map((p) => {
    const elements = getElementsByPanel(p.id);
    const articlesByElement = getArticlesByPanel(p.id);
    // Convert use_coefs from number to boolean for power calculations
    const elementsForPower = elements.map((el) => ({
      ...el,
      use_coefs: el.use_coefs !== 0,
    }));
    const used_power_w = panelTotalPower(elementsForPower, articlesByElement);
    return {
      ...p,
      absorbed_power_w: used_power_w,
      used_power_w,
    };
  });
}

export function getPanelById(id: number): PanelRow | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM panels WHERE id = ?').get(id) as PanelRow | undefined;
}

export function createPanel(data: {
  location_id: number;
  name: string;
  description?: string;
  general_breaker_ampere?: number;
  repere_prefix?: string | null;
}): PanelRow {
  const db = getDatabase();
  const maxOrder = db
    .prepare(
      'SELECT COALESCE(MAX(order_index), -1) as max_order FROM panels WHERE location_id = ?'
    )
    .get(data.location_id) as { max_order: number };

  const cols = db.pragma('table_info(panels)') as Array<{ name: string }>;
  const hasReperePrefix = cols.some((c) => c.name === 'repere_prefix');

  if (hasReperePrefix) {
    const result = db
      .prepare(
        `INSERT INTO panels (location_id, name, description, general_breaker_ampere, order_index, repere_prefix)
         VALUES (@location_id, @name, @description, @general_breaker_ampere, @order_index, @repere_prefix)`
      )
      .run({
        location_id: data.location_id,
        name: data.name,
        description: data.description ?? null,
        general_breaker_ampere: data.general_breaker_ampere ?? 0,
        order_index: maxOrder.max_order + 1,
        repere_prefix: data.repere_prefix ?? null,
      });

    const panel = getPanelById(Number(result.lastInsertRowid));
    if (!panel) throw new Error('Failed to create panel');
    return panel;
  }

  const result = db
    .prepare(
      `INSERT INTO panels (location_id, name, description, general_breaker_ampere, order_index)
       VALUES (@location_id, @name, @description, @general_breaker_ampere, @order_index)`
    )
    .run({
      location_id: data.location_id,
      name: data.name,
      description: data.description ?? null,
      general_breaker_ampere: data.general_breaker_ampere ?? 0,
      order_index: maxOrder.max_order + 1,
    });

  const panel = getPanelById(Number(result.lastInsertRowid));
  if (!panel) throw new Error('Failed to create panel');
  return panel;
}

export function updatePanel(data: {
  id: number;
  name?: string;
  description?: string;
  general_breaker_ampere?: number;
  coef_ks?: number;
  repere_prefix?: string | null;
}): PanelRow {
  const db = getDatabase();
  const existing = getPanelById(data.id);
  if (!existing) throw new Error('Panel not found');

  const cols = db.pragma('table_info(panels)') as Array<{ name: string }>;
  const hasCoefKs = cols.some((c) => c.name === 'coef_ks');
  const hasReperePrefix = cols.some((c) => c.name === 'repere_prefix');

  if (hasCoefKs && hasReperePrefix) {
    db.prepare(
      `UPDATE panels SET
        name = @name,
        description = @description,
        general_breaker_ampere = @general_breaker_ampere,
        coef_ks = @coef_ks,
        repere_prefix = @repere_prefix
      WHERE id = @id`
    ).run({
      id: data.id,
      name: data.name ?? existing.name,
      description:
        data.description !== undefined ? data.description : existing.description,
      general_breaker_ampere:
        data.general_breaker_ampere !== undefined
          ? data.general_breaker_ampere
          : existing.general_breaker_ampere,
      coef_ks: data.coef_ks !== undefined ? data.coef_ks : (existing.coef_ks ?? 1),
      repere_prefix:
        data.repere_prefix !== undefined
          ? data.repere_prefix
          : existing.repere_prefix,
    });
  } else if (hasCoefKs) {
    db.prepare(
      `UPDATE panels SET
        name = @name,
        description = @description,
        general_breaker_ampere = @general_breaker_ampere,
        coef_ks = @coef_ks
      WHERE id = @id`
    ).run({
      id: data.id,
      name: data.name ?? existing.name,
      description:
        data.description !== undefined ? data.description : existing.description,
      general_breaker_ampere:
        data.general_breaker_ampere !== undefined
          ? data.general_breaker_ampere
          : existing.general_breaker_ampere,
      coef_ks: data.coef_ks !== undefined ? data.coef_ks : (existing.coef_ks ?? 1),
    });
  } else if (hasReperePrefix) {
    db.prepare(
      `UPDATE panels SET
        name = @name,
        description = @description,
        general_breaker_ampere = @general_breaker_ampere,
        repere_prefix = @repere_prefix
      WHERE id = @id`
    ).run({
      id: data.id,
      name: data.name ?? existing.name,
      description:
        data.description !== undefined ? data.description : existing.description,
      general_breaker_ampere:
        data.general_breaker_ampere !== undefined
          ? data.general_breaker_ampere
          : existing.general_breaker_ampere,
      repere_prefix:
        data.repere_prefix !== undefined
          ? data.repere_prefix
          : existing.repere_prefix,
    });
  } else {
    db.prepare(
      `UPDATE panels SET
        name = @name,
        description = @description,
        general_breaker_ampere = @general_breaker_ampere
      WHERE id = @id`
    ).run({
      id: data.id,
      name: data.name ?? existing.name,
      description:
        data.description !== undefined ? data.description : existing.description,
      general_breaker_ampere:
        data.general_breaker_ampere !== undefined
          ? data.general_breaker_ampere
          : existing.general_breaker_ampere,
    });
  }

  const panel = getPanelById(data.id);
  if (!panel) throw new Error('Failed to update panel');
  return panel;
}

export function deletePanel(id: number): void {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM panels WHERE id = ?').run(id);
  if (result.changes === 0) throw new Error('Panel not found');
}

export function duplicatePanel(id: number): PanelRow {
  const source = getPanelById(id);
  if (!source) throw new Error('Panel not found');

  const newPanel = createPanel({
    location_id: source.location_id,
    name: `${source.name} (copie)`,
    description: source.description ?? undefined,
    general_breaker_ampere: source.general_breaker_ampere,
    repere_prefix: source.repere_prefix ?? undefined,
  });

  if (source.coef_ks != null) {
    updatePanel({ id: newPanel.id, coef_ks: source.coef_ks });
  }

  const elements = getElementsByPanel(id);
  for (const el of elements) {
    createElement({
      panel_id: newPanel.id,
      type: el.type as ElementType,
      repere: el.repere,
      type_label: el.type_label,
      emplacement: el.emplacement,
      phase_type: el.phase_type,
      jdb_category: el.jdb_category ?? undefined,
      power_w: el.power_w,
      quantity: el.quantity,
      distance_m: el.distance_m,
      ku: el.ku,
      ks: el.ks,
      coef_ks: el.coef_ks,
      coef_ku: el.coef_ku,
      use_coefs: el.use_coefs !== 0,
      circuit: el.circuit ?? undefined,
      notes: el.notes ?? undefined,
    });
  }

  return newPanel;
}
