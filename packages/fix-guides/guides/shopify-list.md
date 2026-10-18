---
rule_id: list
platform: shopify
title: Ensure ul and ol list containers only contain li elements in Shopify
summary: `<ul>` and `<ol>` tags must contain only `<li>` elements, `<script>`, or `<template>` tags.
reviewed_at: 2026-10-15T00:00:00Z
---

# Ensure ul and ol list containers only contain li elements in Shopify

## What's wrong

Placing `<div>` directly inside `<ul>` breaks list semantics and item numbering.

## Who it affects

Screen readers announce incorrect item counts or stop announcing list structure.

## How to fix on Shopify

Move wrapping containers inside the `<li>` tag in collection and navigation loops.

## Code example

### Incorrect
```liquid
<ul class="product-grid">
  <div class="grid-row">
    <li>Product 1</li>
  </div>
</ul>
```

### Correct
```liquid
<ul class="product-grid">
  <li class="product-grid__item">
    <div class="product-card">Product 1</div>
  </li>
</ul>
```

## How to check your fix

Validate HTML using W3C validator or DevTools to verify all direct children of `<ul>` and `<ol>` are `<li>` tags.
