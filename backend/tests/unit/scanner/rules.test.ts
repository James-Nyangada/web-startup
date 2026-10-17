import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import {
  AXE_VERSION,
  IMPACT_WEIGHT,
  RULE_CATALOG,
  ruleInfo,
  STANDARD_TAGS,
  wcagCriteriaFromTags,
  wcagLevelFromTags,
} from '../../../src/scanner/rules/catalog.js';
import { RULE_CONTENT } from '../../../src/scanner/rules/content.js';

describe('rule knowledge base (P1-11)', () => {
  const axeRules = axe.getRules(STANDARD_TAGS.wcag22aa).map((r) => r.ruleId);

  it('describes every rule axe can return under our tags', () => {
    const missing = axeRules.filter((id) => !RULE_CONTENT[id]);
    expect(missing, `Add plain-English content for: ${missing.join(', ')}`).toEqual([]);
  });

  it('has no content for rules axe no longer has', () => {
    const stale = Object.keys(RULE_CONTENT).filter((id) => !axeRules.includes(id));
    expect(stale).toEqual([]);
  });

  it('gives every rule a title, description, audience, WCAG criterion and weight', () => {
    for (const rule of RULE_CATALOG.values()) {
      expect(rule.title.length, rule.ruleId).toBeGreaterThan(10);
      expect(rule.description.length, rule.ruleId).toBeGreaterThan(30);
      expect(rule.whoIsAffected.length, rule.ruleId).toBeGreaterThan(0);
      expect(rule.wcagCriteria.length, rule.ruleId).toBeGreaterThan(0);
      expect(rule.weight).toBe(IMPACT_WEIGHT[rule.defaultImpact]);
      expect(rule.axeVersion).toBe(AXE_VERSION);
    }
  });

  it('uses plain language, never compliance claims', () => {
    const banned = /\b(compliant|ada-proof|lawsuit|100% accessible)\b/i;
    for (const content of Object.values(RULE_CONTENT)) {
      expect(`${content.title} ${content.description}`).not.toMatch(banned);
    }
  });

  it('pins axe-core', () => {
    expect(AXE_VERSION).toBe('4.14.0');
  });

  it('maps known rules correctly', () => {
    expect(ruleInfo('image-alt')).toMatchObject({
      wcagCriteria: ['1.1.1'],
      wcagLevel: 'A',
      defaultImpact: 'critical',
      weight: 10,
    });
    expect(ruleInfo('color-contrast')).toMatchObject({
      wcagCriteria: ['1.4.3'],
      wcagLevel: 'AA',
      weight: 6,
    });
    expect(ruleInfo('target-size').wcagCriteria).toEqual(['2.5.8']);
  });

  it('falls back safely for unknown rules', () => {
    expect(ruleInfo('made-up-rule', 'minor')).toMatchObject({ ruleId: 'made-up-rule', weight: 1 });
  });
});

describe('WCAG tag parsing', () => {
  it.each([
    [['wcag111'], ['1.1.1']],
    [
      ['wcag1410', 'wcag412'],
      ['1.4.10', '4.1.2'],
    ],
    [['wcag2a', 'cat.text', 'best-practice'], []],
  ])('%j → %j', (tags, expected) => {
    expect(wcagCriteriaFromTags(tags)).toEqual(expected);
  });

  it('derives the level', () => {
    expect(wcagLevelFromTags(['wcag2a', 'wcag111'])).toBe('A');
    expect(wcagLevelFromTags(['wcag2aa', 'wcag143'])).toBe('AA');
    expect(wcagLevelFromTags(['wcag22aa', 'wcag258'])).toBe('AA');
  });
});
