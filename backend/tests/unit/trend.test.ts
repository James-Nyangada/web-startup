import { describe, expect, it } from 'vitest';
import { computeTrendSummary, formatScanDate, type TrendPoint } from '../../src/lib/trend.js';

describe('computeTrendSummary (Spec S-24, P2-11)', () => {
  it('returns appropriate message when no trend points exist', () => {
    expect(computeTrendSummary([])).toBe('No scan history available yet.');
  });

  it('handles a single scan correctly', () => {
    const single: TrendPoint[] = [['12 Oct', 85, 8]];
    expect(computeTrendSummary(single)).toBe('Initial scan on 12 Oct scored 85 with 8 open problems.');
  });

  it('handles a single partial scan correctly', () => {
    const singlePartial: TrendPoint[] = [['12 Oct', 70, 15, true]];
    expect(computeTrendSummary(singlePartial)).toBe(
      'Initial scan on 12 Oct scored 70 with 15 open problems (partial scan).',
    );
  });

  it('computes "Score rose from 62 to 78 over 6 scans" as required by acceptance criteria', () => {
    const points: TrendPoint[] = [
      ['5 Aug', 62, 24],
      ['12 Aug', 65, 22],
      ['19 Aug', 68, 20],
      ['26 Aug', 70, 18],
      ['2 Sep', 74, 15],
      ['9 Sep', 78, 11],
    ];

    const summary = computeTrendSummary(points);
    expect(summary).toContain('Score rose from 62 to 78 over 6 scans since 5 Aug.');
    expect(summary).toContain('Open problems fell from 24 to 11.');
  });

  it('reports score drop when score decreases', () => {
    const points: TrendPoint[] = [
      ['1 Aug', 80, 10],
      ['8 Aug', 75, 14],
      ['15 Aug', 72, 18],
    ];

    const summary = computeTrendSummary(points);
    expect(summary).toContain('Score dropped from 80 to 72 over 3 scans since 1 Aug.');
    expect(summary).toContain('Open problems rose from 10 to 18.');
  });

  it('reports steady score when score does not change', () => {
    const points: TrendPoint[] = [
      ['1 Aug', 85, 10],
      ['8 Aug', 85, 10],
    ];

    const summary = computeTrendSummary(points);
    expect(summary).toContain('Score steady at 85 over 2 scans since 1 Aug.');
    expect(summary).toContain('Open problems remained at 10.');
  });

  it('notes partial scans in the summary', () => {
    const points: TrendPoint[] = [
      ['5 Aug', 61, 24],
      ['12 Aug', 63, 22],
      ['2 Sep', 64, 21, true],
      ['14 Oct', 78, 11],
    ];

    const summary = computeTrendSummary(points);
    expect(summary).toContain('The 2 Sep scan was partial.');
  });

  it('notes multiple partial scans', () => {
    const points: TrendPoint[] = [
      ['5 Aug', 61, 24, true],
      ['12 Aug', 63, 22],
      ['2 Sep', 64, 21, true],
      ['14 Oct', 78, 11],
    ];

    const summary = computeTrendSummary(points);
    expect(summary).toContain('2 scans were partial.');
  });
});

describe('formatScanDate', () => {
  it('formats Date or string into day + short month (e.g. "14 Oct")', () => {
    const d = new Date('2026-10-14T12:00:00Z');
    expect(formatScanDate(d)).toBe('14 Oct');
  });
});
