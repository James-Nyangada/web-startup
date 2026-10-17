import { describe, expect, it } from 'vitest';
import { scoreBand, scorePage, scoreScan } from '../../../src/scanner/results/score.js';
import { page, rule } from '../../helpers/scan-data.js';

describe('scorePage (spec 6.8)', () => {
  it('is 100 with nothing to measure or only passes', () => {
    expect(scorePage({ passedRules: [], violations: [] })).toBe(100);
    expect(scorePage({ passedRules: ['image-alt', 'label'], violations: [] })).toBe(100);
  });

  it('applies weight × min(1 + log2(nodes), 4)', () => {
    // P = image-alt(10) + label(10) = 20; F = color-contrast(6) × (1 + log2(1)) = 6 → 100 × 20/26 = 76.9
    expect(
      scorePage({
        passedRules: ['image-alt', 'label'],
        violations: [rule('color-contrast', ['p'], 'serious')],
      }),
    ).toBe(77);
    // 4 nodes: 6 × (1 + 2) = 18 → 100 × 20/38 = 52.6
    expect(
      scorePage({
        passedRules: ['image-alt', 'label'],
        violations: [rule('color-contrast', ['a', 'b', 'c', 'd'], 'serious')],
      }),
    ).toBe(53);
  });

  it('caps the node multiplier at 4', () => {
    const many = rule(
      'color-contrast',
      Array.from({ length: 500 }, (_, i) => `p${i}`),
      'serious',
    );
    const eight = rule(
      'color-contrast',
      Array.from({ length: 8 }, (_, i) => `p${i}`),
      'serious',
    );
    expect(scorePage({ passedRules: ['label'], violations: [many] })).toBe(
      scorePage({ passedRules: ['label'], violations: [eight] }),
    );
  });

  it('is 0 when everything failed', () => {
    expect(scorePage({ passedRules: [], violations: [rule('image-alt', ['img'])] })).toBe(0);
  });
});

describe('scoreScan', () => {
  it('averages OK pages only', () => {
    expect(
      scoreScan([
        page('a', 't', [], { passedRules: ['label'] }),
        page('b', 't', [rule('image-alt', ['img'])], { passedRules: ['label'] }),
        page('c', 't', [rule('image-alt', ['img'])], { status: 'timeout' }),
      ]),
    ).toBe(75);
  });

  it('is null when no page was scanned', () => {
    expect(scoreScan([page('a', 't', [], { status: 'http_error' })])).toBeNull();
  });
});

describe('scoreBand', () => {
  it.each([
    [100, 'Good'],
    [90, 'Good'],
    [89, 'Needs work'],
    [70, 'Needs work'],
    [69, 'Poor'],
    [0, 'Poor'],
  ] as const)('%i → %s', (score, band) => expect(scoreBand(score)).toBe(band));
});
