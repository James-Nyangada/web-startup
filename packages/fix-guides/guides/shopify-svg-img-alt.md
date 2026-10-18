---
rule_id: svg-img-alt
platform: shopify
title: Provide accessible text for SVG images with role img in Shopify
summary: SVGs with `role="img"` must contain an accessible label or `<title>` element.
reviewed_at: 2026-10-15T00:00:00Z
---

# Provide accessible text for SVG images with role img in Shopify

## What's wrong

Screen readers announce an unlabelled SVG with `role="img"` as an empty graphic without context.

## Who it affects

Screen reader users miss branding, icons representing payment methods, or rating stars.

## How to fix on Shopify

Add `<title id="svg-title-{{ id }}">Label</title>` inside the SVG and reference it with `aria-labelledby="svg-title-{{ id }}"`.

## Code example

### Incorrect
```liquid
<svg role="img" viewBox="0 0 24 24">
  <path d="..."></path>
</svg>
```

### Correct
```liquid
<svg role="img" viewBox="0 0 24 24" aria-labelledby="store-logo-title">
  <title id="store-logo-title">{{ shop.name }} logo</title>
  <path d="..."></path>
</svg>
```

## How to check your fix

Test with a screen reader to confirm the SVG announces the descriptive title rather than remaining silent.
