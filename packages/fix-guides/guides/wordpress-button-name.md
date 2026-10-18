---
rule_id: button-name
platform: wordpress
title: Provide discernible accessible names for buttons in WordPress
summary: Buttons containing only icons or empty labels leave screen reader users with no indication of their action.
reviewed_at: 2026-10-15T00:00:00Z
---

# Provide discernible accessible names for buttons in WordPress

## What's wrong

Buttons without text content or accessible labels (such as search triggers, drawer cart toggles, and modal close buttons) are announced simply as 'button'.

## Who it affects

Screen reader users cannot determine what the button will do. Voice control users cannot click the button by saying its visible name.

## How to fix on WordPress

In WordPress theme templates, wrap icon buttons with a `<span class="screen-reader-text"><?php esc_html_e( 'Search', 'textdomain' ); ?></span>` element or use `aria-label="<?php esc_attr_e( 'Close modal', 'textdomain' ); ?>"`.

## Code example

### Incorrect
```php
<button type="submit" class="search-submit">
  <i class="icon-search"></i>
</button>
```

### Correct
```php
<button type="submit" class="search-submit" aria-label="<?php esc_attr_e( 'Search site', 'textdomain' ); ?>">
  <i class="icon-search" aria-hidden="true"></i>
  <span class="screen-reader-text"><?php esc_html_e( 'Search site', 'textdomain' ); ?></span>
</button>
```

## How to check your fix

Navigate the page using the Tab key with VoiceOver or NVDA active. Ensure that every interactive button announces a clear action like 'Close cart drawer' or 'Submit search'.
