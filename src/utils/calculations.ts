export const DEFAULT_COS_PHI = 0.8;
export const DEFAULT_VOLTAGE = 230;
export const DEFAULT_SECTION_MM2 = 2.5;
export const SIMULTANEITY_COEFFICIENT = 0.8;

const STANDARD_BREAKERS = [10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200] as const;

export function totalInstalledPower(powerW: number, quantity: number): number {
  return powerW * quantity;
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

export function panelInstalledPower(
  elements: Array<{ power_w: number; quantity: number }>
): number {
  return elements.reduce((sum, el) => sum + el.power_w * el.quantity, 0);
}

export function panelAbsorbedPower(installedPower: number): number {
  return installedPower * SIMULTANEITY_COEFFICIENT;
}

export function calculationCurrent(absorbedPower: number): number {
  return absorbedPower / (DEFAULT_VOLTAGE * DEFAULT_COS_PHI);
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

export function suggestRepere(
  type: 'eclairage' | 'prise',
  existingReperes: string[]
): string {
  const prefix = type === 'eclairage' ? 'E' : 'P';
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
