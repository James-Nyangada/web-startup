---
rule_id: duplicate-id-aria
platform: shopify
title: Ensure IDs referenced by ARIA attributes are unique in Shopify
summary: IDs targeted by `aria-labelledby`, `aria-describedby`, or `aria-controls` must be unique across the entire DOM.
reviewed_at: 2026-10-15T00:00:00Z
---

# Ensure IDs referenced by ARIA attributes are unique in Shopify

## What's wrong

When multiple elements share the same ID, assistive technology can only associate the very first matching node.

## Who it affects

Screen readers announce the wrong product name, price, or modal description.

## How to fix on Shopify

Append Liquid's `{{ section.id }}` or `{{ forloop.index }}` to generate unique IDs across repeating product cards.

## Code example

### Incorrect
```liquid
{% for product in collection.products %}
  <h3 id="product-title">{{ product.title }}</h3>
  <button aria-labelledby="product-title">Quick Add</button>
{% endfor %}
```

### Correct
```liquid
{% for product in collection.products %}
  <h3 id="product-title-{{ section.id }}-{{ product.id }}">{{ product.title }}</h3>
  <button aria-labelledby="product-title-{{ section.id }}-{{ product.id }}">Quick Add</button>
{% endfor %}
```

## How to check your fix

Inspect the page with DevTools Console using `document.querySelectorAll('[id="your-id"]')` to confirm no duplicates exist.
