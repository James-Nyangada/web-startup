---
rule_id: target-size
platform: shopify
title: Ensure interactive touch targets meet minimum 24px size in Shopify
summary: Interactive targets like buttons, links, and pagination swatches must measure at least 24×24px (WCAG 2.2 Level AA).
reviewed_at: 2026-10-15T00:00:00Z
---

# Ensure interactive touch targets meet minimum 24px size in Shopify

## What's wrong

Tiny close buttons, swatch dots, or footer links packed together trigger accidental clicks.

## Who it affects

People with motor tremors, limited dexterity, or anyone using a mobile touchscreen.

## How to fix on Shopify

Set `min-width: 44px; min-height: 44px;` in theme CSS or use padding so the clickable area meets requirements.

## Code example

### Incorrect
```css
.color-swatch {
  width: 16px;
  height: 16px;
  margin: 2px;
}
```

### Correct
```css
.color-swatch {
  width: 28px;
  height: 28px;
  padding: 8px; /* Extends tap target to > 44px */
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

## How to check your fix

Inspect interactive elements in DevTools or turn on mobile emulation. Confirm target dimensions are at least 24×24px (recommended 44×44px).
