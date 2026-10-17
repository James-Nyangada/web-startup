import axe from 'axe-core';
import type { Standard } from '../types.js';
import { AUDIENCE_LABELS, RULE_CONTENT, type Audience } from './content.js';

export type Impact = 'critical' | 'serious' | 'moderate' | 'minor';

/** Spec 5.3: critical 10, serious 6, moderate 3, minor 1. */
export const IMPACT_WEIGHT: Record<Impact, number> = {
  critical: 10,
  serious: 6,
  moderate: 3,
  minor: 1,
};

export const STANDARD_TAGS: Record<Standard, string[]> = {
  wcag21aa: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
  wcag22aa: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
};

export const AXE_VERSION: string = axe.version;

export interface RuleInfo {
  ruleId: string;
  title: string;
  description: string;
  whoIsAffected: string[];
  audiences: Audience[];
  /** e.g. ['1.1.1', '4.1.2'] */
  wcagCriteria: string[];
  wcagLevel: 'A' | 'AA';
  defaultImpact: Impact;
  weight: number;
  helpUrl: string;
  axeVersion: string;
}

/** Tags like `wcag111`, `wcag1410` → `1.1.1`, `1.4.10`. */
export function wcagCriteriaFromTags(tags: readonly string[]): string[] {
  return tags
    .map((tag) => /^wcag(\d)(\d)(\d+)$/.exec(tag))
    .filter((match): match is RegExpExecArray => match !== null)
    .map(([, principle, guideline, criterion]) => `${principle}.${guideline}.${criterion}`);
}

export function wcagLevelFromTags(tags: readonly string[]): 'A' | 'AA' {
  return tags.some((tag) => /^wcag2\d?aa$/.test(tag)) ? 'AA' : 'A';
}

interface AxeAuditRule {
  id: string;
  impact?: Impact;
}

/** axe-core's internal rule list carries each rule's default impact. */
const auditImpacts = new Map(
  ((axe as unknown as { _audit: { rules: AxeAuditRule[] } })._audit.rules ?? []).map((rule) => [
    rule.id,
    rule.impact,
  ]),
);

function buildCatalog(): Map<string, RuleInfo> {
  const catalog = new Map<string, RuleInfo>();
  for (const rule of axe.getRules(STANDARD_TAGS.wcag22aa)) {
    const content = RULE_CONTENT[rule.ruleId];
    const impact = auditImpacts.get(rule.ruleId) ?? 'moderate';
    catalog.set(rule.ruleId, {
      ruleId: rule.ruleId,
      title: content?.title ?? rule.help,
      description: content?.description ?? rule.description,
      whoIsAffected: (content?.affects ?? []).map((a) => AUDIENCE_LABELS[a]),
      audiences: content?.affects ?? [],
      wcagCriteria: wcagCriteriaFromTags(rule.tags),
      wcagLevel: wcagLevelFromTags(rule.tags),
      defaultImpact: impact,
      weight: IMPACT_WEIGHT[impact],
      helpUrl: rule.helpUrl.replace(/\?application=.*$/, ''),
      axeVersion: AXE_VERSION,
    });
  }
  return catalog;
}

export const RULE_CATALOG: ReadonlyMap<string, RuleInfo> = buildCatalog();

/** Rule info, with a safe fallback for rules outside our tags (e.g. from `incomplete`). */
export function ruleInfo(ruleId: string, impact?: Impact | null): RuleInfo {
  const known = RULE_CATALOG.get(ruleId);
  if (known) return known;
  const fallbackImpact = impact ?? 'moderate';
  return {
    ruleId,
    title: ruleId,
    description: '',
    whoIsAffected: [],
    audiences: [],
    wcagCriteria: [],
    wcagLevel: 'A',
    defaultImpact: fallbackImpact,
    weight: IMPACT_WEIGHT[fallbackImpact],
    helpUrl: `https://dequeuniversity.com/rules/axe/${AXE_VERSION.split('.').slice(0, 2).join('.')}/${ruleId}`,
    axeVersion: AXE_VERSION,
  };
}
