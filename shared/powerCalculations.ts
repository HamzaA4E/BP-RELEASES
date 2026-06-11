/** Calculs de puissance — source unique pour UI, SQLite et exports. */

export const DEFAULT_COS_PHI = 0.8;
export const DEFAULT_VOLTAGE = 230;

const STANDARD_BREAKERS = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200] as const;

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

/** Affiche Ks=x ou Ks=x · Ku=y (Ku omis si égal à 1). */
export function formatCoefsLine(ks: number, ku: number): string {
  if (ku === 1) return `Ks=${ks}`;
  return `Ks=${ks} · Ku=${ku}`;
}

/** Puissance totale d'un élément : P × Qté × Ks (arrondi). */
export function calcPuissanceTotale(el: PowerElementInput): number {
  if (el.type === 'attente' || el.type === 'jeu_de_barres') return 0;
  const { ks } = resolveElementCoefs(el);
  return Math.round(el.power_w * el.quantity * ks);
}

/** Somme des puissances totales du tableau (hors attente et jeux de barres). */
export function panelTotalPower(elements: PowerElementInput[]): number {
  return elements
    .filter((el) => el.type !== 'jeu_de_barres' && el.type !== 'attente')
    .reduce((sum, el) => sum + calcPuissanceTotale(el), 0);
}

/** @deprecated Utiliser panelTotalPower */
export function panelUsedPower(elements: PowerElementInput[]): number {
  return panelTotalPower(elements);
}

/** Puissance installée : somme P × Qté × Ks (hors JDB / bar_set). */
export function panelInstalledPower(elements: PowerElementInput[]): number {
  return elements
    .filter(isInstalledPowerRow)
    .reduce((sum, el) => sum + calcPuissanceTotale(el), 0);
}

export interface PanelPowerSummary {
  installed: number;
  used: number;
  current: number;
  breaker: number;
}

export function panelPowerSummary(elements: PowerElementInput[]): PanelPowerSummary {
  const installed = panelInstalledPower(elements);
  const used = panelTotalPower(elements);
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
