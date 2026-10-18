---
rule_id: aria-required-attr
platform: wordpress
title: Include all required ARIA attributes for custom widgets in WordPress
summary: Elements using custom ARIA roles (e.g. `checkbox`, `combobox`, `slider`) must include all mandatory attributes.
reviewed_at: 2026-10-15T00:00:00Z
---

# Include all required ARIA attributes for custom widgets in WordPress

## What's wrong

Omitting required attributes like `aria-checked` on `role="checkbox"` causes assistive technologies to malfunction.

## Who it affects

Screen reader users cannot tell whether a filter is selected or what range a slider represents.

## How to fix on WordPress

Verify theme tab scripts or accordions output required attributes like `aria-selected` and `aria-controls`.

## Code example

### Incorrect
```php
<div role="slider" class="price-slider"></div>
```

### Correct
```php
<div
  role="slider"
  aria-valuemin="0"
  aria-valuemax="1000"
  aria-valuenow="<?php echo esc_attr( $current_price ); ?>"
  tabindex="0"
  class="price-slider"
></div>
```

## How to check your fix

Validate custom controls with axe DevTools to confirm all required ARIA attributes are present and dynamically updated.
