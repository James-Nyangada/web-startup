---
rule_id: select-name
platform: shopify
title: Provide accessible names for select dropdowns in Shopify
summary: Every `<select>` element must have an associated `<label>` or `aria-label`.
reviewed_at: 2026-10-15T00:00:00Z
---

# Provide accessible names for select dropdowns in Shopify

## What's wrong

Variant pickers, quantity dropdowns, and currency selectors without labels leave users unaware of what is being chosen.

## Who it affects

Screen reader users hear 'Combo box, unlabelled' without knowing if they are choosing size, color, or shipping.

## How to fix on Shopify

Add `<label for="Option-{{ section.id }}-{{ forloop.index0 }}">{{ option.name }}</label>`.

## Code example

### Incorrect
```liquid
<select name="id">
  {% for variant in product.variants %}
    <option value="{{ variant.id }}">{{ variant.title }}</option>
  {% endfor %}
</select>
```

### Correct
```liquid
<label for="ProductSelect-{{ section.id }}" class="visually-hidden">
  {{ 'products.product.select_variant' | t }}
</label>
<select id="ProductSelect-{{ section.id }}" name="id">
  {% for variant in product.variants %}
    <option value="{{ variant.id }}">{{ variant.title }}</option>
  {% endfor %}
</select>
```

## How to check your fix

Tab to the `<select>` dropdown using a screen reader. Confirm it announces the field name clearly (e.g. 'Size, combo box').
