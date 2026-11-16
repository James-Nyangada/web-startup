---
rule_id: aria-hidden-focus
platform: custom
slug: aria-hidden-focus
title: Don't hide focusable elements from screen readers
summary: Content with aria-hidden="true" must not contain links, buttons or fields that can still receive keyboard focus.
reviewed_at: 2026-11-16T00:00:00Z
---

# Don't hide focusable elements from screen readers

## What's wrong

When a closed menu, drawer or modal is hidden with `aria-hidden="true"` but its links and buttons can still be tabbed to, keyboard focus lands on things screen readers say aren't there.

## Who it affects

Screen reader users, who hear silence or confusing announcements, and keyboard users, who lose track of where focus is.

## How to fix on a custom-coded site

When you hide a panel, make its contents unfocusable too. The simplest way is the `hidden` attribute or `display: none`, which hides from everyone. For off-screen panels that must stay rendered, use the `inert` attribute, which removes focus and hides from screen readers in one step.

## Code example

### Incorrect
```html
<div class="cart-drawer" aria-hidden="true">
  <a href="/cart">View cart</a>
  <button>Checkout</button>
</div>
```

### Correct
```html
<!-- Closed: hidden from everyone, nothing focusable -->
<div class="cart-drawer" hidden>...</div>

<!-- Or, if it must stay in the layout for an animation -->
<div class="cart-drawer" inert>
  <a href="/cart">View cart</a>
  <button>Checkout</button>
</div>
```

### React / Next.js (JSX)
```jsx
// React 19 accepts inert as a boolean
<div className="cart-drawer" inert={!open}>
  <a href="/cart">View cart</a>
  <button type="button">Checkout</button>
</div>
```

### Vue
```vue
<template>
  <div class="cart-drawer" :inert="!open">
    <a href="/cart">View cart</a>
    <button type="button">Checkout</button>
  </div>
</template>
```

## How to check your fix

With the panel closed, press Tab through the whole page: focus should never disappear into hidden content. Then rescan with EveryVisitor.
