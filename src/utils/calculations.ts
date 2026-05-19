import type { Element, ElementType, PhaseType } from '@/types';

export const DEFAULT_COS_PHI = 0.8;
export const DEFAULT_VOLTAGE = 230;
export const DEFAULT_SECTION_MM2 = 2.5;
export const SIMULTANEITY_COEFFICIENT = 0.8;

const STANDARD_BREAKERS = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200] as const;

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

export function totalInstalledPower(powerW: number, quantity: number): number {
  return powerW * quantity;
}

export function calcPuissanceUtilisee(element: Element): number {
  if (element.type === 'attente' || element.type === 'jeu_de_barres') return 0;
  const puissanceTotale = element.power_w * element.quantity;
  return Math.round(
    puissanceTotale * element.coef_ks * element.coef_ku * element.coef_fp
  );
}

export function panelUsedPower(elements: Element[]): number {
  return elements
    .filter((el) => el.type !== 'jeu_de_barres' && el.type !== 'attente')
    .reduce((sum, el) => sum + calcPuissanceUtilisee(el), 0);
}

export function voltageDropPercent(
  distanceM: number,
  powerW: number,
  quantity: number,
  cosPhi: number = DEFAULT_COS_PHI,
  voltage: number = DEFAULT_VOLTAGE,
  sectionMm2: number = DEFAULT_SECTION_MM2
): number {
  if (distanceM <= 0 || powerW <= 0 || quantity <= 0) return 0;
  const numerator = 2 * distanceM * powerW * quantity;
  const denominator = cosPhi * voltage * sectionMm2 * 56;
  if (denominator === 0) return 0;
  return (numerator / denominator) * 100;
}

export function calculateCableSection(
  powerW: number,
  quantity: number,
  distanceM: number,
  cosPhi: number = DEFAULT_COS_PHI,
  voltageV: number = DEFAULT_VOLTAGE,
  sectionMm2: number = DEFAULT_SECTION_MM2
): number {
  return voltageDropPercent(distanceM, powerW, quantity, cosPhi, voltageV, sectionMm2);
}

export function panelInstalledPower(
  elements: Array<{ power_w: number; quantity: number; type?: string; row_kind?: string }>
): number {
  return elements
    .filter((el) => {
      if (el.type === 'jeu_de_barres') return false;
      if (el.row_kind === 'bar_set') return false;
      return true;
    })
    .reduce((sum, el) => sum + el.power_w * el.quantity, 0);
}

export function panelAbsorbedPower(installedPower: number): number {
  return installedPower * SIMULTANEITY_COEFFICIENT;
}

export function calculationCurrent(
  absorbedPower: number,
  voltageV: number = DEFAULT_VOLTAGE,
  cosPhi: number = DEFAULT_COS_PHI
): number {
  if (voltageV <= 0 || cosPhi <= 0) return 0;
  return absorbedPower / (voltageV * cosPhi);
}

export function recommendedBreakerAmps(current: number): number {
  const breaker = STANDARD_BREAKERS.find((b) => b >= current);
  if (breaker !== undefined) return breaker;
  return STANDARD_BREAKERS[STANDARD_BREAKERS.length - 1] ?? 200;
}

export function voltageDropColorClass(percent: number): string {
  if (percent > 3) return 'text-red-600 dark:text-red-400 font-semibold';
  if (percent >= 1.5) return 'text-amber-600 dark:text-amber-400 font-medium';
  return 'text-gray-700 dark:text-gray-300';
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatPower(value: number): string {
  return `${formatNumber(value, 0)} W`;
}

export function formatPercent(value: number): string {
  return `${formatNumber(value, 2)} %`;
}

const PREFIX_MAP: Record<ElementType, string> = {
  eclairage: 'E',
  prise: 'P',
  attente: 'A',
  jeu_de_barres: 'JDB',
};

export function getNextRepere(existingElements: Element[], type: ElementType): string {
  const prefix = PREFIX_MAP[type];
  const existing = existingElements
    .filter((e) => e.type === type)
    .map((e) => {
      const m = e.repere.match(/^[A-Za-z_\-]+(\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
  const maxNum = existing.length > 0 ? Math.max(...existing) : 0;
  return `${prefix}${maxNum + 1}`;
}

/** @deprecated Use getNextRepere */
export function suggestRepere(type: ElementType, existingReperes: string[]): string {
  const prefix = PREFIX_MAP[type];
  const numbers = existingReperes
    .filter((r) => r.toUpperCase().startsWith(prefix))
    .map((r) => {
      const match = r.match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
      return match?.[1] ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n));
  const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
  return `${prefix}${next}`;
}

export function generateReperePreview(
  baseRepere: string,
  count: number
): string[] {
  if (count <= 1) return [baseRepere];

  const match = baseRepere.match(/^([A-Za-z_\-]+)(\d+)$/);

  if (match) {
    const prefix = match[1];
    const startNum = parseInt(match[2], 10);
    return Array.from({ length: count }, (_, i) => `${prefix}${startNum + i}`);
  }

  return Array.from({ length: count }, (_, i) => `${baseRepere}_${i + 1}`);
}

export function elementVoltage(element: { phase_type?: string }): number {
  return element.phase_type === 'tri' ? 400 : 230;
}
