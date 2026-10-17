import { ruleInfo } from '../rules/catalog.js';
import type { PageResult } from '../runner/page-runner.js';

/**
 * Spec 6.8. A heuristic shown as "Automated check score", never a compliance score.
 *   P = Σ weight(rule) over rules that passed on the page
 *   F = Σ weight(rule) × min(1 + log2(nodes), 4) over rules with violations
 *   pageScore = P + F == 0 ? 100 : round(100 × P / (P + F))
 */
export function scorePage(page: Pick<PageResult, 'passedRules' | 'violations'>): number {
  const passed = page.passedRules.reduce((sum, ruleId) => sum + ruleInfo(ruleId).weight, 0);
  const failed = page.violations.reduce((sum, rule) => {
    const nodes = Math.max(rule.nodes.length, 1);
    return sum + ruleInfo(rule.ruleId, rule.impact).weight * Math.min(1 + Math.log2(nodes), 4);
  }, 0);
  return passed + failed === 0 ? 100 : Math.round((100 * passed) / (passed + failed));
}

/** Mean of page scores over successfully scanned pages; null when none were scanned. */
export function scoreScan(pages: readonly PageResult[]): number | null {
  const scores = pages.filter((p) => p.status === 'ok').map(scorePage);
  if (scores.length === 0) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

export type ScoreBand = 'Good' | 'Needs work' | 'Poor';

export function scoreBand(score: number): ScoreBand {
  if (score >= 90) return 'Good';
  if (score >= 70) return 'Needs work';
  return 'Poor';
}
