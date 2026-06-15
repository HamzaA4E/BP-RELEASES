import type { Element, ElementType, PhaseType } from '@/types';
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
} from '../../shared/powerCalculations';

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
  phaseType: PhaseType = 'mono'
): { coef_ks: number; coef_ku: number } {
  switch (type) {
    case 'eclairage':
      return { coef_ks: 1.0, coef_ku: 1.0 };
    case 'prise':
      return { coef_ks: 0.8, coef_ku: 1.0 };
    case 'divers':
      return { coef_ks: 0.0, coef_ku: 0.0 };
    case 'jeu_de_barres':
      return { coef_ks: 1.0, coef_ku: 1.0 };
  }
}

export function totalInstalledPower(
  powerW: number,
  quantity: number,
  coefKs: number = 1,
  coefKu: number = 1
): number {
  return Math.round(powerW * quantity * coefKs * coefKu);
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('fr-FR', {
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

const PREFIX_MAP: Record<ElementType, string> = {
  eclairage: 'E',
  prise: 'P',
  divers: 'D',
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

export function formatKuDisplay(ku: number): string {
  return ku.toFixed(2);
}
