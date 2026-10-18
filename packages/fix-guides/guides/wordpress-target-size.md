---
rule_id: target-size
platform: wordpress
title: Ensure interactive touch targets meet minimum 24px size in WordPress
summary: Interactive targets like buttons, links, and pagination swatches must measure at least 24×24px (WCAG 2.2 Level AA).
reviewed_at: 2026-10-15T00:00:00Z
---

# Ensure interactive touch targets meet minimum 24px size in WordPress

## What's wrong

Tiny close buttons, swatch dots, or footer links packed together trigger accidental clicks.

## Who it affects

People with motor tremors, limited dexterity, or anyone using a mobile touchscreen.

## How to fix on WordPress

Add padding and minimum dimensions to theme buttons, category pills, and social icon links.

## Code example

### Incorrect
```css
.pagination a {
  padding: 2px 4px;
  font-size: 12px;
}
```

### Correct
```css
.pagination a {
  min-width: 40px;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
}
```

## How to check your fix

Inspect interactive elements in DevTools or turn on mobile emulation. Confirm target dimensions are at least 24×24px (recommended 44×44px).
