---
rule_id: aria-allowed-attr
platform: wordpress
title: Use only permitted ARIA attributes on HTML elements in WordPress
summary: ARIA attributes must only be used on elements whose role supports them.
reviewed_at: 2026-10-15T00:00:00Z
---

# Use only permitted ARIA attributes on HTML elements in WordPress

## What's wrong

Using attributes like `aria-expanded` on `role="link"` or elements that do not support expansion creates conflicting semantics.

## Who it affects

Screen readers may ignore the attribute or report incorrect widget behavior to the user.

## How to fix on WordPress

Use `<button type="button" aria-expanded="false">` for dropdown menu triggers instead of anchor links.

## Code example

### Incorrect
```php
<span aria-expanded="false" class="dropdown-toggle">Categories</span>
```

### Correct
```php
<button type="button" aria-expanded="false" class="dropdown-toggle">
  <?php esc_html_e( 'Categories', 'textdomain' ); ?>
</button>
```

## How to check your fix

Run axe DevTools and verify that no 'aria-allowed-attr' violations are reported for interactive components.
