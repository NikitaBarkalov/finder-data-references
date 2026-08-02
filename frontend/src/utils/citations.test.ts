import { describe, expect, it } from 'vitest';
import {
  CATEGORY_KEYS,
  defaultVisibleCategories,
  getBadgeBg,
  getBadgeColor,
  getCategoryKey,
  getMarkClassAndTitle,
  groupCitations,
  markClassToHex,
  repairCitations,
  resolveCitationUrl,
} from './citations';
import type { Citation, ExtractionResponse } from '../types';

const makeCitation = (overrides: Partial<Citation> = {}): Citation => ({
  citation: 'GSE12345',
  context: 'context',
  category: 'Primary',
  ...overrides,
});

describe('citations utils', () => {
  it('maps citations to the expected category keys', () => {
    expect(getCategoryKey(makeCitation({ citation: 'https://doi.org/10.1/x', category: 'Primary' }))).toBe('PRIMARY DOI');
    expect(getCategoryKey(makeCitation({ citation: 'GSE12345', category: 'Primary' }))).toBe('PRIMARY ID');
    expect(getCategoryKey(makeCitation({ citation: 'https://doi.org/10.1/x', category: 'Secondary' }))).toBe('SECONDARY DOI');
    expect(getCategoryKey(makeCitation({ citation: 'GSE12345', category: 'Secondary' }))).toBe('SECONDARY ID');
    expect(getCategoryKey(makeCitation({ category: 'Article' }))).toBe('ARTICLE');
  });

  it('returns the configured category list and defaults', () => {
    expect(CATEGORY_KEYS).toEqual([
      'PRIMARY DOI',
      'SECONDARY DOI',
      'PRIMARY ID',
      'SECONDARY ID',
      'ARTICLE',
    ]);
    expect(defaultVisibleCategories()).toEqual({
      'PRIMARY DOI': true,
      'SECONDARY DOI': true,
      'PRIMARY ID': true,
      'SECONDARY ID': true,
      'ARTICLE': true,
    });
  });

  it('maps badge colors and classes consistently', () => {
    expect(getBadgeColor('primary-doi')).toBe('#22c55e');
    expect(getBadgeBg('primary-doi')).toContain('34, 197, 94');
    expect(getBadgeColor('secondary-id')).toBe('#ec4899');
    expect(markClassToHex('mark-secondary-id')).toBe('#ec4899');
    expect(getMarkClassAndTitle(makeCitation({ citation: 'https://doi.org/10.1/x', category: 'Primary' }))).toEqual({
      className: 'mark-primary-doi',
      title: 'Primary Dataset DOI',
    });
  });

  it('resolves URLs from citation records', () => {
    expect(resolveCitationUrl(makeCitation({ url: 'https://example.com/a' }))).toBe('https://example.com/a');
    expect(resolveCitationUrl(makeCitation({ citation: 'https://example.com/b' }))).toBe('https://example.com/b');
    expect(resolveCitationUrl(makeCitation({ citation: '10.1234/test' }))).toBe('https://doi.org/10.1234/test');
    expect(resolveCitationUrl(makeCitation({ citation: 'plain text' }))).toBe('');
  });

  it('repairs legacy citation payloads', () => {
    const input = {
      authors: 'Smith J',
      citations: [
        { text: 'GSE12345', title: 'Primary ID' },
        { citation: 'https://doi.org/10.1/x', title: 'Secondary DOI' },
      ],
    } as ExtractionResponse & { citations: Array<{ text?: string; title?: string; citation?: string; category?: string }> };

    const repaired = repairCitations(input);

    expect(repaired.citations[0].citation).toBe('GSE12345');
    expect(repaired.citations[0].category).toBe('Primary');
    expect(repaired.citations[1].category).toBe('Secondary');
  });

  it('groups and sorts citations by category and citation format', () => {
    const results: ExtractionResponse = {
      authors: 'Smith J',
      citations: [
        makeCitation({ citation: 'https://doi.org/10.1/b', category: 'Primary' }),
        makeCitation({ citation: 'GSE200', category: 'Secondary' }),
        makeCitation({ citation: 'https://doi.org/10.1/a', category: 'Secondary' }),
        makeCitation({ citation: 'Article 1', category: 'Article' }),
      ],
    };

    const grouped = groupCitations(results);

    expect(grouped.primaryDoi.map(c => c.citation)).toEqual(['https://doi.org/10.1/b']);
    expect(grouped.secondaryDoi.map(c => c.citation)).toEqual(['https://doi.org/10.1/a']);
    expect(grouped.secondaryId.map(c => c.citation)).toEqual(['GSE200']);
    expect(grouped.articles.map(c => c.citation)).toEqual(['Article 1']);
  });
});
