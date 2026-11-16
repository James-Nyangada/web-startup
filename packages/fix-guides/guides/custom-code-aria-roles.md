---
rule_id: aria-roles
platform: custom
slug: aria-roles
title: Use valid ARIA role values
summary: The role attribute must contain a real WAI-ARIA role, such as button or navigation.
reviewed_at: 2026-11-16T00:00:00Z
---

# Use valid ARIA role values

## What's wrong

Misspelled or invented roles like `role="btn"`, `role="nav"` or `role="dropdown"` are ignored, so the element loses the meaning you meant to give it.

## Who it affects

Screen reader users, who hear the element as plain text or a generic container.

## How to fix on a custom-coded site

Replace invalid roles with real ones from the WAI-ARIA list, or remove the role and use the matching HTML element: `<button>` instead of `role="btn"`, `<nav>` instead of `role="nav"`.

## Code example

### Incorrect
```html
<div role="btn" class="add-to-cart">Add to cart</div>
<div role="nav">...</div>
```

### Correct
```html
<button type="button" class="add-to-cart">Add to cart</button>
<nav aria-label="Main">...</nav>
```

### React / Next.js (JSX)
```jsx
// Prefer native elements over role attributes
<button type="button" className="add-to-cart" onClick={addToCart}>Add to cart</button>
```

### Vue
```vue
<template>
  <button type="button" class="add-to-cart" @click="addToCart">Add to cart</button>
</template>
```

## How to check your fix

Search your code for `role=` and compare each value with the WAI-ARIA roles list. In DevTools' Accessibility pane, confirm the element shows the role you expect. Then rescan with EveryVisitor.
