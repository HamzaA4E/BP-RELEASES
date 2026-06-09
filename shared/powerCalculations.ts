/** Calculs de puissance — source unique pour UI, SQLite et exports. */

export const DEFAULT_COS_PHI = 0.8;
export const DEFAULT_VOLTAGE = 230;

const STANDARD_BREAKERS = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200] as const;

/** Champs minimaux pour calculer la puissance utile d’un élément. */
export interface PowerElementInput {
  type: string;
  power_w: number;
  quantity: number;
  coef_ks?: number;
  coef_ku?: number;
  coef_fp?: number;
  ks?: number;
  ku?: number;
  fp?: number;
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
  fp: number;
} {
  return {
    ks: el.coef_ks ?? el.ks ?? 1,
    ku: el.coef_ku ?? el.ku ?? 1,
    fp: el.coef_fp ?? el.fp ?? 1,
  };
}

/** Puissance utile d’un élément : P × Qté × Ks × Ku × Fp (arrondi). */
export function calcPuissanceUtilisee(el: PowerElementInput): number {
  if (el.type === 'attente' || el.type === 'jeu_de_barres') return 0;
  const { ks, ku, fp } = resolveElementCoefs(el);
  return Math.round(el.power_w * el.quantity * ks * ku * fp);
}

/** Somme des puissances utiles du tableau (hors attente et jeux de barres). */
export function panelUsedPower(elements: PowerElementInput[]): number {
  return elements
    .filter((el) => el.type !== 'jeu_de_barres' && el.type !== 'attente')
    .reduce((sum, el) => sum + calcPuissanceUtilisee(el), 0);
}

/** Puissance installée : somme P × Qté (hors JDB / bar_set). */
export function panelInstalledPower(
  elements: Array<{ power_w: number; quantity: number; type?: string; row_kind?: string }>
): number {
  return elements
    .filter(isInstalledPowerRow)
    .reduce((sum, el) => sum + el.power_w * el.quantity, 0);
}

export interface PanelPowerSummary {
  installed: number;
  /** Puissance utile (même valeur que used_power_w / P. absorbée en UI). */
  used: number;
  current: number;
  breaker: number;
}

export function panelPowerSummary(elements: PowerElementInput[]): PanelPowerSummary {
  const installed = panelInstalledPower(elements);
  const used = panelUsedPower(elements);
  const current = calculationCurrent(used);
  const breaker = recommendedBreakerAmps(current);
  return { installed, used, current, breaker };
}

export function calculationCurrent(
  usedPowerW: number,
  voltageV: number = DEFAULT_VOLTAGE,
  cosPhi: number = DEFAULT_COS_PHI
): number {
  if (voltageV <= 0 || cosPhi <= 0) return 0;
  return usedPowerW / (voltageV * cosPhi);
}

export function recommendedBreakerAmps(current: number): number {
  const breaker = STANDARD_BREAKERS.find((b) => b >= current);
  if (breaker !== undefined) return breaker;
  return STANDARD_BREAKERS[STANDARD_BREAKERS.length - 1] ?? 200;
}
