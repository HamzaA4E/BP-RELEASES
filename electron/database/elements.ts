import { getDatabase } from './db';
import type { ElementRowKind, ElementType, JdbCategory, PhaseType } from '../../shared/types';

export interface ElementRow {
  id: number;
  panel_id: number;
  type: ElementType;
  repere: string;
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

type RawElementRow = Omit<
  ElementRow,
  | 'type_label'
  | 'emplacement'
  | 'row_kind'
  | 'bar_set_index'
  | 'phase_type'
  | 'jdb_category'
  | 'ku'
  | 'ks'
  | 'fp'
  | 'coef_ks'
  | 'coef_ku'
  | 'coef_fp'
> &
  Partial<
    Pick<
      ElementRow,
      | 'type_label'
      | 'emplacement'
      | 'row_kind'
      | 'bar_set_index'
      | 'phase_type'
      | 'jdb_category'
      | 'ku'
      | 'ks'
      | 'fp'
      | 'coef_ks'
      | 'coef_ku'
      | 'coef_fp'
    >
  >;

export function defaultCoefsForType(
  type: ElementType,
  phaseType: PhaseType = 'mono'
): { coef_ks: number; coef_ku: number; coef_fp: number } {
  switch (type) {
    case 'eclairage':
      return { coef_ks: 1.0, coef_ku: 1.0, coef_fp: 1.0 };
    case 'prise':
      return {
        coef_ks: 0.8,
        coef_ku: 1.0,
        coef_fp: phaseType === 'tri' ? 0.8 : 1.0,
      };
    case 'attente':
      return { coef_ks: 0.0, coef_ku: 0.0, coef_fp: 1.0 };
    case 'jeu_de_barres':
      return { coef_ks: 1.0, coef_ku: 1.0, coef_fp: 1.0 };
  }
}

function mapRow(raw: RawElementRow): ElementRow {
  const row_kind = (raw.row_kind ?? 'element') as ElementRowKind;
  const bar_set_index = raw.bar_set_index ?? 0;
  const isJdb = raw.type === 'jeu_de_barres' || row_kind === 'bar_set';
  const phase_type = (raw.phase_type ?? 'mono') as PhaseType;
  const elementType = isJdb && raw.type !== 'jeu_de_barres' ? 'jeu_de_barres' : raw.type;
  const type_label =
    raw.type_label ||
    (isJdb && bar_set_index > 0
      ? raw.jdb_category === 'eclairage'
        ? `Jeu de barre Éclairage ${bar_set_index}`
        : `Jeu de barre Prise ${bar_set_index}`
      : raw.designation || '');
  const defaults = defaultCoefsForType(elementType, phase_type);

  return {
    ...raw,
    type: elementType,
    type_label,
    emplacement: raw.emplacement ?? '',
    row_kind: isJdb ? 'bar_set' : row_kind,
    bar_set_index,
    phase_type,
    jdb_category: raw.jdb_category ?? null,
    ku: raw.ku ?? 1,
    ks: raw.ks ?? 1,
    fp: raw.fp ?? 1,
    coef_ks: raw.coef_ks ?? defaults.coef_ks,
    coef_ku: raw.coef_ku ?? defaults.coef_ku,
    coef_fp: raw.coef_fp ?? defaults.coef_fp,
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
}): ElementRow {
  const db = getDatabase();
  const maxOrder = db
    .prepare(
      'SELECT COALESCE(MAX(order_index), -1) as max_order FROM elements WHERE panel_id = ?'
    )
    .get(data.panel_id) as { max_order: number };

  const isJdb = data.type === 'jeu_de_barres';
  const row_kind = isJdb ? 'bar_set' : (data.row_kind ?? 'element');
  const type_label = data.type_label.trim();
  const emplacement = data.emplacement?.trim() ?? '';
  const phase_type = data.phase_type ?? 'mono';
  const coefDefaults = defaultCoefsForType(data.type, phase_type);

  const result = db
    .prepare(
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
      phase_type,
      jdb_category: data.jdb_category ?? null,
      power_w: data.power_w,
      quantity: data.quantity,
      distance_m: data.distance_m ?? 0,
      ku: data.ku ?? 1,
      ks: data.ks ?? 1,
      fp: data.fp ?? 1,
      coef_ks: data.coef_ks ?? coefDefaults.coef_ks,
      coef_ku: data.coef_ku ?? coefDefaults.coef_ku,
      coef_fp: data.coef_fp ?? coefDefaults.coef_fp,
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
}): ElementRow {
  const db = getDatabase();
  const existing = getElementById(data.id);
  if (!existing) throw new Error('Element not found');

  const type_label =
    data.type_label !== undefined ? data.type_label.trim() : existing.type_label;
  const emplacement =
    data.emplacement !== undefined ? data.emplacement.trim() : existing.emplacement;
  const elementType = data.type ?? existing.type;
  const row_kind = elementType === 'jeu_de_barres' ? 'bar_set' : 'element';

  db.prepare(
    `UPDATE elements SET
      type = @type,
      repere = @repere,
      designation = @designation,
      type_label = @type_label,
      emplacement = @emplacement,
      row_kind = @row_kind,
      phase_type = @phase_type,
      jdb_category = @jdb_category,
      power_w = @power_w,
      quantity = @quantity,
      distance_m = @distance_m,
      ku = @ku,
      ks = @ks,
      fp = @fp,
      coef_ks = @coef_ks,
      coef_ku = @coef_ku,
      coef_fp = @coef_fp,
      circuit = @circuit,
      notes = @notes
    WHERE id = @id`
  ).run({
    id: data.id,
    type: elementType,
    repere: data.repere ?? existing.repere,
    designation: type_label,
    type_label,
    emplacement,
    row_kind,
    phase_type: data.phase_type ?? existing.phase_type,
    jdb_category:
      data.jdb_category !== undefined ? data.jdb_category : existing.jdb_category,
    power_w: data.power_w ?? existing.power_w,
    quantity: data.quantity ?? existing.quantity,
    distance_m: data.distance_m ?? existing.distance_m,
    ku: data.ku ?? existing.ku,
    ks: data.ks ?? existing.ks,
    fp: data.fp ?? existing.fp,
    coef_ks: data.coef_ks ?? existing.coef_ks,
    coef_ku: data.coef_ku ?? existing.coef_ku,
    coef_fp: data.coef_fp ?? existing.coef_fp,
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
