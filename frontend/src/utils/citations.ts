import type { Citation, ExtractionResponse } from '../types';
export type GroupedCitations = {
  primaryDoi: Citation[];
  secondaryDoi: Citation[];
  primaryId: Citation[];
  secondaryId: Citation[];
  articles: Citation[];
};
export const CATEGORY_KEYS = ['PRIMARY DOI', 'SECONDARY DOI', 'PRIMARY ID', 'SECONDARY ID', 'ARTICLE'] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];
export function getCategoryKey(cit: Citation): CategoryKey {
  const isHttp = (cit.citation || '').startsWith('http');
  if (cit.category === 'Primary') return isHttp ? 'PRIMARY DOI' : 'PRIMARY ID';
  if (cit.category === 'Secondary') return isHttp ? 'SECONDARY DOI' : 'SECONDARY ID';
  return 'ARTICLE';
}
export function getBadgeColor(cls: string): string {
  if (cls === 'primary-doi') return '#22c55e';
  if (cls === 'primary-id') return '#06b6d4';
  if (cls === 'secondary-doi') return '#eab308';
  if (cls === 'secondary-id') return '#ec4899';
  if (cls === 'article') return '#3b82f6';
  return '#8b5cf6';
}
export function getBadgeBg(cls: string): string {
  if (cls === 'primary-doi') return 'rgba(34, 197, 94, 0.15)';
  if (cls === 'primary-id') return 'rgba(6, 182, 212, 0.15)';
  if (cls === 'secondary-doi') return 'rgba(234, 179, 8, 0.15)';
  if (cls === 'secondary-id') return 'rgba(236, 72, 153, 0.15)';
  if (cls === 'article') return 'rgba(59, 130, 246, 0.15)';
  return 'rgba(139, 92, 246, 0.15)';
}
export function getMarkClassAndTitle(cit: Citation): {
  className: string;
  title: string;
} {
  const isHttp = (cit.citation || '').startsWith('http');
  if (cit.category === 'Primary') {
    return {
      className: isHttp ? 'mark-primary-doi' : 'mark-primary-id',
      title: isHttp ? 'Primary Dataset DOI' : 'Primary Dataset ID',
    };
  }
  if (cit.category === 'Secondary') {
    return {
      className: isHttp ? 'mark-secondary-doi' : 'mark-secondary-id',
      title: isHttp ? 'Secondary Dataset DOI' : 'Secondary Dataset ID',
    };
  }
  return { className: 'mark-article', title: 'Article' };
}
export function hexToRgbNormalized(hexColor: string): [number, number, number] {
  const r = parseInt(hexColor.slice(1, 3), 16) / 255;
  const g = parseInt(hexColor.slice(3, 5), 16) / 255;
  const b = parseInt(hexColor.slice(5, 7), 16) / 255;
  return [r, g, b];
}
export function markClassToHex(className: string): string {
  if (className === 'mark-primary-doi') return '#22c55e';
  if (className === 'mark-secondary-doi') return '#eab308';
  if (className === 'mark-primary-id') return '#06b6d4';
  if (className === 'mark-secondary-id') return '#ec4899';
  return '#3b82f6';
}
export function resolveCitationUrl(cit: Citation): string {
  let targetUrl = cit.url || '';
  if (!targetUrl && (cit.citation || '').startsWith('http')) {
    targetUrl = cit.citation;
  }
  if (!targetUrl && ((cit.citation || '').startsWith('10.') || (cit.citation || '').includes('doi.org'))) {
    targetUrl = 'https://doi.org/' + (cit.citation || '').replace(/^doi:/i, '');
  }
  if (!targetUrl.startsWith('http')) {
    targetUrl = '';
  }
  return targetUrl;
}
export function repairCitations(data: ExtractionResponse): ExtractionResponse {
  const repaired = { ...data };
  if (Array.isArray(repaired.citations)) {
    repaired.citations.forEach(
      (
        cit: Citation & {
          text?: string;
          title?: string;
        },
      ) => {
        if (!cit.citation && cit.text) cit.citation = cit.text;
        if (!cit.category && cit.title) {
          if (cit.title.includes('Primary')) cit.category = 'Primary';
          else if (cit.title.includes('Secondary')) cit.category = 'Secondary';
          else cit.category = 'Article';
        }
      },
    );
  }
  return repaired;
}
export function groupCitations(results: ExtractionResponse | null): GroupedCitations {
  const grouped: GroupedCitations = {
    primaryDoi: [],
    secondaryDoi: [],
    primaryId: [],
    secondaryId: [],
    articles: [],
  };
  if (!results) return grouped;
  results.citations.forEach((cit) => {
    const isHttp = (cit.citation || '').startsWith('http');
    const cat = cit.category;
    if (cat === 'Article') {
      grouped.articles.push(cit);
    } else if (cat === 'Primary') {
      if (isHttp) grouped.primaryDoi.push(cit);
      else grouped.primaryId.push(cit);
    } else if (cat === 'Secondary') {
      if (isHttp) grouped.secondaryDoi.push(cit);
      else grouped.secondaryId.push(cit);
    }
  });
  const sortFn = (a: Citation, b: Citation) => a.citation.localeCompare(b.citation);
  grouped.primaryDoi.sort(sortFn);
  grouped.secondaryDoi.sort(sortFn);
  grouped.primaryId.sort(sortFn);
  grouped.secondaryId.sort(sortFn);
  grouped.articles.sort(sortFn);
  return grouped;
}
export function defaultVisibleCategories(): Record<string, boolean> {
  return {
    'PRIMARY DOI': true,
    'SECONDARY DOI': true,
    'PRIMARY ID': true,
    'SECONDARY ID': true,
    ARTICLE: true,
  };
}
