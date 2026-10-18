---
rule_id: aria-roles
platform: wordpress
title: Use valid WAI-ARIA role values in WordPress themes
summary: The `role` attribute must contain a valid, non-deprecated WAI-ARIA role string.
reviewed_at: 2026-10-15T00:00:00Z
---

# Use valid WAI-ARIA role values in WordPress themes

## What's wrong

Misspelled roles like `role="btn"` or `role="nav"` are ignored by assistive tools.

## Who it affects

Screen readers treat the element as generic text or a generic container, discarding accessibility semantics.

## How to fix on WordPress

Update theme template files and block attributes to use valid ARIA role specifications.

## Code example

### Incorrect
```php
<nav role="navigation-bar">...</nav>
```

### Correct
```php
<nav aria-label="<?php esc_attr_e( 'Main Menu', 'textdomain' ); ?>">...</nav>
```

## How to check your fix

Inspect elements with `role` attributes in DevTools. Check against the W3C WAI-ARIA Roles specification.
