---
rule_id: label
platform: wordpress
title: Associate form inputs with accessible labels in WordPress
summary: Form inputs must have a programmatic `<label>` element connected via `for` and `id` attributes.
reviewed_at: 2026-10-15T00:00:00Z
---

# Associate form inputs with accessible labels in WordPress

## What's wrong

Inputs that rely exclusively on `placeholder` attributes lose their label once a user begins typing, leaving screen readers disoriented.

## Who it affects

Screen reader users, people with cognitive impairments, and speech-input users cannot reliably fill out newsletter, contact, or checkout forms.

## How to fix on WordPress

Ensure all form inputs in theme search forms, comment sections, or form plugins have a matching `<label for="field-id">` paired with `<input id="field-id">`.

## Code example

### Incorrect
```php
<input type="search" class="search-field" name="s" placeholder="Search products...">
```

### Correct
```php
<label for="search-field-<?php echo esc_attr( uniqid() ); ?>" class="screen-reader-text">
  <?php esc_html_e( 'Search products', 'textdomain' ); ?>
</label>
<input
  id="search-field-<?php echo esc_attr( uniqid() ); ?>"
  type="search"
  class="search-field"
  name="s"
  placeholder="<?php esc_attr_e( 'Search products...', 'textdomain' ); ?>"
>
```

## How to check your fix

Click directly on the text label. The browser should immediately move focus into the corresponding form field.
