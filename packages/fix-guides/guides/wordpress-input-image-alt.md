---
rule_id: input-image-alt
platform: wordpress
title: Add alt text to image submit buttons in WordPress
summary: Inputs with `type="image"` function as submit buttons and require descriptive `alt` text.
reviewed_at: 2026-10-15T00:00:00Z
---

# Add alt text to image submit buttons in WordPress

## What's wrong

An `<input type="image">` missing `alt` text has no accessible name for screen readers.

## Who it affects

Screen reader users cannot identify the button's action and hear only 'Image button, unlabelled'.

## How to fix on WordPress

Add `alt="<?php esc_attr_e( 'Submit', 'textdomain' ); ?>"` to image buttons.

## Code example

### Incorrect
```php
<input type="image" src="<?php echo esc_url( $btn_img ); ?>">
```

### Correct
```php
<input type="image" src="<?php echo esc_url( $btn_img ); ?>" alt="<?php esc_attr_e( 'Search products', 'textdomain' ); ?>">
```

## How to check your fix

Inspect `<input type="image">` elements and confirm `alt` attribute is non-empty and descriptive.
