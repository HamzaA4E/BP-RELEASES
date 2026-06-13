import type { Article, Element, PhaseType } from '@/types';
import {
  displayEmplacement,
  displayTypeLabel,
  isPhaseTypeLabel,
  priseSocketTypeLabel,
} from '@/utils/elementHelpers';
import { articlesInstalledPower, calculationCurrent } from '@/utils/calculations';

/** Emplacement / désignation de pose d'un article (champ « Désignation » du modal). */
export function payloadToArticleDesignation(data: { emplacement: string }): string {
  return data.emplacement.trim();
}

/** Type technique d'un article (champ « Type » du modal). */
export function payloadToArticleTypeLabel(data: {
  type: string;
  type_label: string;
  phase_type?: PhaseType;
}): string {
  return data.type_label.trim();
}

export function elementToArticleDesignation(element: Element): string {
  return displayEmplacement(element).trim();
}

export function elementToArticleTypeLabel(element: Element): string {
  return displayTypeLabel(element).trim();
}

export function displayArticleTypeLabel(
  article: Article,
  element: Element,
  isFirstArticle = false
): string {
  const fromArticle = (article.type_label ?? '').trim();
  if (fromArticle && !(element.type === 'prise' && isPhaseTypeLabel(fromArticle))) {
    return fromArticle;
  }
  if (isFirstArticle && element.type === 'prise') {
    return priseSocketTypeLabel(element.type_label) || '—';
  }
  if (isFirstArticle) {
    return displayTypeLabel(element).trim() || '—';
  }
  return '—';
}

export function displayArticleDesignation(article: Article): string {
  return article.designation?.trim() ?? '';
}

export function buildArticlesSummary(articles: Article[], maxLen = 60): string {
  if (articles.length === 0) return '';
  const parts = articles.map((a) => {
    const label = a.type_label?.trim() || a.designation?.trim() || 'Article';
    const short = label.length > 20 ? `${label.slice(0, 18)}…` : label;
    return `${short} ×${a.quantity}`;
  });
  let summary = parts.join(' + ');
  if (summary.length > maxLen) {
    summary = `${summary.slice(0, maxLen - 3)}...`;
  }
  return summary;
}

export function multiDepartInstalledPower(articles: Article[]): number {
  return articlesInstalledPower(articles);
}

export function multiDepartWithCoefs(
  articles: Article[],
  coefKs: number,
  coefKu: number
): number {
  return Math.round(articlesInstalledPower(articles) * coefKs * coefKu);
}

export function multiDepartIntensity(
  articles: Article[],
  coefKs: number,
  coefKu: number
): number {
  return calculationCurrent(multiDepartWithCoefs(articles, coefKs, coefKu));
}

export function newArticleTempId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
