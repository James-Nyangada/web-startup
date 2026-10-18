---
rule_id: aria-required-attr
platform: shopify
title: Include all required ARIA attributes for custom widgets in Shopify
summary: Elements using custom ARIA roles (e.g. `checkbox`, `combobox`, `slider`) must include all mandatory attributes.
reviewed_at: 2026-10-15T00:00:00Z
---

# Include all required ARIA attributes for custom widgets in Shopify

## What's wrong

Omitting required attributes like `aria-checked` on `role="checkbox"` causes assistive technologies to malfunction.

## Who it affects

Screen reader users cannot tell whether a filter is selected or what range a slider represents.

## How to fix on Shopify

Ensure custom variant swatches or filter toggles initialize all required ARIA state attributes.

## Code example

### Incorrect
```liquid
<div role="checkbox" class="filter-checkbox">
  In stock
</div>
```

### Correct
```liquid
<div
  role="checkbox"
  aria-checked="{% if filter_value.active %}true{% else %}false{% endif %}"
  tabindex="0"
  class="filter-checkbox"
>
  {{ filter_value.label }}
</div>
```

## How to check your fix

Validate custom controls with axe DevTools to confirm all required ARIA attributes are present and dynamically updated.
