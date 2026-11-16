import { describe, it, expect } from 'vitest';
import {
  loadAllFixGuides,
  getFixGuide,
  getFixGuideBySlug,
  validateFixGuideContent,
  REQUIRED_SECTIONS,
} from '../../src/fix-guides/loader.js';
import { composeGuideBody, parseGuideSections } from '../../src/lib/guide-markdown.js';

describe('Fix Guide Pipeline: 25 rules × Shopify, WordPress, Custom code (P3-05)', () => {
  const guides = loadAllFixGuides();

  it('loads 75 guides: the same 25 rules for Shopify, WordPress and Custom code', () => {
    expect(guides).toHaveLength(75);

    const rulesFor = (platform: string) =>
      new Set(guides.filter((g) => g.platform === platform).map((g) => g.ruleId));
    const shopifyRules = rulesFor('shopify');

    expect(shopifyRules.size).toBe(25);
    expect(rulesFor('wordpress')).toEqual(shopifyRules);
    expect(rulesFor('custom')).toEqual(shopifyRules);
    expect(guides.filter((g) => g.platform === 'custom')).toHaveLength(25);
  });

  it('validates that every guide has complete front matter and valid reviewed_at timestamp', () => {
    for (const guide of guides) {
      expect(guide.ruleId, `ruleId in ${guide.slug}`).toBeTruthy();
      expect(['shopify', 'wordpress', 'custom']).toContain(guide.platform);
      expect(guide.title.length, `title in ${guide.slug}`).toBeGreaterThan(10);
      expect(guide.summary.length, `summary in ${guide.slug}`).toBeGreaterThan(15);
      expect(isNaN(Date.parse(guide.reviewedAt)), `reviewedAt in ${guide.slug}`).toBe(false);
      // Custom code guides live at /fix/custom-code/<rule>, so their slug is the bare rule id.
      expect(guide.slug).toBe(
        guide.platform === 'custom' ? guide.ruleId : `${guide.platform}-${guide.ruleId}`,
      );
    }
    expect(new Set(guides.map((g) => g.slug)).size).toBe(guides.length);
  });

  it('gives every Custom code guide the fix in HTML plus React and Vue examples', () => {
    for (const guide of guides.filter((g) => g.platform === 'custom')) {
      const sections = parseGuideSections(guide.bodyMd);
      expect(sections.codeExample?.language, guide.slug).toBe('html');
      expect(sections.codeExample?.correct, guide.slug).toBeTruthy();
      const labels = (sections.extraExamples ?? []).map((x) => x.label);
      expect(labels, guide.slug).toContain('React / Next.js (JSX)');
      expect(labels, guide.slug).toContain('Vue');
      expect(sections.howToCheck, guide.slug).toMatch(/EveryVisitor/);
    }
  });

  it('keeps framework examples when a guide is split into sections and rebuilt', () => {
    const guide = getFixGuide('custom', 'color-contrast')!;
    const sections = parseGuideSections(guide.bodyMd);
    expect(sections.extraExamples?.map((x) => x.label)).toEqual([
      'CSS',
      'React / Next.js (JSX)',
      'Vue',
    ]);
    const rebuilt = composeGuideBody(guide.title, 'custom', sections);
    expect(rebuilt).toContain('## How to fix on a custom-coded site');
    expect(parseGuideSections(rebuilt)).toEqual(sections);
  });

  it('validates that every guide has all 5 required markdown sections', () => {
    for (const guide of guides) {
      for (const section of REQUIRED_SECTIONS) {
        expect(
          guide.bodyMd.includes(section),
          `Guide ${guide.slug} missing required section '${section}'`,
        ).toBe(true);
      }

      // Check for code examples with code fence
      expect(guide.bodyMd).toContain('```');
      expect(guide.bodyMd).toContain('## Code example');
      expect(guide.bodyMd).toContain('## How to check your fix');
    }
  });

  it('retrieves guides by platform and ruleId', () => {
    const shopifyImgAlt = getFixGuide('shopify', 'image-alt');
    expect(shopifyImgAlt).toBeDefined();
    expect(shopifyImgAlt?.title).toContain('Shopify');
    expect(shopifyImgAlt?.slug).toBe('shopify-image-alt');
    expect(shopifyImgAlt?.bodyMd).toContain('image_tag');

    const wpButtonName = getFixGuide('wordpress', 'button-name');
    expect(wpButtonName).toBeDefined();
    expect(wpButtonName?.title).toContain('WordPress');
    expect(wpButtonName?.slug).toBe('wordpress-button-name');
    expect(wpButtonName?.bodyMd).toContain('screen-reader-text');
  });

  it('retrieves guides by unique slug', () => {
    const guide = getFixGuideBySlug('shopify-color-contrast');
    expect(guide).toBeDefined();
    expect(guide?.ruleId).toBe('color-contrast');
    expect(guide?.platform).toBe('shopify');
  });

  it('fails validation when required front matter is missing', () => {
    const invalid = `---
rule_id: image-alt
title: Missing platform and summary
---
## What's wrong
Content
## Who it affects
Content
## How to fix on Shopify
Content
## Code example
\`\`\`liquid
<div></div>
\`\`\`
## How to check your fix
Check
`;
    const errors = validateFixGuideContent(invalid, 'invalid.md');
    expect(errors.length).toBeGreaterThan(0);
    const msgs = errors.map((e) => e.message).join(' ');
    expect(msgs).toContain('platform');
    expect(msgs).toContain('summary');
    expect(msgs).toContain('reviewed_at');
  });

  it('fails validation when a required section is omitted', () => {
    const missingSection = `---
rule_id: image-alt
platform: shopify
title: Test Title
summary: Test Summary
reviewed_at: 2026-10-15T00:00:00Z
---
## What's wrong
Content
## Who it affects
Content
## Code example
\`\`\`liquid
<div></div>
\`\`\`
## How to check your fix
Check
`;
    const errors = validateFixGuideContent(missingSection, 'missing-section.md');
    expect(errors.length).toBe(1);
    expect(errors[0]?.message).toContain("Missing required section heading: '## How to fix on'");
  });
});
