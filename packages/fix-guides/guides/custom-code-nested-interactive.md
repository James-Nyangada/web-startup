---
rule_id: nested-interactive
platform: custom
slug: nested-interactive
title: Don't put buttons or links inside other buttons or links
summary: Interactive elements nested inside each other can't be reached or announced properly.
reviewed_at: 2026-11-16T00:00:00Z
---

# Don't put buttons or links inside other buttons or links

## What's wrong

A product card wrapped in one big link that also contains an "Add to cart" button, or a button inside a button, confuses screen readers and keyboard focus: the inner control may be skipped or announced as part of the outer one.

## Who it affects

Screen reader users and keyboard users, who may be unable to reach the inner control at all.

## How to fix on a custom-coded site

Keep interactive elements side by side, never nested. For clickable cards, make the title the only link and stretch its click area over the card with CSS, so the card still works with a mouse while the button remains a separate control.

## Code example

### Incorrect
```html
<a href="/products/oak-chair" class="card">
  <img src="/oak-chair.jpg" alt="">
  <h3>Oak dining chair</h3>
  <button>Add to cart</button>
</a>
```

### Correct
```html
<div class="card">
  <img src="/oak-chair.jpg" alt="">
  <h3><a href="/products/oak-chair" class="card-link">Oak dining chair</a></h3>
  <button type="button" class="card-action">Add to cart</button>
</div>
```

### CSS
```css
/* Whole card clickable, without nesting the button inside the link */
.card { position: relative; }
.card-link::after {
  content: "";
  position: absolute;
  inset: 0;
}
.card-action {
  position: relative; /* sits above the stretched link */
  z-index: 1;
}
```

### React / Next.js (JSX)
```jsx
<div className="card">
  <img src={p.image} alt="" />
  <h3><Link href={`/products/${p.slug}`} className="card-link">{p.name}</Link></h3>
  <button type="button" className="card-action" onClick={() => addToCart(p.id)}>
    Add to cart
  </button>
</div>
```

### Vue
```vue
<template>
  <div class="card">
    <img :src="p.image" alt="" />
    <h3><RouterLink :to="`/products/${p.slug}`" class="card-link">{{ p.name }}</RouterLink></h3>
    <button type="button" class="card-action" @click="addToCart(p.id)">Add to cart</button>
  </div>
</template>
```

## How to check your fix

Tab through the card: the link and the button should each receive focus separately and be announced on their own. Then rescan with EveryVisitor.
