import type { Element, ElementType, JdbCategory } from '@/types';
import { defaultCoefsForType } from '@/utils/calculations';

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

export function displayTypeLabel(element: Element): string {
  if (isJeuDeBarres(element)) {
    return element.type_label || element.designation || 'Jeu de barres';
  }
  if (element.type === 'prise') {
    return element.phase_type === 'tri' ? 'Triphasé' : 'Monophasé';
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
  if (category === 'eclairage') return 'Éclairage';
  if (category === 'prise') return 'Prise de courant';
  return 'Mixte';
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

export function isTypeAllowedUnderJdb(
  elementType: ElementType,
  jdb: Element | null
): boolean {
  if (!jdb || !jdb.jdb_category) return true;
  if (jdb.jdb_category === 'eclairage') return elementType === 'eclairage';
  if (jdb.jdb_category === 'prise')
    return elementType === 'prise' || elementType === 'attente';
  return true;
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
    jdb_category: raw.jdb_category ?? null,
    ku: raw.ku ?? 1,
    ks: raw.ks ?? 1,
    fp: raw.fp ?? 1,
    coef_ks: raw.coef_ks ?? coefDefaults.coef_ks,
    coef_ku: raw.coef_ku ?? coefDefaults.coef_ku,
    coef_fp: raw.coef_fp ?? coefDefaults.coef_fp,
  };
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
  if (element.type === 'attente') {
    return {
      label: '🔌 Attente',
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400',
    };
  }
  return {
    label: '⚡ Jeu de barres',
    className: 'bg-[#1E3A5F] text-white',
  };
}
