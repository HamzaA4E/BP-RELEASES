import type { Article, Element, ElementType, JdbCategory, PhaseType } from '@/types';
import { resolveJdbCategory } from '@/types';
import { calcPuissanceTotale, defaultCoefsForType } from '@/utils/calculations';

// Constants
const PRISE_PHASE_LABELS = ['monophasé', 'triphasé'] as const;
const DEFAULT_EMPLACEMENT = '';
const DEFAULT_BAR_SET_INDEX = 0;
const DEFAULT_PHASE_TYPE: PhaseType = 'mono';
const DEFAULT_KU = 1;
const DEFAULT_KS = 1;

/**
 * Determines if an element is a Jeu de Barres (busbar).
 * @param element - The element to check
 * @returns true if the element is a Jeu de Barres
 */
export function isJeuDeBarres(element: Element): boolean {
  return element.type === 'jeu_de_barres' || element.row_kind === 'bar_set';
}

/** @deprecated Use isJeuDeBarres instead */
export function isBarSetRow(element: Element): boolean {
  return isJeuDeBarres(element);
}

/**
 * Generates a label for a bar set based on its category and index.
 * @param category - The category of the bar set (eclairage, prise, etc.)
 * @param index - The index number of the bar set
 * @returns A formatted label string
 */
export function barSetLabel(category: JdbCategory | ElementType, index: number): string {
  const categoryLabels: Record<string, string> = {
    eclairage: 'Jeu de barre Éclairage',
    prise: 'Jeu de barre Prise',
  };
  const baseLabel = categoryLabels[category] ?? 'Jeu de barres';
  return `${baseLabel} ${index}`;
}

/**
 * Calculates the next available index for a new bar set.
 * @param elements - Array of elements to search through
 * @returns The next index number (1-based)
 */
export function nextBarSetIndex(elements: Element[]): number {
  const jdbCount = elements.filter((e) => isJeuDeBarres(e)).length;
  return jdbCount + 1;
}

/**
 * Checks if a label is a standard prise phase label (monophasé or triphasé).
 * @param label - The label to check
 * @returns true if the label is a phase label
 */
function isPrisePhaseLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase();
  return PRISE_PHASE_LABELS.includes(normalized as any);
}

/**
 * Returns the display label for an element, preferring type_label over designation.
 * For prise elements, excludes standard phase labels (monophasé/triphasé).
 * @param element - The element to get the label from
 * @returns The display label string
 */
export function displayTypeLabel(element: Element): string {
  if (isJeuDeBarres(element)) {
    return element.type_label || element.designation || 'Jeu de barres';
  }
  
  if (element.type === 'prise') {
    return getNonPhaseLabel(element.type_label, element.designation);
  }
  
  return element.type_label || element.designation || '';
}

/** Helper to extract non-phase labels for prise elements */
function getNonPhaseLabel(typeLabel: string | undefined, designation: string | undefined): string {
  const trimmedLabel = typeLabel?.trim() || '';
  if (trimmedLabel && !isPrisePhaseLabel(trimmedLabel)) {
    return trimmedLabel;
  }
  
  const trimmedDesignation = designation?.trim() || '';
  if (trimmedDesignation && !isPrisePhaseLabel(trimmedDesignation)) {
    return trimmedDesignation;
  }
  
  return '';
}

/**
 * Returns the title for a Jeu de Barres element.
 * @param element - The JDB element
 * @returns The title string
 */
export function jeuDeBarresTitle(element: Element): string {
  return element.type_label?.trim() || element.designation?.trim() || 'Jeu de barres';
}

/**
 * Returns the human-readable label for a JDB category.
 * @param category - The JDB category
 * @returns The localized category label
 */
export function jdbCategoryLabel(category: JdbCategory | null | undefined): string {
  const resolved = resolveJdbCategory(category);
  const categoryLabels: Record<string, string> = {
    eclairage: 'Éclairage',
    prise: 'Prise de courant',
  };
  return categoryLabels[resolved] || 'Prise de courant';
}

/** Catégorie d'un départ : éclairage, mono, tri ou divers (plusieurs catégories possibles sur un même repère). */
export type DepartCategory = 'eclairage' | 'prise-mono' | 'prise-tri' | 'divers';

/**
 * Determines the departure category of an element.
 * @param element - Element with type and optional phase_type
 * @returns The departure category
 */
export function departCategoryOf(element: {
  type: ElementType;
  phase_type?: PhaseType;
}): DepartCategory {
  const categoryMap: Partial<Record<ElementType, DepartCategory>> = {
    divers: 'divers',
    eclairage: 'eclairage',
  };
  
  if (categoryMap[element.type]) {
    return categoryMap[element.type]!;
  }
  
  if (element.type === 'prise') {
    return element.phase_type === 'tri' ? 'prise-tri' : 'prise-mono';
  }
  
  return 'eclairage';
}

/**
 * Returns the human-readable label for a departure category.
 * @param category - The departure category
 * @returns The localized category label
 */
export function departCategoryLabel(category: DepartCategory): string {
  const labels: Record<DepartCategory, string> = {
    eclairage: 'Éclairage',
    'prise-mono': 'Monophasé',
    'prise-tri': 'Triphasé',
    divers: 'Divers',
  };
  return labels[category];
}

/**
 * Finds an element by its repère (case-insensitive).
 * @param elements - Array of elements to search
 * @param repere - The repère to search for
 * @param excludeId - Optional element ID to exclude from search
 * @returns The matching element or undefined
 */
export function findElementByRepere(
  elements: Element[],
  repere: string,
  excludeId?: number
): Element | undefined {
  const normalizedRepere = normalizeRepere(repere);
  if (!normalizedRepere) return undefined;
  
  return elements.find(
    (e) =>
      !isJeuDeBarres(e) &&
      e.id !== excludeId &&
      normalizeRepere(e.repere) === normalizedRepere
  );
}

/** Helper to normalize repère for comparison */
function normalizeRepere(repere: string): string {
  return repere.trim().toUpperCase();
}

/**
 * Finds an element by repère and category within a specific scope.
 * @param elements - Array of elements to search
 * @param repere - The repère to search for
 * @param category - The departure category to match
 * @param excludeId - Optional element ID to exclude from search
 * @param contextJdb - Optional JDB element to limit search scope
 * @returns The matching element or undefined
 */
export function findElementByRepereAndCategory(
  elements: Element[],
  repere: string,
  category: DepartCategory,
  excludeId?: number,
  contextJdb?: Element | null
): Element | undefined {
  const normalizedRepere = normalizeRepere(repere);
  if (!normalizedRepere) return undefined;
  
  const scopedElements = contextJdb
    ? getElementsInJdbSection(elements, contextJdb.id)
    : elements;
  
  return scopedElements.find(
    (e) =>
      !isJeuDeBarres(e) &&
      e.id !== excludeId &&
      normalizeRepere(e.repere) === normalizedRepere &&
      departCategoryOf(e) === category
  );
}

/**
 * Calculates the insertion index after the last element sharing the same repère.
 * @param elements - Array of elements
 * @param repere - The repère to match
 * @param fromElementId - The element ID to start from
 * @returns The insertion index
 */
export function getInsertIndexAfterRepereGroup(
  elements: Element[],
  repere: string,
  fromElementId: number
): number {
  const normalizedRepere = normalizeRepere(repere);
  const startIndex = elements.findIndex((e) => e.id === fromElementId);
  
  if (startIndex < 0) return elements.length;

  let lastIndex = startIndex;
  for (let i = startIndex + 1; i < elements.length; i++) {
    const el = elements[i]!;
    if (isJeuDeBarres(el)) break;
    if (normalizeRepere(el.repere) !== normalizedRepere) break;
    lastIndex = i;
  }
  return lastIndex + 1;
}

/**
 * Returns the emplacement (location) of an element.
 * @param element - The element
 * @returns The emplacement string
 */
export function displayEmplacement(element: Element): string {
  return element.emplacement || DEFAULT_EMPLACEMENT;
}

/**
 * Finds the active Jeu de Barres at a given insertion index.
 * Searches backwards from the index to find the nearest JDB.
 * @param elements - Array of elements
 * @param insertIndex - The insertion index
 * @returns The JDB element or null if not found
 */
export function getActiveJeuDeBarres(
  elements: Element[],
  insertIndex: number
): Element | null {
  for (let i = insertIndex - 1; i >= 0; i--) {
    const el = elements[i];
    if (el && isJeuDeBarres(el)) return el;
  }
  return null;
}

/**
 * Finds the Jeu de Barres that contains a given element.
 * @param elements - Array of elements
 * @param elementId - The ID of the element to find
 * @returns The containing JDB element or null
 */
export function getJeuDeBarresForElement(
  elements: Element[],
  elementId: number
): Element | null {
  const elementIndex = elements.findIndex((e) => e.id === elementId);
  if (elementIndex < 0) return null;
  return getActiveJeuDeBarres(elements, elementIndex + 1);
}

/**
 * Returns all non-JDB elements that belong to a specific JDB section.
 * A JDB section starts at the given jdbId and ends just before the next JDB element.
 * @param elements - Array of elements
 * @param jdbId - The ID of the JDB element
 * @returns Array of elements in the JDB section
 */
export function getElementsInJdbSection(
  elements: Element[],
  jdbId: number
): Element[] {
  const jdbIndex = elements.findIndex((e) => e.id === jdbId);
  if (jdbIndex < 0) return [];

  const sectionElements: Element[] = [];
  for (let i = jdbIndex + 1; i < elements.length; i++) {
    const el = elements[i]!;
    if (isJeuDeBarres(el)) break;
    sectionElements.push(el);
  }
  return sectionElements;
}

/**
 * Returns the insertion index at the end of a JDB section.
 * @param elements - Array of elements
 * @param jdbId - The ID of the JDB element
 * @returns The insertion index
 */
export function getInsertIndexAfterJdbSection(
  elements: Element[],
  jdbId: number
): number {
  const jdbIndex = elements.findIndex((e) => e.id === jdbId);
  if (jdbIndex < 0) return elements.length;

  let insertIndex = jdbIndex + 1;
  while (insertIndex < elements.length && !isJeuDeBarres(elements[insertIndex]!)) {
    insertIndex++;
  }
  return insertIndex;
}

/**
 * Returns the default element type for a given JDB category.
 * @param jdb - The JDB element
 * @returns The default element type (prise or eclairage)
 */
export function defaultElementTypeForJdb(
  jdb: Element
): Exclude<ElementType, 'jeu_de_barres'> {
  const category = resolveJdbCategory(jdb.jdb_category);
  return category === 'prise' ? 'prise' : 'eclairage';
}

/**
 * Checks if an element type is allowed under a given JDB.
 * @param elementType - The element type to check
 * @param jdb - The JDB element (null if no JDB context)
 * @returns true if the type is allowed
 */
export function isTypeAllowedUnderJdb(
  elementType: ElementType,
  jdb: Element | null
): boolean {
  if (!jdb) return true;
  
  const category = resolveJdbCategory(jdb.jdb_category);
  const allowedTypes: Record<string, ElementType[]> = {
    eclairage: ['eclairage', 'divers'],
    prise: ['prise', 'divers'],
  };
  
  return allowedTypes[category]?.includes(elementType) || false;
}

/**
 * Normalizes an element by filling in missing fields and applying defaults.
 * Ensures type consistency and proper default values.
 * @param raw - The raw element from the database
 * @returns A normalized element with all required fields
 */
export function normalizeElement(raw: Element): Element {
  const isJdb = raw.type === 'jeu_de_barres' || raw.row_kind === 'bar_set';
  
  // Only convert to jeu_de_barres if the original type is jeu_de_barres
  // Don't convert divers/eclairage/prise to jeu_de_barres just because row_kind is bar_set
  const elementType = raw.type === 'jeu_de_barres' ? 'jeu_de_barres' : raw.type;
  const phase_type = raw.phase_type || DEFAULT_PHASE_TYPE;
  const coefDefaults = defaultCoefsForType(elementType, phase_type);
  
  const type_label = buildTypeLabel(raw, isJdb);

  return {
    ...raw,
    type: elementType,
    row_kind: isJdb ? 'bar_set' : (raw.row_kind || 'element'),
    type_label,
    emplacement: raw.emplacement || DEFAULT_EMPLACEMENT,
    bar_set_index: raw.bar_set_index || DEFAULT_BAR_SET_INDEX,
    phase_type,
    jdb_category: isJdb ? resolveJdbCategory(raw.jdb_category) : null,
    ku: raw.ku ?? DEFAULT_KU,
    ks: raw.ks ?? DEFAULT_KS,
    coef_ks: raw.coef_ks ?? coefDefaults.coef_ks,
    coef_ku: raw.coef_ku ?? coefDefaults.coef_ku,
    use_coefs: raw.use_coefs !== 0,
    is_multi: Boolean(raw.is_multi),
  };
}

/** Helper to build type_label for normalized element */
function buildTypeLabel(raw: Element, isJdb: boolean): string {
  if (raw.type_label) return raw.type_label;
  
  if (isJdb && raw.bar_set_index > 0) {
    return barSetLabel(raw.jdb_category ?? raw.type, raw.bar_set_index);
  }
  
  return raw.designation || '';
}

export type ElementTableRow =
  | { kind: 'jdb'; element: Element }
  | { kind: 'element'; element: Element }
  | { kind: 'subtotal'; label: string; totalPower: number; jdb: Element };

/**
 * Builds table rows with subtotals per Jeu de Barres section.
 * @param elements - Array of elements to process
 * @param articlesByElement - Optional map of articles by element ID for multi-depart calculations
 * @param collapsedJdbIds - Set of JDB IDs that should be collapsed (elements hidden)
 * @returns Array of table rows including JDB headers, elements, and subtotals
 */
export function buildElementTableRows(
  elements: Element[],
  articlesByElement: Record<number, Article[]> = {},
  collapsedJdbIds: Set<number> = new Set()
): ElementTableRow[] {
  const rows: ElementTableRow[] = [];
  let currentJdb: Element | null = null;
  let groupElements: Element[] = [];

  const flushSubtotal = (): void => {
    if (!currentJdb || groupElements.length === 0) return;
    
    const totalPower = calculateGroupPower(groupElements, articlesByElement);
    
    rows.push({
      kind: 'subtotal',
      label: `Sous-total ${jeuDeBarresTitle(currentJdb)}`,
      totalPower,
      jdb: currentJdb,
    });
    groupElements = [];
  };

  for (const element of elements) {
    if (isJeuDeBarres(element)) {
      flushSubtotal();
      currentJdb = element;
      rows.push({ kind: 'jdb', element });
    } else {
      if (currentJdb) {
        // Skip elements if the current JDB is collapsed
        if (collapsedJdbIds.has(currentJdb.id)) {
          groupElements.push(element);
        } else {
          groupElements.push(element);
          rows.push({ kind: 'element', element });
        }
      } else {
        rows.push({ kind: 'element', element });
      }
    }
  }
  
  flushSubtotal();
  return rows;
}

/** Helper to calculate total power for a group of elements */
function calculateGroupPower(
  groupElements: Element[],
  articlesByElement: Record<number, Article[]>
): number {
  return groupElements.reduce(
    (sum, element) =>
      sum +
      calcPuissanceTotale(
        element,
        element.is_multi ? articlesByElement[element.id] : undefined
      ),
    0
  );
}

/**
 * Returns the badge configuration for an element type.
 * Used to display type badges in the UI.
 * @param element - The element
 * @returns Object containing label and CSS className
 */
export function typeBadge(element: Element): {
  label: string;
  className: string;
} {
  const badgeConfig: Partial<Record<ElementType, { label: string; className: string }>> = {
    eclairage: {
      label: '💡 Éclairage',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    },
    divers: {
      label: '📦 Divers',
      className: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400',
    },
    jeu_de_barres: {
      label: '⚡ Jeu de barres',
      className: 'bg-[#1E3A5F] text-white',
    },
  };
  
  if (element.type === 'prise') {
    return element.phase_type === 'tri'
      ? {
          label: '🔌 Triphasé',
          className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
        }
      : {
          label: '🔌 Mono',
          className: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300',
        };
  }
  
  return badgeConfig[element.type] || badgeConfig.jeu_de_barres!;
}
