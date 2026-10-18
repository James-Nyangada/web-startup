---
rule_id: bypass
platform: shopify
title: Add a skip to content link in Shopify themes
summary: Provide a skip link as the very first focusable element so keyboard users can bypass repetitive navigation.
reviewed_at: 2026-10-15T00:00:00Z
---

# Add a skip to content link in Shopify themes

## What's wrong

Without a skip link, keyboard users must press Tab dozens of times across header menus before reaching the page content.

## Who it affects

People with motor disabilities or repetitive strain injury navigating via keyboard or switch controls.

## How to fix on Shopify

Place `<a href="#MainContent" class="skip-to-content-link visually-hidden-focusable">Skip to content</a>` at the top of `layout/theme.liquid`.

## Code example

### Incorrect
```liquid
<!-- No skip link before header -->
<header class="header">...</header>
<main id="MainContent">...</main>
```

### Correct
```liquid
<a href="#MainContent" class="skip-to-content-link visually-hidden-focusable">
  {{ 'accessibility.skip_to_text' | t }}
</a>
<header class="header">...</header>
<main id="MainContent" tabindex="-1">...</main>
```

## How to check your fix

Reload the page and press the Tab key once. The 'Skip to content' link must become visible with a clear focus ring, and pressing Enter must move focus directly to the main element.
