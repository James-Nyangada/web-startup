---
rule_id: nested-interactive
platform: shopify
title: Avoid nesting interactive controls within each other in Shopify
summary: Do not nest buttons, links, or inputs inside other clickable buttons or links.
reviewed_at: 2026-10-15T00:00:00Z
---

# Avoid nesting interactive controls within each other in Shopify

## What's wrong

Nesting a `<button>` inside an `<a>` tag creates invalid HTML and unpredictable keyboard/screen reader focus.

## Who it affects

Keyboard and screen reader users cannot activate the inner button, or clicking activates both actions simultaneously.

## How to fix on Shopify

Restructure the card so the anchor wraps only the product title or media, and the button sits as an adjacent sibling.

## Code example

### Incorrect
```liquid
<a href="{{ product.url }}" class="product-card">
  <h2>{{ product.title }}</h2>
  <button type="button" class="quick-add">Add to Cart</button>
</a>
```

### Correct
```liquid
<div class="product-card">
  <h2><a href="{{ product.url }}">{{ product.title }}</a></h2>
  <button type="button" class="quick-add">Add to Cart</button>
</div>
```

## How to check your fix

Run an axe audit or inspect the DOM to confirm no `<a>` tag contains another `<a>`, `<button>`, or `<input>`.
