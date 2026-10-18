---
rule_id: select-name
platform: wordpress
title: Provide accessible names for select dropdowns in WordPress
summary: Every `<select>` element must have an associated `<label>` or `aria-label`.
reviewed_at: 2026-10-15T00:00:00Z
---

# Provide accessible names for select dropdowns in WordPress

## What's wrong

Variant pickers, quantity dropdowns, and currency selectors without labels leave users unaware of what is being chosen.

## Who it affects

Screen reader users hear 'Combo box, unlabelled' without knowing if they are choosing size, color, or shipping.

## How to fix on WordPress

Ensure WooCommerce variant select dropdowns have explicit `<label for="...">` tags.

## Code example

### Incorrect
```php
<select name="quantity">
  <option value="1">1</option>
</select>
```

### Correct
```php
<label for="cart-quantity-<?php echo esc_attr( $cart_item_key ); ?>" class="screen-reader-text">
  <?php esc_html_e( 'Quantity', 'woocommerce' ); ?>
</label>
<select id="cart-quantity-<?php echo esc_attr( $cart_item_key ); ?>" name="quantity">
  <option value="1">1</option>
</select>
```

## How to check your fix

Tab to the `<select>` dropdown using a screen reader. Confirm it announces the field name clearly (e.g. 'Size, combo box').
