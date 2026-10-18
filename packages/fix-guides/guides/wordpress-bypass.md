---
rule_id: bypass
platform: wordpress
title: Add a skip to content link in WordPress themes
summary: Provide a skip link as the very first focusable element so keyboard users can bypass repetitive navigation.
reviewed_at: 2026-10-15T00:00:00Z
---

# Add a skip to content link in WordPress themes

## What's wrong

Without a skip link, keyboard users must press Tab dozens of times across header menus before reaching the page content.

## Who it affects

People with motor disabilities or repetitive strain injury navigating via keyboard or switch controls.

## How to fix on WordPress

Add `<a class="skip-link screen-reader-text" href="#primary"><?php esc_html_e( 'Skip to content', 'textdomain' ); ?></a>` at the top of `header.php`.

## Code example

### Incorrect
```php
<!-- Direct header output -->
<?php get_header(); ?>
<main id="primary">...</main>
```

### Correct
```php
<a class="skip-link screen-reader-text" href="#primary">
  <?php esc_html_e( 'Skip to content', 'textdomain' ); ?>
</a>
<header class="site-header">...</header>
<main id="primary" tabindex="-1">...</main>
```

## How to check your fix

Reload the page and press the Tab key once. The 'Skip to content' link must become visible with a clear focus ring, and pressing Enter must move focus directly to the main element.
