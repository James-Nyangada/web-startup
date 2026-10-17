import type { AxeRuleResult, PageResult } from '../../src/scanner/runner/page-runner.js';

export function page(
  url: string,
  templateKey: string,
  violations: AxeRuleResult[] = [],
  extra: Partial<PageResult> = {},
): PageResult {
  return {
    url,
    finalUrl: url,
    templateKey,
    status: 'ok',
    httpStatus: 200,
    loadMs: 100,
    title: 'T',
    violations,
    incomplete: [],
    passedRules: [],
    ...extra,
  };
}

export function rule(
  ruleId: string,
  targets: string[],
  impact: AxeRuleResult['impact'] = 'critical',
): AxeRuleResult {
  return {
    ruleId,
    impact,
    tags: [],
    nodes: targets.map((target) => ({
      target: [target],
      html: `<x data-t="${target}">`,
      failureSummary: 'Fix it',
      impact,
    })),
  };
}
