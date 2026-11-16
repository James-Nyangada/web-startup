---
rule_id: list
platform: custom
slug: list
title: Use only list items directly inside lists
summary: ul and ol elements may only contain li elements (and script or template) as direct children.
reviewed_at: 2026-11-16T00:00:00Z
---

# Use only list items directly inside lists

## What's wrong

A `<ul>` or `<ol>` with `<div>`, `<a>` or `<span>` directly inside breaks the list structure, so screen readers may not say how many items there are.

## Who it affects

Screen reader users, who use list counts to understand menus, product grids and filters.

## How to fix on a custom-coded site

Make every direct child of `<ul>` and `<ol>` an `<li>`. Move wrapper elements inside the `<li>`. Component loops are a common cause: make sure the component you repeat renders an `<li>`, not a `<div>`.

## Code example

### Incorrect
```html
<ul class="product-grid">
  <div class="card">...</div>
  <div class="card">...</div>
</ul>
```

### Correct
```html
<ul class="product-grid">
  <li class="card">...</li>
  <li class="card">...</li>
</ul>
```

### React / Next.js (JSX)
```jsx
<ul className="product-grid">
  {products.map((p) => (
    <li key={p.id} className="card">
      <ProductCard product={p} />
    </li>
  ))}
</ul>
```

### Vue
```vue
<template>
  <ul class="product-grid">
    <li v-for="p in products" :key="p.id" class="card">
      <ProductCard :product="p" />
    </li>
  </ul>
</template>
```

## How to check your fix

Inspect the list in DevTools and confirm every direct child is an `<li>`. With a screen reader, the list should be announced with its item count, such as "list, 12 items". Then rescan with EveryVisitor.
