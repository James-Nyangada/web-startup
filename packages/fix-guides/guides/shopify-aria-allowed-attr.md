---
rule_id: aria-allowed-attr
platform: shopify
title: Use only permitted ARIA attributes on HTML elements in Shopify
summary: ARIA attributes must only be used on elements whose role supports them.
reviewed_at: 2026-10-15T00:00:00Z
---

# Use only permitted ARIA attributes on HTML elements in Shopify

## What's wrong

Using attributes like `aria-expanded` on `role="link"` or elements that do not support expansion creates conflicting semantics.

## Who it affects

Screen readers may ignore the attribute or report incorrect widget behavior to the user.

## How to fix on Shopify

Use native semantic elements like `<button>` instead of `<a>` for expandable menus and accordions.

## Code example

### Incorrect
```liquid
<a href="#" aria-expanded="false" class="accordion-trigger">Shipping Info</a>
```

### Correct
```liquid
<button type="button" aria-expanded="false" aria-controls="ShippingPanel" class="accordion-trigger">
  Shipping Info
</button>
```

## How to check your fix

Run axe DevTools and verify that no 'aria-allowed-attr' violations are reported for interactive components.
