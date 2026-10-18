---
rule_id: input-image-alt
platform: shopify
title: Add alt text to image submit buttons in Shopify
summary: Inputs with `type="image"` function as submit buttons and require descriptive `alt` text.
reviewed_at: 2026-10-15T00:00:00Z
---

# Add alt text to image submit buttons in Shopify

## What's wrong

An `<input type="image">` missing `alt` text has no accessible name for screen readers.

## Who it affects

Screen reader users cannot identify the button's action and hear only 'Image button, unlabelled'.

## How to fix on Shopify

Add `alt="{{ 'general.search.submit' | t }}"` to any image input buttons.

## Code example

### Incorrect
```liquid
<input type="image" src="{{ 'search-icon.png' | asset_url }}">
```

### Correct
```liquid
<input type="image" src="{{ 'search-icon.png' | asset_url }}" alt="{{ 'general.search.submit' | t }}">
```

## How to check your fix

Inspect `<input type="image">` elements and confirm `alt` attribute is non-empty and descriptive.
