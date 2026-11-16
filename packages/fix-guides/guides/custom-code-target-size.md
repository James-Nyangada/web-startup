---
rule_id: target-size
platform: custom
slug: target-size
title: Make buttons and links big enough to tap
summary: Interactive targets need to be at least 24×24 CSS pixels, or have enough space around them (WCAG 2.2 AA).
reviewed_at: 2026-11-16T00:00:00Z
---

# Make buttons and links big enough to tap

## What's wrong

Tiny close buttons, colour swatches, pagination numbers and icon links packed closely together are easy to miss and cause the wrong one to be tapped.

## Who it affects

People with tremors or limited dexterity, older visitors, and anyone using a phone one-handed.

## How to fix on a custom-coded site

Give every interactive element a minimum size of 24×24 CSS pixels (44×44 is better for main actions), using padding rather than shrinking the icon. If an element must stay small, leave enough space around it that a 24px circle centred on it doesn't overlap another target.

## Code example

### Incorrect
```html
<button class="close"><svg width="12" height="12" aria-hidden="true">...</svg></button>
<style>
  .close { padding: 0; }
</style>
```

### Correct
```html
<button class="close" aria-label="Close"><svg width="12" height="12" aria-hidden="true">...</svg></button>
<style>
  .close {
    min-width: 44px;
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
</style>
```

### CSS
```css
/* A safe default for small controls across the site */
button, [role="button"], .swatch, .pagination a {
  min-width: 24px;
  min-height: 24px;
}
.icon-button {
  min-width: 44px;
  min-height: 44px;
}
```

### React / Next.js (JSX)
```jsx
// Tailwind: size-11 is 44px
<button type="button" aria-label="Close" className="inline-grid size-11 place-items-center">
  <XIcon className="size-3" aria-hidden="true" />
</button>
```

### Vue
```vue
<template>
  <button type="button" aria-label="Close" class="icon-button">
    <XIcon aria-hidden="true" />
  </button>
</template>
```

## How to check your fix

In DevTools, hover over each small control and check its size in the box model. Try the page on a phone and tap each control. Then rescan with EveryVisitor.
