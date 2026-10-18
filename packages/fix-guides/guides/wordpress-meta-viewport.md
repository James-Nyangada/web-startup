---
rule_id: meta-viewport
platform: wordpress
title: Enable zooming and scaling on mobile viewports in WordPress
summary: Do not disable user zooming with `user-scalable=no` or `maximum-scale=1.0`.
reviewed_at: 2026-10-15T00:00:00Z
---

# Enable zooming and scaling on mobile viewports in WordPress

## What's wrong

Disabling pinch-to-zoom on mobile devices prevents customers with low vision from reading product details.

## Who it affects

Users with low vision who rely on browser zoom cannot enlarge text or photos.

## How to fix on WordPress

In `header.php`, ensure the viewport meta tag does not contain `user-scalable=no` or `maximum-scale=1`.

## Code example

### Incorrect
```php
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=0">
```

### Correct
```php
<meta name="viewport" content="width=device-width, initial-scale=1">
```

## How to check your fix

Open the storefront on a mobile device and pinch to zoom in. Verify the page enlarges smoothly.
