/** Calculs de puissance — source unique pour UI, SQLite et exports. */

export const DEFAULT_COS_PHI = 0.8;
export const CALC_VOLTAGE = 400;
export const CALC_COS_PHI = 0.8;
const SQRT3 = Math.sqrt(3);

/** Champs minimaux pour calculer la puissance totale d'un élément. */
export interface PowerElementInput {
  type: string;
  power_w: number;
  quantity: number;
  coef_ks?: number;
  coef_ku?: number;
  ks?: number;
  ku?: number;
  row_kind?: string;
}

export function isInstalledPowerRow(el: {
  type?: string;
  row_kind?: string;
}): boolean {
  return el.type !== 'jeu_de_barres' && el.row_kind !== 'bar_set';
}

export function resolveElementCoefs(el: PowerElementInput): {
  ks: number;
  ku: number;
} {
  return {
    ks: el.coef_ks ?? el.ks ?? 1,
    ku: el.coef_ku ?? el.ku ?? 1,
  };
}

/** Affiche Ks=x · Ku=y */
export function formatCoefsLine(ks: number, ku: number): string {
  return `Ks=${ks} · Ku=${ku}`;
}

export function wattsToKw(powerW: number): number {
  return powerW / 1000;
}

/** Puissance totale d'un élément en W : P × Qté × Ks × Ku (arrondi). */
export function calcPuissanceTotale(el: PowerElementInput): number {
  if (el.type === 'attente' || el.type === 'jeu_de_barres') return 0;
  const { ks, ku } = resolveElementCoefs(el);
  return Math.round(el.power_w * el.quantity * ks * ku);
}

/** Somme des puissances totales du tableau en W (hors attente et jeux de barres). */
export function panelTotalPower(elements: PowerElementInput[]): number {
  return elements
    .filter((el) => el.type !== 'jeu_de_barres' && el.type !== 'attente')
    .reduce((sum, el) => sum + calcPuissanceTotale(el), 0);
}

/** @deprecated Utiliser panelTotalPower */
export function panelUsedPower(elements: PowerElementInput[]): number {
  return panelTotalPower(elements);
}

/** Puissance installée en W : somme P × Qté × Ks × Ku (hors JDB / bar_set). */
export function panelInstalledPower(elements: PowerElementInput[]): number {
  return elements
    .filter(isInstalledPowerRow)
    .reduce((sum, el) => sum + calcPuissanceTotale(el), 0);
}

export interface PanelPowerSummary {
  installed: number;
  used: number;
  current: number;
}

export function panelPowerSummary(elements: PowerElementInput[]): PanelPowerSummary {
  const installed = panelInstalledPower(elements);
  const used = panelTotalPower(elements);
  const current = calculationCurrent(used);
  return { installed, used, current };
}

/**
 * Intensité de calcul triphasée :
 * I = (P_kW × 1000) / (400 × 0,8 × √3)  avec P_kW = powerW / 1000
 */
export function calculationCurrent(powerW: number): number {
  if (powerW <= 0) return 0;
  const denominator = CALC_VOLTAGE * CALC_COS_PHI * SQRT3;
  return powerW / denominator;
}

/** Formule Excel pour l'intensité à partir d'une cellule de puissance totale en kW. */
export function excelCurrentFormula(totalPowerKwCell: string): string {
  return `${totalPowerKwCell}*1000/(400*0.8*SQRT(3))`;
}
