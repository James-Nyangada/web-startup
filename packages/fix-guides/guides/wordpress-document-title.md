---
rule_id: document-title
platform: wordpress
title: Ensure every page has a descriptive document title in WordPress
summary: Every web page must have an informative `<title>` tag in the `<head>` explaining its specific purpose.
reviewed_at: 2026-10-15T00:00:00Z
---

# Ensure every page has a descriptive document title in WordPress

## What's wrong

Pages with missing, generic, or duplicate `<title>` elements leave users unaware of which section or product they are viewing.

## Who it affects

Screen reader users rely on the page title as the very first information announced when a new page loads. It also affects browser tab identification.

## How to fix on WordPress

Ensure `add_theme_support( 'title-tag' );` is registered in `functions.php` and avoid hardcoding static title strings in `header.php`.

## Code example

### Incorrect
```php
<head>
  <title>My WordPress Website</title>
</head>
```

### Correct
```php
// In functions.php
function theme_slug_setup() {
    add_theme_support( 'title-tag' );
}
add_action( 'after_setup_theme', 'theme_slug_setup' );

// In header.php
<head>
  <?php wp_head(); ?>
</head>
```

## How to check your fix

Look at the browser tab title on product, collection, and search pages. Verify that the title accurately identifies the specific page content.
