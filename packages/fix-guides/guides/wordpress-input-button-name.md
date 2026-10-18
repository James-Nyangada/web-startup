---
rule_id: input-button-name
platform: wordpress
title: Ensure input buttons have discernible text values in WordPress
summary: Inputs with `type="button"`, `type="submit"`, or `type="reset"` must have a non-empty `value` attribute.
reviewed_at: 2026-10-15T00:00:00Z
---

# Ensure input buttons have discernible text values in WordPress

## What's wrong

An input button with empty `value=""` has no readable label for assistive technologies.

## Who it affects

Screen reader users cannot tell what action submitting the form will trigger.

## How to fix on WordPress

Provide a translated `value="<?php esc_attr_e( 'Place order', 'woocommerce' ); ?>"`.

## Code example

### Incorrect
```php
<input type="submit" value="">
```

### Correct
```php
<input type="submit" value="<?php esc_attr_e( 'Apply coupon', 'woocommerce' ); ?>" class="button">
```

## How to check your fix

Verify `value` attribute is non-empty and describes the submission result.
