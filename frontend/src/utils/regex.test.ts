import { describe, expect, it } from 'vitest';
import { buildRobustRegex } from './regex';

describe('buildRobustRegex', () => {
  it('matches flexible spacing and punctuation for plain tokens', () => {
    const pattern = buildRobustRegex('GSE12345');
    expect('G S E 1 2 3 4 5').toMatch(pattern);
    expect('gse-12345').toMatch(pattern);
  });

  it('matches common DOI prefixes', () => {
    const pattern = buildRobustRegex('10.1234/abc-def', true);
    expect('doi: 10.1234/abc-def').toMatch(pattern);
    expect('https://doi.org/10.1234/abc-def').toMatch(pattern);
  });
});
