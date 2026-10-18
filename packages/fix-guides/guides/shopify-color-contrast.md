---
rule_id: color-contrast
platform: shopify
title: Fix color contrast ratios for text in Shopify themes
summary: Text and interactive controls must have at least 4.5:1 contrast against their background (3:1 for large text).
reviewed_at: 2026-10-15T00:00:00Z
---

# Fix color contrast ratios for text in Shopify themes

## What's wrong

Light gray text, subtle subheadings, or low-contrast button states fail WCAG 1.4.3 minimum contrast requirements.

## Who it affects

People with low vision, color vision deficiency, and customers using devices in direct sunlight or dim environments cannot read critical store information.

## How to fix on Shopify

Adjust color tokens in `config/settings_schema.json` and CSS custom properties in `assets/base.css` to guarantee a 4.5:1 ratio for body text against backgrounds.

## Code example

### Incorrect
```css
.product-card__price {
  color: #999999; /* 2.8:1 on white - FAILS */
}
```

### Correct
```css
.product-card__price {
  color: #595959; /* 4.6:1 on white - PASSES WCAG AA */
}
```

## How to check your fix

Use Chrome DevTools color picker to inspect element contrast. Confirm the contrast badge displays a green checkmark indicating ≥ 4.5:1 ratio.
