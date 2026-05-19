import { getDatabase } from './db';
import { createElement } from './elements';

export interface LocationRow {
  id: number;
  project_id: number;
  name: string;
  order_index: number;
}

export interface LocationWithStatsRow extends LocationRow {
  total_power_w: number;
  panel_count: number;
}

export function getLocationsByProject(projectId: number): LocationWithStatsRow[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT l.*,
        (SELECT COUNT(*) FROM panels p WHERE p.location_id = l.id) as panel_count,
        COALESCE((
          SELECT SUM(e.power_w * e.quantity)
          FROM elements e
          JOIN panels pa ON e.panel_id = pa.id
          WHERE pa.location_id = l.id AND e.type != 'jeu_de_barres'
        ), 0) as total_power_w
      FROM locations l
      WHERE l.project_id = ?
      ORDER BY l.order_index, l.id`
    )
    .all(projectId) as LocationWithStatsRow[];
}

export function getLocationById(id: number): LocationRow | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM locations WHERE id = ?').get(id) as
    | LocationRow
    | undefined;
}

export function createLocation(data: {
  project_id: number;
  name: string;
}): LocationRow {
  const db = getDatabase();
  const maxOrder = db
    .prepare(
      'SELECT COALESCE(MAX(order_index), -1) as max_order FROM locations WHERE project_id = ?'
    )
    .get(data.project_id) as { max_order: number };

  const result = db
    .prepare(
      'INSERT INTO locations (project_id, name, order_index) VALUES (@project_id, @name, @order_index)'
    )
    .run({
      project_id: data.project_id,
      name: data.name,
      order_index: maxOrder.max_order + 1,
    });

  const location = getLocationById(Number(result.lastInsertRowid));
  if (!location) throw new Error('Failed to create location');
  return location;
}

export function updateLocation(data: { id: number; name?: string }): LocationRow {
  const db = getDatabase();
  const existing = getLocationById(data.id);
  if (!existing) throw new Error('Location not found');

  if (data.name !== undefined) {
    db.prepare('UPDATE locations SET name = ? WHERE id = ?').run(data.name, data.id);
  }

  const location = getLocationById(data.id);
  if (!location) throw new Error('Failed to update location');
  return location;
}

export function deleteLocation(id: number): void {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM locations WHERE id = ?').run(id);
  if (result.changes === 0) throw new Error('Location not found');
}

export function reorderLocations(
  projectId: number,
  orderedIds: number[]
): void {
  const db = getDatabase();
  const update = db.prepare(
    'UPDATE locations SET order_index = ? WHERE id = ? AND project_id = ?'
  );
  const reorder = db.transaction(() => {
    orderedIds.forEach((id, index) => {
      update.run(index, id, projectId);
    });
  });
  reorder();
}

export function duplicateLocation(id: number): LocationRow {
  const db = getDatabase();
  const source = getLocationById(id);
  if (!source) throw new Error('Location not found');

  const newLocation = createLocation({
    project_id: source.project_id,
    name: `${source.name} (copie)`,
  });

  const panels = db
    .prepare('SELECT * FROM panels WHERE location_id = ? ORDER BY order_index')
    .all(id) as Array<{
    id: number;
    name: string;
    description: string | null;
    general_breaker_ampere: number;
    order_index: number;
  }>;

  for (const panel of panels) {
    const panelResult = db
      .prepare(
        `INSERT INTO panels (location_id, name, description, general_breaker_ampere, order_index)
         VALUES (@location_id, @name, @description, @general_breaker_ampere, @order_index)`
      )
      .run({
        location_id: newLocation.id,
        name: panel.name,
        description: panel.description,
        general_breaker_ampere: panel.general_breaker_ampere,
        order_index: panel.order_index,
      });

    const newPanelId = Number(panelResult.lastInsertRowid);
    const elements = db
      .prepare('SELECT * FROM elements WHERE panel_id = ? ORDER BY order_index')
      .all(panel.id) as Array<{
      type: string;
      repere: string;
      designation: string;
      type_label?: string;
      emplacement?: string;
      row_kind?: string;
      bar_set_index?: number;
      phase_type?: string;
      jdb_category?: string | null;
      power_w: number;
      quantity: number;
      distance_m: number;
      ku?: number;
      ks?: number;
      fp?: number;
      circuit: string | null;
      notes: string | null;
    }>;

    for (const el of elements) {
      const type_label = el.type_label || el.designation;
      const elementType =
        el.type === 'jeu_de_barres' || el.row_kind === 'bar_set'
          ? 'jeu_de_barres'
          : (el.type as 'eclairage' | 'prise' | 'attente');
      createElement({
        panel_id: newPanelId,
        type: elementType,
        repere: el.repere,
        type_label,
        emplacement: el.emplacement ?? '',
        phase_type: (el.phase_type as 'mono' | 'tri') ?? 'mono',
        jdb_category: (el.jdb_category as 'eclairage' | 'prise' | null) ?? null,
        power_w: el.power_w,
        quantity: el.quantity,
        distance_m: el.distance_m,
        ku: el.ku,
        ks: el.ks,
        fp: el.fp,
        circuit: el.circuit ?? undefined,
        notes: el.notes ?? undefined,
      });
    }
  }

  return newLocation;
}
