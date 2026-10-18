---
rule_id: svg-img-alt
platform: wordpress
title: Provide accessible text for SVG images with role img in WordPress
summary: SVGs with `role="img"` must contain an accessible label or `<title>` element.
reviewed_at: 2026-10-15T00:00:00Z
---

# Provide accessible text for SVG images with role img in WordPress

## What's wrong

Screen readers announce an unlabelled SVG with `role="img"` as an empty graphic without context.

## Who it affects

Screen reader users miss branding, icons representing payment methods, or rating stars.

## How to fix on WordPress

Include a `<title>` tag inside inline SVG assets or specify `aria-label="Description"` on the SVG tag.

## Code example

### Incorrect
```php
<svg role="img" class="star-rating">...</svg>
```

### Correct
```php
<svg role="img" class="star-rating" aria-label="<?php echo esc_attr( sprintf( __( 'Rating: %s out of 5 stars', 'textdomain' ), $rating ) ); ?>">
  <path d="..."></path>
</svg>
```

## How to check your fix

Test with a screen reader to confirm the SVG announces the descriptive title rather than remaining silent.
