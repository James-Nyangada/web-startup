import { describe, it, expect } from 'vitest';
import {
  loadAllFixGuides,
  getFixGuide,
  getFixGuideBySlug,
  validateFixGuideContent,
  REQUIRED_SECTIONS,
} from '../../src/fix-guides/loader.js';

describe('Fix Guide Pipeline and First 50 Guides (Chunk P3-05)', () => {
  const guides = loadAllFixGuides();

  it('loads exactly 50 guides across 25 rules and 2 platforms', () => {
    expect(guides).toHaveLength(50);

    const shopifyGuides = guides.filter((g) => g.platform === 'shopify');
    const wpGuides = guides.filter((g) => g.platform === 'wordpress');

    expect(shopifyGuides).toHaveLength(25);
    expect(wpGuides).toHaveLength(25);

    // Verify all unique rule IDs across both platforms
    const shopifyRules = new Set(shopifyGuides.map((g) => g.ruleId));
    const wpRules = new Set(wpGuides.map((g) => g.ruleId));

    expect(shopifyRules.size).toBe(25);
    expect(wpRules.size).toBe(25);
    expect(shopifyRules).toEqual(wpRules);
  });

  it('validates that every guide has complete front matter and valid reviewed_at timestamp', () => {
    for (const guide of guides) {
      expect(guide.ruleId, `ruleId in ${guide.slug}`).toBeTruthy();
      expect(['shopify', 'wordpress']).toContain(guide.platform);
      expect(guide.title.length, `title in ${guide.slug}`).toBeGreaterThan(10);
      expect(guide.summary.length, `summary in ${guide.slug}`).toBeGreaterThan(15);
      expect(isNaN(Date.parse(guide.reviewedAt)), `reviewedAt in ${guide.slug}`).toBe(false);
      expect(guide.slug).toBe(`${guide.platform}-${guide.ruleId}`);
    }
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
