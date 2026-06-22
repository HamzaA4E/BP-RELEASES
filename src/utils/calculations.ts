import type { Element, ElementType, PhaseType } from "@/types";
import {
  calcPuissanceTotale,
  panelTotalPower,
  panelUsedPower,
  panelInstalledPower,
  calculationCurrent,
  formatCoefsLine,
  resolveElementCoefs,
  wattsToKw,
  articlesInstalledPower,
  articlesTotalPower,
  calcArticlePower,
} from "../../shared/powerCalculations";
import { getElementsInJdbSection } from "@/utils/elementHelpers";

export {
  calcPuissanceTotale,
  panelTotalPower,
  panelUsedPower,
  panelInstalledPower,
  calculationCurrent,
  formatCoefsLine,
  resolveElementCoefs,
  wattsToKw,
  articlesInstalledPower,
  articlesTotalPower,
  calcArticlePower,
};

export function defaultCoefsForType(
  type: ElementType,
  _phaseType: PhaseType = "mono",
): { coef_ks: number; coef_ku: number } {
  switch (type) {
    case "eclairage":
      return { coef_ks: 1.0, coef_ku: 1.0 };
    case "prise":
      return { coef_ks: 0.8, coef_ku: 1.0 };
    case "divers":
      return { coef_ks: 0.0, coef_ku: 0.0 };
    case "jeu_de_barres":
      return { coef_ks: 1.0, coef_ku: 1.0 };
  }
}

export function totalInstalledPower(
  powerW: number,
  quantity: number,
  coefKs: number = 1,
  coefKu: number = 1,
): number {
  return Math.round(powerW * quantity * coefKs * coefKu);
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Affiche une puissance stockée en W sous forme kW. */
export function formatPower(powerW: number): string {
  return `${formatNumber(wattsToKw(powerW), 3)} kW`;
}

export function formatPowerKwFromWatts(powerW: number, decimals = 3): string {
  return `${formatNumber(wattsToKw(powerW), decimals)} kW`;
}

export const PREFIX_MAP: Record<ElementType, string> = {
  eclairage: "E",
  prise: "P",
  divers: "D",
  jeu_de_barres: "JDB",
};

const REPERE_NUMBER_REGEX = /^(.*?)(\d+)$/;

export function parseRepereNumber(repere: string): { prefix: string; number: number } | null {
  const match = repere.match(REPERE_NUMBER_REGEX);
  if (!match) return null;
  const prefix = match[1] ?? '';
  const number = parseInt(match[2] ?? '0', 10);
  return { prefix, number };
}

/** Returns the next repere number for a given element type.
 *  When a contextJdb is provided, only elements within that JDB section are counted
 *  so each jeu de barres has its own departure numbering starting from 1.
 *  Preserves any custom prefix (e.g. "/E", "../E") found on existing reperes.
 *  When reperePrefix is provided, it is prepended before the type prefix
 *  (e.g. reperePrefix "TD N3/" + type "eclairage" produces "TD N3/E1").
 */
export function getNextRepere(
  existingElements: Element[],
  type: ElementType,
  contextJdb?: Element | null,
  reperePrefix?: string | null,
): string {
  const typePrefix = PREFIX_MAP[type];
  const fullPrefix = reperePrefix ? `${reperePrefix}${typePrefix}` : typePrefix;
  const scopedElements = contextJdb
    ? getElementsInJdbSection(existingElements, contextJdb.id)
    : existingElements;

  let maxNum = 0;

  for (const e of scopedElements) {
    if (e.type !== type) continue;
    const parsed = parseRepereNumber(e.repere);
    if (!parsed) continue;
    // With a panel prefix, only count reperes that use the same full prefix
    // (e.g. "TD2/E5" matches, "E5" does not).
    if (reperePrefix && parsed.prefix !== fullPrefix) continue;
    if (parsed.number > maxNum) {
      maxNum = parsed.number;
    }
  }

  return `${fullPrefix}${maxNum + 1}`;
}

export function generateReperePreview(
  baseRepere: string,
  count: number,
): string[] {
  if (count <= 1) return [baseRepere];

  const parsed = parseRepereNumber(baseRepere);

  if (parsed) {
    const { prefix, number: startNum } = parsed;
    return Array.from(
      { length: count },
      (_, i) => `${prefix}${startNum + i}`
    );
  }

  return Array.from({ length: count }, (_, i) => `${baseRepere}_${i + 1}`);
}

export function formatKuDisplay(ku: number): string {
  return ku.toFixed(2);
}
