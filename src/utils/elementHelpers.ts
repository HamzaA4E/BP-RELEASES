import type { Article, Element, ElementType, JdbCategory, PhaseType } from '@/types';
import { resolveJdbCategory } from '@/types';
import { calcPuissanceTotale, defaultCoefsForType } from '@/utils/calculations';

export function isJeuDeBarres(element: Element): boolean {
  return element.type === 'jeu_de_barres' || element.row_kind === 'bar_set';
}

/** @deprecated Use isJeuDeBarres */
export function isBarSetRow(element: Element): boolean {
  return isJeuDeBarres(element);
}

export function barSetLabel(category: JdbCategory | ElementType, index: number): string {
  if (category === 'eclairage') return `Jeu de barre Éclairage ${index}`;
  if (category === 'prise') return `Jeu de barre Prise ${index}`;
  return `Jeu de barres ${index}`;
}

export function nextBarSetIndex(elements: Element[]): number {
  return elements.filter((e) => isJeuDeBarres(e)).length + 1;
}

function isPrisePhaseLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return normalized === 'monophasé' || normalized === 'triphasé';
}

export function displayTypeLabel(element: Element): string {
  if (isJeuDeBarres(element)) {
    return element.type_label || element.designation || 'Jeu de barres';
  }
  if (element.type === 'prise') {
    const fromLabel = (element.type_label ?? '').trim();
    if (fromLabel && !isPrisePhaseLabel(fromLabel)) return fromLabel;
    const fromDesignation = (element.designation ?? '').trim();
    if (fromDesignation && !isPrisePhaseLabel(fromDesignation)) return fromDesignation;
    return '';
  }
  if (element.type_label) return element.type_label;
  return element.designation ?? '';
}

export function jeuDeBarresTitle(element: Element): string {
  return (
    element.type_label?.trim() ||
    element.designation?.trim() ||
    'Jeu de barres'
  );
}

export function jdbCategoryLabel(category: JdbCategory | null | undefined): string {
  const resolved = resolveJdbCategory(category);
  return resolved === 'eclairage' ? 'Éclairage' : 'Prise de courant';
}

/** Catégorie d'un départ : éclairage, mono, tri ou divers (plusieurs catégories possibles sur un même repère). */
export type DepartCategory = 'eclairage' | 'prise-mono' | 'prise-tri' | 'divers';

export function departCategoryOf(element: {
  type: ElementType;
  phase_type?: PhaseType;
}): DepartCategory {
  if (element.type === 'divers') return 'divers';
  if (element.type === 'eclairage') return 'eclairage';
  if (element.type === 'prise') {
    return element.phase_type === 'tri' ? 'prise-tri' : 'prise-mono';
  }
  return 'eclairage';
}

export function departCategoryLabel(category: DepartCategory): string {
  switch (category) {
    case 'eclairage':
      return 'Éclairage';
    case 'prise-mono':
      return 'Monophasé';
    case 'prise-tri':
      return 'Triphasé';
    case 'divers':
      return 'Divers';
  }
}

export function findElementByRepere(
  elements: Element[],
  repere: string,
  excludeId?: number
): Element | undefined {
  const key = repere.trim().toUpperCase();
  if (!key) return undefined;
  return elements.find(
    (e) =>
      !isJeuDeBarres(e) &&
      e.id !== excludeId &&
      e.repere.trim().toUpperCase() === key
  );
}

export function findElementByRepereAndCategory(
  elements: Element[],
  repere: string,
  category: DepartCategory,
  excludeId?: number,
  contextJdb?: Element | null
): Element | undefined {
  const key = repere.trim().toUpperCase();
  if (!key) return undefined;
  const scoped = contextJdb
    ? getElementsInJdbSection(elements, contextJdb.id)
    : elements;
  return scoped.find(
    (e) =>
      !isJeuDeBarres(e) &&
      e.id !== excludeId &&
      e.repere.trim().toUpperCase() === key &&
      departCategoryOf(e) === category
  );
}

/** Index d'insertion après le dernier élément partageant le même repère. */
export function getInsertIndexAfterRepereGroup(
  elements: Element[],
  repere: string,
  fromElementId: number
): number {
  const key = repere.trim().toUpperCase();
  let lastIndex = elements.findIndex((e) => e.id === fromElementId);
  if (lastIndex < 0) return elements.length;

  for (let i = lastIndex + 1; i < elements.length; i++) {
    const el = elements[i]!;
    if (isJeuDeBarres(el)) break;
    if (el.repere.trim().toUpperCase() !== key) break;
    lastIndex = i;
  }
  return lastIndex + 1;
}

export function displayEmplacement(element: Element): string {
  return element.emplacement ?? '';
}

export function getActiveJeuDeBarres(
  elements: Element[],
  insertIndex: number
): Element | null {
  for (let i = insertIndex - 1; i >= 0; i--) {
    const el = elements[i];
    if (el !== undefined && isJeuDeBarres(el)) return el;
  }
  return null;
}

/** Jeu de barres contenant un élément donné (selon l'ordre du tableau). */
export function getJeuDeBarresForElement(
  elements: Element[],
  elementId: number
): Element | null {
  const index = elements.findIndex((e) => e.id === elementId);
  if (index < 0) return null;
  return getActiveJeuDeBarres(elements, index + 1);
}

/** Returns all non-JDB elements that belong to a specific JDB section.
 *  A JDB section starts at the given jdbId and ends just before the next JDB element.
 */
export function getElementsInJdbSection(
  elements: Element[],
  jdbId: number
): Element[] {
  const jdbIndex = elements.findIndex((e) => e.id === jdbId);
  if (jdbIndex < 0) return [];

  const result: Element[] = [];
  for (let i = jdbIndex + 1; i < elements.length; i++) {
    const el = elements[i]!;
    if (isJeuDeBarres(el)) break;
    result.push(el);
  }
  return result;
}

/** Index where a new element should be inserted at the end of a jeu de barres section. */
export function getInsertIndexAfterJdbSection(
  elements: Element[],
  jdbId: number
): number {
  const jdbIndex = elements.findIndex((e) => e.id === jdbId);
  if (jdbIndex < 0) return elements.length;

  let insertAt = jdbIndex + 1;
  while (insertAt < elements.length && !isJeuDeBarres(elements[insertAt]!)) {
    insertAt++;
  }
  return insertAt;
}

export function defaultElementTypeForJdb(
  jdb: Element
): Exclude<ElementType, 'jeu_de_barres'> {
  return resolveJdbCategory(jdb.jdb_category) === 'prise' ? 'prise' : 'eclairage';
}

export function isTypeAllowedUnderJdb(
  elementType: ElementType,
  jdb: Element | null
): boolean {
  if (!jdb) return true;
  const category = resolveJdbCategory(jdb.jdb_category);
  if (category === 'eclairage') return elementType === 'eclairage' || elementType === 'divers';
  return elementType === 'prise' || elementType === 'divers';
}

export function normalizeElement(raw: Element): Element {
  const isJdb = raw.type === 'jeu_de_barres' || raw.row_kind === 'bar_set';
  const type_label =
    raw.type_label ||
    (isJdb && raw.bar_set_index > 0
      ? barSetLabel(raw.jdb_category ?? raw.type, raw.bar_set_index)
      : raw.designation || '');

  const elementType = isJdb && raw.type !== 'jeu_de_barres' ? 'jeu_de_barres' : raw.type;
  const phase_type = raw.phase_type ?? 'mono';
  const coefDefaults = defaultCoefsForType(elementType, phase_type);

  return {
    ...raw,
    type: elementType,
    row_kind: isJdb ? 'bar_set' : (raw.row_kind ?? 'element'),
    type_label,
    emplacement: raw.emplacement ?? '',
    bar_set_index: raw.bar_set_index ?? 0,
    phase_type,
    jdb_category: isJdb ? resolveJdbCategory(raw.jdb_category) : null,
    ku: raw.ku ?? 1,
    ks: raw.ks ?? 1,
    coef_ks: raw.coef_ks ?? coefDefaults.coef_ks,
    coef_ku: raw.coef_ku ?? coefDefaults.coef_ku,
    is_multi: Boolean(raw.is_multi),
  };
}

export type ElementTableRow =
  | { kind: 'jdb'; element: Element }
  | { kind: 'element'; element: Element }
  | { kind: 'subtotal'; label: string; totalPower: number };

/** Construit les lignes du tableau avec sous-totaux par jeu de barres. */
export function buildElementTableRows(
  elements: Element[],
  articlesByElement: Record<number, Article[]> = {}
): ElementTableRow[] {
  const rows: ElementTableRow[] = [];
  let currentJdb: Element | null = null;
  let groupElements: Element[] = [];

  const flushSubtotal = (): void => {
    if (!currentJdb || groupElements.length === 0) return;
    const totalPower = groupElements.reduce(
      (sum, el) =>
        sum +
        calcPuissanceTotale(
          el,
          el.is_multi ? articlesByElement[el.id] : undefined
        ),
      0
    );
    rows.push({
      kind: 'subtotal',
      label: `Sous-total ${jeuDeBarresTitle(currentJdb)}`,
      totalPower,
    });
    groupElements = [];
  };

  for (const el of elements) {
    if (isJeuDeBarres(el)) {
      flushSubtotal();
      currentJdb = el;
      rows.push({ kind: 'jdb', element: el });
    } else {
      if (currentJdb) groupElements.push(el);
      rows.push({ kind: 'element', element: el });
    }
  }
  flushSubtotal();
  return rows;
}

export function typeBadge(element: Element): {
  label: string;
  className: string;
} {
  if (element.type === 'eclairage') {
    return {
      label: '💡 Éclairage',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    };
  }
  if (element.type === 'prise' && element.phase_type === 'tri') {
    return {
      label: '🔌 Triphasé',
      className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
    };
  }
  if (element.type === 'prise') {
    return {
      label: '🔌 Mono',
      className: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300',
    };
  }
  if (element.type === 'divers') {
    return {
      label: '📦 Divers',
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400',
    };
  }
  return {
    label: '⚡ Jeu de barres',
    className: 'bg-[#1E3A5F] text-white',
  };
}
