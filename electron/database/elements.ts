import { getDatabase } from './db';
import type { ElementRowKind } from '../../shared/types';

export interface ElementRow {
  id: number;
  panel_id: number;
  type: 'eclairage' | 'prise';
  repere: string;
  designation: string;
  type_label: string;
  emplacement: string;
  row_kind: ElementRowKind;
  bar_set_index: number;
  power_w: number;
  quantity: number;
  distance_m: number;
  ku: number;
  ks: number;
  fp: number;
  circuit: string | null;
  notes: string | null;
  order_index: number;
}

type RawElementRow = Omit<
  ElementRow,
  'type_label' | 'emplacement' | 'row_kind' | 'bar_set_index' | 'ku' | 'ks' | 'fp'
> &
  Partial<
    Pick<ElementRow, 'type_label' | 'emplacement' | 'row_kind' | 'bar_set_index' | 'ku' | 'ks' | 'fp'>
  >;

function mapRow(raw: RawElementRow): ElementRow {
  const row_kind = (raw.row_kind ?? 'element') as ElementRowKind;
  const bar_set_index = raw.bar_set_index ?? 0;
  const type_label =
    raw.type_label ||
    (row_kind === 'bar_set' && bar_set_index > 0
      ? raw.type === 'eclairage'
        ? `Jeu de barre Éclairage ${bar_set_index}`
        : `Jeu de barre Prise ${bar_set_index}`
      : raw.designation || '');

  return {
    ...raw,
    type_label,
    emplacement: raw.emplacement ?? '',
    row_kind,
    bar_set_index,
    ku: raw.ku ?? 1,
    ks: raw.ks ?? 1,
    fp: raw.fp ?? 1,
    designation: type_label,
  };
}

export function getElementsByPanel(panelId: number): ElementRow[] {
  const db = getDatabase();
  const rows = db
    .prepare(
      'SELECT * FROM elements WHERE panel_id = ? ORDER BY order_index, id'
    )
    .all(panelId) as RawElementRow[];
  return rows.map(mapRow);
}

export function getElementById(id: number): ElementRow | undefined {
  const db = getDatabase();
  const row = db.prepare('SELECT * FROM elements WHERE id = ?').get(id) as
    | RawElementRow
    | undefined;
  return row ? mapRow(row) : undefined;
}

export function createElement(data: {
  panel_id: number;
  type: 'eclairage' | 'prise';
  repere: string;
  type_label: string;
  emplacement?: string;
  row_kind?: ElementRowKind;
  bar_set_index?: number;
  power_w: number;
  quantity: number;
  distance_m?: number;
  ku?: number;
  ks?: number;
  fp?: number;
  circuit?: string;
  notes?: string;
}): ElementRow {
  const db = getDatabase();
  const maxOrder = db
    .prepare(
      'SELECT COALESCE(MAX(order_index), -1) as max_order FROM elements WHERE panel_id = ?'
    )
    .get(data.panel_id) as { max_order: number };

  const row_kind = data.row_kind ?? 'element';
  const type_label = data.type_label.trim();
  const emplacement = data.emplacement?.trim() ?? '';

  const result = db
    .prepare(
      `INSERT INTO elements (
        panel_id, type, repere, designation, type_label, emplacement,
        row_kind, bar_set_index, power_w, quantity, distance_m,
        ku, ks, fp, circuit, notes, order_index
      ) VALUES (
        @panel_id, @type, @repere, @designation, @type_label, @emplacement,
        @row_kind, @bar_set_index, @power_w, @quantity, @distance_m,
        @ku, @ks, @fp, @circuit, @notes, @order_index
      )`
    )
    .run({
      panel_id: data.panel_id,
      type: data.type,
      repere: data.repere,
      designation: type_label,
      type_label,
      emplacement,
      row_kind,
      bar_set_index: data.bar_set_index ?? 0,
      power_w: data.power_w,
      quantity: data.quantity,
      distance_m: data.distance_m ?? 0,
      ku: data.ku ?? 1,
      ks: data.ks ?? 1,
      fp: data.fp ?? 1,
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
  type_label?: string;
  emplacement?: string;
  power_w?: number;
  quantity?: number;
  distance_m?: number;
  ku?: number;
  ks?: number;
  fp?: number;
  circuit?: string;
  notes?: string;
}): ElementRow {
  const db = getDatabase();
  const existing = getElementById(data.id);
  if (!existing) throw new Error('Element not found');

  const type_label =
    data.type_label !== undefined ? data.type_label.trim() : existing.type_label;
  const emplacement =
    data.emplacement !== undefined ? data.emplacement.trim() : existing.emplacement;

  db.prepare(
    `UPDATE elements SET
      type = @type,
      repere = @repere,
      designation = @designation,
      type_label = @type_label,
      emplacement = @emplacement,
      power_w = @power_w,
      quantity = @quantity,
      distance_m = @distance_m,
      ku = @ku,
      ks = @ks,
      fp = @fp,
      circuit = @circuit,
      notes = @notes
    WHERE id = @id`
  ).run({
    id: data.id,
    type: data.type ?? existing.type,
    repere: data.repere ?? existing.repere,
    designation: type_label,
    type_label,
    emplacement,
    power_w: data.power_w ?? existing.power_w,
    quantity: data.quantity ?? existing.quantity,
    distance_m: data.distance_m ?? existing.distance_m,
    ku: data.ku ?? existing.ku,
    ks: data.ks ?? existing.ks,
    fp: data.fp ?? existing.fp,
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
