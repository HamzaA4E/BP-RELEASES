import { getDatabase } from './db';

export interface ElementRow {
  id: number;
  panel_id: number;
  type: 'eclairage' | 'prise';
  repere: string;
  designation: string;
  power_w: number;
  quantity: number;
  distance_m: number;
  circuit: string | null;
  notes: string | null;
  order_index: number;
}

export function getElementsByPanel(panelId: number): ElementRow[] {
  const db = getDatabase();
  return db
    .prepare(
      'SELECT * FROM elements WHERE panel_id = ? ORDER BY order_index, id'
    )
    .all(panelId) as ElementRow[];
}

export function getElementById(id: number): ElementRow | undefined {
  const db = getDatabase();
  return db.prepare('SELECT * FROM elements WHERE id = ?').get(id) as
    | ElementRow
    | undefined;
}

export function createElement(data: {
  panel_id: number;
  type: 'eclairage' | 'prise';
  repere: string;
  designation: string;
  power_w: number;
  quantity: number;
  distance_m: number;
  circuit?: string;
  notes?: string;
}): ElementRow {
  const db = getDatabase();
  const maxOrder = db
    .prepare(
      'SELECT COALESCE(MAX(order_index), -1) as max_order FROM elements WHERE panel_id = ?'
    )
    .get(data.panel_id) as { max_order: number };

  const result = db
    .prepare(
      `INSERT INTO elements (panel_id, type, repere, designation, power_w, quantity, distance_m, circuit, notes, order_index)
       VALUES (@panel_id, @type, @repere, @designation, @power_w, @quantity, @distance_m, @circuit, @notes, @order_index)`
    )
    .run({
      panel_id: data.panel_id,
      type: data.type,
      repere: data.repere,
      designation: data.designation,
      power_w: data.power_w,
      quantity: data.quantity,
      distance_m: data.distance_m,
      circuit: data.circuit ?? null,
      notes: data.notes ?? null,
      order_index: maxOrder.max_order + 1,
    });

  const element = getElementById(Number(result.lastInsertRowid));
  if (!element) throw new Error('Failed to create element');
  return element;
}

export function updateElement(data: {
  id: number;
  type?: 'eclairage' | 'prise';
  repere?: string;
  designation?: string;
  power_w?: number;
  quantity?: number;
  distance_m?: number;
  circuit?: string;
  notes?: string;
}): ElementRow {
  const db = getDatabase();
  const existing = getElementById(data.id);
  if (!existing) throw new Error('Element not found');

  db.prepare(
    `UPDATE elements SET
      type = @type,
      repere = @repere,
      designation = @designation,
      power_w = @power_w,
      quantity = @quantity,
      distance_m = @distance_m,
      circuit = @circuit,
      notes = @notes
    WHERE id = @id`
  ).run({
    id: data.id,
    type: data.type ?? existing.type,
    repere: data.repere ?? existing.repere,
    designation: data.designation ?? existing.designation,
    power_w: data.power_w ?? existing.power_w,
    quantity: data.quantity ?? existing.quantity,
    distance_m: data.distance_m ?? existing.distance_m,
    circuit: data.circuit !== undefined ? data.circuit : existing.circuit,
    notes: data.notes !== undefined ? data.notes : existing.notes,
  });

  const element = getElementById(data.id);
  if (!element) throw new Error('Failed to update element');
  return element;
}

export function deleteElement(id: number): void {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM elements WHERE id = ?').run(id);
  if (result.changes === 0) throw new Error('Element not found');
}

export function reorderElements(panelId: number, orderedIds: number[]): void {
  const db = getDatabase();
  const update = db.prepare(
    'UPDATE elements SET order_index = ? WHERE id = ? AND panel_id = ?'
  );
  const reorder = db.transaction(() => {
    orderedIds.forEach((id, index) => {
      update.run(index, id, panelId);
    });
  });
  reorder();
}
