import { getDatabase, ensureElementArticlesSchema } from './db';
import {
  resolveJdbCategory,
  type ElementRowKind,
  type ElementType,
  type JdbCategory,
  type PhaseType,
} from '../../shared/types';

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
  jdb_category: JdbCategory | null;
  power_w: number;
  quantity: number;
  distance_m: number;
  ku: number;
  ks: number;
  coef_ks: number;
  coef_ku: number;
  use_coefs: number;
  circuit: string | null;
  notes: string | null;
  is_multi: boolean;
  order_index: number;
}

export interface ArticleRow {
  id: number;
  element_id: number;
  type_label: string;
  designation: string;
  power_w: number;
  quantity: number;
  coef_ks: number;
  coef_ku: number;
  order_index: number;
}

const ARTICLE_SELECT = `id, element_id, COALESCE(type_label, '') AS type_label, designation, power_w, quantity, coef_ks, coef_ku, order_index`;

function mapArticleRow(raw: ArticleRow): ArticleRow {
  return {
    ...raw,
    type_label: String(raw.type_label ?? '').trim(),
    designation: String(raw.designation ?? '').trim(),
  };
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
  | 'coef_ks'
  | 'coef_ku'
  | 'is_multi'
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
      | 'coef_ks'
      | 'coef_ku'
      | 'is_multi'
    >
  > & { is_multi?: number | boolean };

export function defaultCoefsForType(
  type: ElementType,
  _phaseType: PhaseType = 'mono'
): { coef_ks: number; coef_ku: number } {
  switch (type) {
    case 'eclairage':
      return { coef_ks: 1.0, coef_ku: 1.0 };
    case 'prise':
      return { coef_ks: 0.8, coef_ku: 1.0 };
    case 'divers':
      return { coef_ks: 0.0, coef_ku: 0.0 };
    case 'jeu_de_barres':
      return { coef_ks: 1.0, coef_ku: 1.0 };
  }
  return { coef_ks: 1.0, coef_ku: 1.0 };
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
    jdb_category: isJdb ? resolveJdbCategory(raw.jdb_category) : null,
    ku: raw.ku ?? 1,
    ks: raw.ks ?? 1,
    coef_ks: raw.coef_ks ?? defaults.coef_ks,
    coef_ku: raw.coef_ku ?? defaults.coef_ku,
    is_multi: Boolean(raw.is_multi),
    designation: type_label,
  };
}

const ELEMENT_SELECT = `SELECT id, panel_id, type, repere, designation, type_label, emplacement,
  row_kind, bar_set_index, phase_type, jdb_category,
  power_w, quantity, distance_m, ku, ks, coef_ks, coef_ku,
  circuit, notes, is_multi, order_index`;

export function getElementsByPanel(panelId: number): ElementRow[] {
  const db = getDatabase();
  const rows = db
    .prepare(`${ELEMENT_SELECT} FROM elements WHERE panel_id = ? ORDER BY order_index, id`)
    .all(panelId) as RawElementRow[];
  return rows.map(mapRow);
}

export function getElementById(id: number): ElementRow | undefined {
  const db = getDatabase();
  const row = db
    .prepare(`${ELEMENT_SELECT} FROM elements WHERE id = ?`)
    .get(id) as RawElementRow | undefined;
  return row ? mapRow(row) : undefined;
}

export function countJeuDeBarresInPanel(panelId: number): number {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT COUNT(*) as count FROM elements
       WHERE panel_id = ? AND type = 'jeu_de_barres'`
    )
    .get(panelId) as { count: number };
  return row.count;
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
  jdb_category?: JdbCategory | null;
  power_w: number;
  quantity: number;
  distance_m?: number;
  ku?: number;
  ks?: number;
  coef_ks?: number;
  coef_ku?: number;
  use_coefs?: boolean;
  circuit?: string;
  notes?: string;
  is_multi?: boolean;
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
        ku, ks, fp, coef_ks, coef_ku, coef_fp, use_coefs,
        circuit, notes, is_multi, order_index
      ) VALUES (
        @panel_id, @type, @repere, @designation, @type_label, @emplacement,
        @row_kind, @bar_set_index, @phase_type, @jdb_category,
        @power_w, @quantity, @distance_m,
        @ku, @ks, 1, @coef_ks, @coef_ku, 1, @use_coefs,
        @circuit, @notes, @is_multi, @order_index
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
      jdb_category: isJdb ? resolveJdbCategory(data.jdb_category) : null,
      power_w: data.power_w,
      quantity: data.quantity,
      distance_m: data.distance_m ?? 0,
      ku: data.ku ?? 1,
      ks: data.ks ?? 1,
      coef_ks: data.coef_ks ?? coefDefaults.coef_ks,
      coef_ku: data.coef_ku ?? coefDefaults.coef_ku,
      use_coefs: data.use_coefs !== undefined ? (data.use_coefs ? 1 : 0) : 0,
      circuit: data.circuit ?? null,
      notes: data.notes ?? null,
      is_multi: data.is_multi ? 1 : 0,
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
  jdb_category?: JdbCategory | null;
  power_w?: number;
  quantity?: number;
  distance_m?: number;
  ku?: number;
  ks?: number;
  coef_ks?: number;
  coef_ku?: number;
  use_coefs?: boolean;
  circuit?: string;
  notes?: string;
  is_multi?: boolean;
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
      coef_ks = @coef_ks,
      coef_ku = @coef_ku,
      use_coefs = @use_coefs,
      circuit = @circuit,
      notes = @notes,
      is_multi = @is_multi
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
    coef_ks: data.coef_ks ?? existing.coef_ks,
    coef_ku: data.coef_ku ?? existing.coef_ku,
    use_coefs: data.use_coefs !== undefined ? (data.use_coefs ? 1 : 0) : existing.use_coefs ?? 0,
    circuit: data.circuit !== undefined ? data.circuit : existing.circuit,
    notes: data.notes !== undefined ? data.notes : existing.notes,
    is_multi:
      data.is_multi !== undefined ? (data.is_multi ? 1 : 0) : existing.is_multi ? 1 : 0,
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

export function getArticlesByElement(elementId: number): ArticleRow[] {
  const db = getDatabase();
  ensureElementArticlesSchema(db);
  const rows = db
    .prepare(
      `SELECT ${ARTICLE_SELECT} FROM element_articles WHERE element_id = ? ORDER BY order_index, id`
    )
    .all(elementId) as ArticleRow[];
  return rows.map(mapArticleRow);
}

export function getArticlesByPanel(panelId: number): Record<number, ArticleRow[]> {
  const db = getDatabase();
  ensureElementArticlesSchema(db);
  const rows = db
    .prepare(
      `SELECT a.id, a.element_id, COALESCE(a.type_label, '') AS type_label, a.designation, a.power_w, a.quantity, a.coef_ks, a.coef_ku, a.order_index
       FROM element_articles a
       JOIN elements e ON a.element_id = e.id
       WHERE e.panel_id = ?
       ORDER BY a.element_id, a.order_index, a.id`
    )
    .all(panelId) as ArticleRow[];
  const map: Record<number, ArticleRow[]> = {};
  for (const row of rows) {
    const list = map[row.element_id] ?? [];
    list.push(mapArticleRow(row));
    map[row.element_id] = list;
  }
  return map;
}

export function createArticle(data: {
  element_id: number;
  type_label?: string;
  designation: string;
  power_w: number;
  quantity: number;
  coef_ks?: number;
  coef_ku?: number;
  order_index?: number;
}): ArticleRow {
  const db = getDatabase();
  ensureElementArticlesSchema(db);
  let order_index = data.order_index;
  if (order_index === undefined) {
    const max = db
      .prepare(
        'SELECT COALESCE(MAX(order_index), -1) as max_order FROM element_articles WHERE element_id = ?'
      )
      .get(data.element_id) as { max_order: number };
    order_index = max.max_order + 1;
  }

  const parent = getElementById(data.element_id);
  const coef_ks = data.coef_ks ?? parent?.coef_ks ?? 1;
  const coef_ku = data.coef_ku ?? parent?.coef_ku ?? 1;

  const hasExplicitTypeLabel = Object.prototype.hasOwnProperty.call(data, 'type_label');
  let type_label = hasExplicitTypeLabel
    ? String(data.type_label ?? '').trim()
    : '';
  if (!hasExplicitTypeLabel && !type_label && parent) {
    type_label = (parent.type_label || parent.designation || '').trim();
  }

  const result = db
    .prepare(
      `INSERT INTO element_articles (element_id, type_label, designation, power_w, quantity, coef_ks, coef_ku, order_index)
       VALUES (@element_id, @type_label, @designation, @power_w, @quantity, @coef_ks, @coef_ku, @order_index)`
    )
    .run({
      element_id: data.element_id,
      type_label,
      designation: data.designation.trim(),
      power_w: data.power_w,
      quantity: data.quantity,
      coef_ks,
      coef_ku,
      order_index,
    });

  const row = db
    .prepare(`SELECT ${ARTICLE_SELECT} FROM element_articles WHERE id = ?`)
    .get(Number(result.lastInsertRowid)) as ArticleRow;
  return mapArticleRow(row);
}

export function updateArticle(data: {
  id: number;
  type_label?: string;
  designation?: string;
  power_w?: number;
  quantity?: number;
  coef_ks?: number;
  coef_ku?: number;
  order_index?: number;
}): ArticleRow {
  const db = getDatabase();
  ensureElementArticlesSchema(db);
  const existing = db
    .prepare(`SELECT ${ARTICLE_SELECT} FROM element_articles WHERE id = ?`)
    .get(data.id) as ArticleRow | undefined;
  if (!existing) throw new Error('Article not found');

  db.prepare(
    `UPDATE element_articles SET
      type_label = @type_label,
      designation = @designation,
      power_w = @power_w,
      quantity = @quantity,
      coef_ks = @coef_ks,
      coef_ku = @coef_ku,
      order_index = @order_index
    WHERE id = @id`
  ).run({
    id: data.id,
    type_label:
      data.type_label !== undefined ? data.type_label.trim() : existing.type_label,
    designation:
      data.designation !== undefined ? data.designation.trim() : existing.designation,
    power_w: data.power_w ?? existing.power_w,
    quantity: data.quantity ?? existing.quantity,
    coef_ks: data.coef_ks ?? existing.coef_ks,
    coef_ku: data.coef_ku ?? existing.coef_ku,
    order_index: data.order_index ?? existing.order_index,
  });

  const row = db
    .prepare(`SELECT ${ARTICLE_SELECT} FROM element_articles WHERE id = ?`)
    .get(data.id) as ArticleRow;
  return mapArticleRow(row);
}

export function deleteArticle(id: number): void {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM element_articles WHERE id = ?').run(id);
  if (result.changes === 0) throw new Error('Article not found');
}

export function reorderArticles(elementId: number, orderedIds: number[]): void {
  const db = getDatabase();
  const update = db.prepare(
    'UPDATE element_articles SET order_index = ? WHERE id = ? AND element_id = ?'
  );
  const reorder = db.transaction(() => {
    orderedIds.forEach((id, index) => {
      update.run(index, id, elementId);
    });
  });
  reorder();
}

/** SQL fragment for installed power (handles multi-depart articles). */
export const ELEMENT_INSTALLED_POWER_SQL = `CASE WHEN COALESCE(e.is_multi, 0) = 1 THEN
  COALESCE((
    SELECT SUM(
      a.power_w * a.quantity * COALESCE(a.coef_ks, 1) * COALESCE(a.coef_ku, 1)
    ) FROM element_articles a WHERE a.element_id = e.id
  ), 0)
ELSE
  e.power_w * e.quantity * COALESCE(e.coef_ks, e.ks, 1) * COALESCE(e.coef_ku, e.ku, 1)
END`;
