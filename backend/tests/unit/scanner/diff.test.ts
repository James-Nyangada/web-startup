import { describe, expect, it } from 'vitest';
import {
  diffScans,
  isPartialScan,
  wasChecked,
  type PreviousIssue,
  type ScannedPage,
} from '../../../src/scanner/results/diff.js';
import type { FoundIssue } from '../../../src/scanner/results/issues.js';

const found = (fingerprint: string, templateKey = 'product'): FoundIssue => ({
  fingerprint,
  ruleId: 'image-alt',
  impact: 'critical',
  wcagCriteria: ['1.1.1'],
  wcagLevel: 'A',
  templateKey,
  selector: 'img',
  htmlSnippet: '<img>',
  failureSummary: '',
  needsReview: false,
  occurrences: [],
  occurrenceCount: 1,
  pageUrls: [],
});

const prev = (
  fingerprint: string,
  status: PreviousIssue['status'],
  lastSeenPageUrls = ['/p1'],
  templateKey = 'product',
): PreviousIssue => ({
  fingerprint,
  status,
  templateKey,
  lastSeenPageUrls,
});

const ok = (url: string, templateKey = 'product'): ScannedPage => ({ url, templateKey, ok: true });
const failed = (url: string, templateKey = 'product'): ScannedPage => ({
  url,
  templateKey,
  ok: false,
});

describe('diffScans: every row of the spec 6.7 table', () => {
  it('(none) + seen → created', () => {
    const diff = diffScans([], [found('a')], [ok('/p1')]);
    expect(diff.created.map((i) => i.fingerprint)).toEqual(['a']);
  });

  it('open + seen → still open, no event', () => {
    const diff = diffScans([prev('a', 'open')], [found('a')], [ok('/p1')]);
    expect(diff.stillOpen.map((i) => i.fingerprint)).toEqual(['a']);
    expect(diff.created).toEqual([]);
    expect(diff.fixed).toEqual([]);
  });

  it('open + not seen + its pages scanned OK → fixed', () => {
    const diff = diffScans([prev('a', 'open', ['/p1', '/p2'])], [], [ok('/p1'), ok('/p2')]);
    expect(diff.fixed.map((i) => i.fingerprint)).toEqual(['a']);
  });

  it('open + not seen + one of its pages failed → unchanged', () => {
    const diff = diffScans(
      [prev('a', 'open', ['/p1', '/p2'])],
      [],
      [ok('/p1'), failed('/p2'), ok('/x', 'home')],
    );
    expect(diff.fixed).toEqual([]);
    expect(diff.unchecked.map((i) => i.fingerprint)).toEqual(['a']);
  });

  it('open + not seen + its pages not in this sample → unchanged', () => {
    const diff = diffScans([prev('a', 'open', ['/p1'])], [], [ok('/p9'), ok('/x', 'home')]);
    expect(diff.unchecked.map((i) => i.fingerprint)).toEqual(['a']);
  });

  it('open + not seen + ≥ 3 pages of its template scanned OK → fixed (template coverage)', () => {
    const diff = diffScans([prev('a', 'open', ['/p1'])], [], [ok('/p7'), ok('/p8'), ok('/p9')]);
    expect(diff.fixed.map((i) => i.fingerprint)).toEqual(['a']);
  });

  it('fixed + seen → regressed', () => {
    const diff = diffScans([prev('a', 'fixed')], [found('a')], [ok('/p1')]);
    expect(diff.regressed.map((i) => i.fingerprint)).toEqual(['a']);
  });

  it('fixed + not seen → unchanged', () => {
    const diff = diffScans([prev('a', 'fixed')], [], [ok('/p1')]);
    expect(
      Object.values(diff)
        .flat()
        .filter((x) => typeof x === 'object'),
    ).toEqual([]);
  });

  it('ignored + seen → stays ignored (occurrences still recorded)', () => {
    const diff = diffScans([prev('a', 'ignored')], [found('a')], [ok('/p1')]);
    expect(diff.ignoredSeen.map((i) => i.fingerprint)).toEqual(['a']);
    expect(diff.regressed).toEqual([]);
    expect(diff.created).toEqual([]);
  });

  it('ignored + not seen → unchanged, never fixed', () => {
    const diff = diffScans([prev('a', 'ignored')], [], [ok('/p1'), ok('/p2'), ok('/p3')]);
    expect(diff.fixed).toEqual([]);
  });
});

describe('partial scans', () => {
  it('more than 50% failed pages is partial', () => {
    expect(isPartialScan(10, 5)).toBe(false);
    expect(isPartialScan(10, 6)).toBe(true);
    expect(isPartialScan(0, 0)).toBe(false);
  });

  it('a partial scan never marks anything fixed', () => {
    const pages = [
      ok('/p1'),
      ok('/p2'),
      ok('/p3'),
      failed('/a'),
      failed('/b'),
      failed('/c'),
      failed('/d'),
    ];
    const diff = diffScans([prev('a', 'open', ['/p1'])], [], pages);
    expect(diff.partial).toBe(true);
    expect(diff.fixed).toEqual([]);
    expect(diff.unchecked.map((i) => i.fingerprint)).toEqual(['a']);
  });

  it('counts planned pages that never ran as failed', () => {
    const diff = diffScans([prev('a', 'open', ['/p1'])], [], [ok('/p1')], 4);
    expect(diff.partial).toBe(true);
  });

  it('still records new and regressed issues in a partial scan', () => {
    const pages = [ok('/p1'), failed('/a'), failed('/b')];
    const diff = diffScans([prev('r', 'fixed')], [found('n'), found('r')], pages);
    expect(diff.created.map((i) => i.fingerprint)).toEqual(['n']);
    expect(diff.regressed.map((i) => i.fingerprint)).toEqual(['r']);
  });
});

describe('wasChecked', () => {
  it('needs at least one OK page of the template', () => {
    expect(wasChecked(prev('a', 'open', ['/p1']), [ok('/p1', 'home')])).toBe(false);
  });

  it('is false for an issue with no recorded pages and too little coverage', () => {
    expect(wasChecked(prev('a', 'open', []), [ok('/p1')])).toBe(false);
  });
});
