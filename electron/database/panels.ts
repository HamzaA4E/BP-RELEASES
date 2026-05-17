import { getDatabase } from './db';

export interface PanelRow {
  id: number;
  location_id: number;
  name: string;
  description: string | null;
  general_breaker_ampere: number;
  order_index: number;
}

export interface PanelWithStatsRow extends PanelRow {
  element_count: number;
  installed_power_w: number;
  absorbed_power_w: number;
}

export function getPanelsByLocation(locationId: number): PanelWithStatsRow[] {
  const db = getDatabase();
  const panels = db
    .prepare(
      `SELECT p.*,
        (SELECT COUNT(*) FROM elements e WHERE e.panel_id = p.id) as element_count,
        COALESCE((
          SELECT SUM(e.power_w * e.quantity) FROM elements e WHERE e.panel_id = p.id
        ), 0) as installed_power_w
      FROM panels p
      WHERE p.location_id = ?
      ORDER BY p.order_index, p.id`
    )
    .all(locationId) as Array<PanelRow & { element_count: number; installed_power_w: number }>;

  return panels.map((p) => ({
    ...p,
    absorbed_power_w: p.installed_power_w * 0.8,
  }));
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
}): PanelRow {
  const db = getDatabase();
  const maxOrder = db
    .prepare(
      'SELECT COALESCE(MAX(order_index), -1) as max_order FROM panels WHERE location_id = ?'
    )
    .get(data.location_id) as { max_order: number };

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
}): PanelRow {
  const db = getDatabase();
  const existing = getPanelById(data.id);
  if (!existing) throw new Error('Panel not found');

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
  const db = getDatabase();
  const source = getPanelById(id);
  if (!source) throw new Error('Panel not found');

  const newPanel = createPanel({
    location_id: source.location_id,
    name: `${source.name} (copie)`,
    description: source.description ?? undefined,
    general_breaker_ampere: source.general_breaker_ampere,
  });

  const elements = db
    .prepare('SELECT * FROM elements WHERE panel_id = ? ORDER BY order_index')
    .all(id) as Array<{
    type: string;
    repere: string;
    designation: string;
    power_w: number;
    quantity: number;
    distance_m: number;
    circuit: string | null;
    notes: string | null;
    order_index: number;
  }>;

  const insertElement = db.prepare(
    `INSERT INTO elements (panel_id, type, repere, designation, power_w, quantity, distance_m, circuit, notes, order_index)
     VALUES (@panel_id, @type, @repere, @designation, @power_w, @quantity, @distance_m, @circuit, @notes, @order_index)`
  );

  for (const el of elements) {
    insertElement.run({ ...el, panel_id: newPanel.id });
  }

  return newPanel;
}
