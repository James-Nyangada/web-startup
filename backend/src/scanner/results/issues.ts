import { createHash } from 'node:crypto';
import { ruleInfo, type Impact } from '../rules/catalog.js';
import type { AxeRuleResult, PageResult } from '../runner/page-runner.js';

const IMPACT_ORDER: Record<Impact, number> = { critical: 4, serious: 3, moderate: 2, minor: 1 };
export const MAX_SNIPPET_LENGTH = 2_000;

/** Spec 6.6: strip parts of a selector that change between page loads. */
export function normalizeSelector(selector: string): string {
  return selector
    .replace(/:nth-(child|of-type)\(\d+\)/g, '')
    .replace(/#[A-Za-z0-9_-]*\d{3,}[A-Za-z0-9_-]*/g, '#*') // generated IDs
    .replace(/\.(?:css|sc|jsx|svelte)-[a-z0-9]{5,}/gi, '.*') // CSS-in-JS hashes
    .replace(/\s+/g, ' ')
    .trim();
}

export function fingerprintOf(
  ruleId: string,
  templateKey: string,
  normalizedSelector: string,
): string {
  return createHash('sha256')
    .update(`${ruleId}|${templateKey}|${normalizedSelector}`)
    .digest('hex');
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// 7+ digits with common separators; avoids short numbers such as prices or years.
const PHONE = /(?<![\w-])\+?\d[\d\s().-]{5,}\d(?![\w-])/g;

/**
 * Spec 11.5: keep only the failing element's HTML, without `value` attributes
 * (may hold what someone typed), email addresses or phone numbers.
 */
export function scrubSnippet(html: string): string {
  const scrubbed = html
    .replace(/\svalue\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(EMAIL, '[email]')
    .replace(PHONE, (match) => (match.replace(/\D/g, '').length >= 7 ? '[phone]' : match));
  return scrubbed.length > MAX_SNIPPET_LENGTH
    ? `${scrubbed.slice(0, MAX_SNIPPET_LENGTH - 1)}…`
    : scrubbed;
}

export interface Occurrence {
  pageUrl: string;
  /** Exact selector on that page. */
  target: string;
}

export interface FoundIssue {
  fingerprint: string;
  ruleId: string;
  impact: Impact;
  wcagCriteria: string[];
  wcagLevel: 'A' | 'AA';
  templateKey: string;
  /** Normalised selector, stable across loads. */
  selector: string;
  htmlSnippet: string;
  failureSummary: string;
  /** Only axe "incomplete" results: a person must check it (spec 5.2 needs_review). */
  needsReview: boolean;
  occurrences: Occurrence[];
  occurrenceCount: number;
  /** Distinct pages it was seen on. */
  pageUrls: string[];
}

const targetString = (target: string[]) => target.join(' |> ');

/** Spec 6.6 / P1-09: one issue per fingerprint, with every (page, target) occurrence. */
export function groupIssues(pages: readonly PageResult[]): FoundIssue[] {
  const issues = new Map<string, FoundIssue & { _seen: Set<string>; _pages: Set<string> }>();

  const add = (page: PageResult, rule: AxeRuleResult, needsReview: boolean) => {
    for (const node of rule.nodes) {
      const target = targetString(node.target);
      const selector = normalizeSelector(target);
      const fingerprint = fingerprintOf(rule.ruleId, page.templateKey, selector);
      const info = ruleInfo(rule.ruleId, rule.impact);
      const impact = node.impact ?? rule.impact ?? info.defaultImpact;

      let issue = issues.get(fingerprint);
      if (!issue) {
        issue = {
          fingerprint,
          ruleId: rule.ruleId,
          impact,
          wcagCriteria: info.wcagCriteria,
          wcagLevel: info.wcagLevel,
          templateKey: page.templateKey,
          selector,
          htmlSnippet: scrubSnippet(node.html),
          failureSummary: scrubSnippet(node.failureSummary ?? ''),
          needsReview,
          occurrences: [],
          occurrenceCount: 0,
          pageUrls: [],
          _seen: new Set(),
          _pages: new Set(),
        };
        issues.set(fingerprint, issue);
      }
      if (IMPACT_ORDER[impact] > IMPACT_ORDER[issue.impact]) issue.impact = impact;
      // A confirmed violation anywhere outranks "needs review".
      if (!needsReview) issue.needsReview = false;
      const key = `${page.url}\n${target}`;
      if (!issue._seen.has(key)) {
        issue._seen.add(key);
        issue.occurrences.push({ pageUrl: page.url, target });
      }
      issue._pages.add(page.url);
    }
  };

  for (const page of pages) {
    if (page.status !== 'ok') continue;
    page.violations.forEach((rule) => add(page, rule, false));
    page.incomplete.forEach((rule) => add(page, rule, true));
  }

  return [...issues.values()]
    .map(({ _seen, _pages, ...issue }) => ({
      ...issue,
      occurrenceCount: _seen.size,
      pageUrls: [..._pages],
    }))
    .sort(
      (a, b) =>
        Number(a.needsReview) - Number(b.needsReview) ||
        IMPACT_ORDER[b.impact] - IMPACT_ORDER[a.impact] ||
        b.occurrenceCount - a.occurrenceCount ||
        a.fingerprint.localeCompare(b.fingerprint),
    );
}
