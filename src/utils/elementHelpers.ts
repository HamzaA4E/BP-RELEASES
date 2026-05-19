import type { Element, ElementType } from '@/types';

export function isBarSetRow(element: Element): boolean {
  return element.row_kind === 'bar_set';
}

export function barSetLabel(type: ElementType, index: number): string {
  return type === 'eclairage'
    ? `Jeu de barre Éclairage ${index}`
    : `Jeu de barre Prise ${index}`;
}

export function nextBarSetIndex(elements: Element[], type: ElementType): number {
  return elements.filter((e) => isBarSetRow(e) && e.type === type).length + 1;
}

/** Libellé « Type » (ex-ancienne désignation produit, ou libellé jeu de barre). */
export function displayTypeLabel(element: Element): string {
  if (element.type_label) return element.type_label;
  if (isBarSetRow(element) && element.bar_set_index > 0) {
    return barSetLabel(element.type, element.bar_set_index);
  }
  return element.designation ?? '';
}

/** Champ « Désignation » = emplacement / repère de pose. */
export function displayEmplacement(element: Element): string {
  return element.emplacement ?? '';
}

export function normalizeElement(raw: Element): Element {
  const type_label =
    raw.type_label ||
    (raw.row_kind === 'bar_set' && raw.bar_set_index > 0
      ? barSetLabel(raw.type, raw.bar_set_index)
      : raw.designation || '');

  return {
    ...raw,
    row_kind: raw.row_kind ?? 'element',
    type_label,
    emplacement: raw.emplacement ?? '',
    bar_set_index: raw.bar_set_index ?? 0,
    ku: raw.ku ?? 1,
    ks: raw.ks ?? 1,
    fp: raw.fp ?? 1,
  };
}
