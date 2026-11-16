---
rule_id: color-contrast
platform: custom
slug: color-contrast
title: Make text contrast strong enough to read
summary: Normal text needs a contrast ratio of at least 4.5:1 against its background; large text at least 3:1.
reviewed_at: 2026-11-16T00:00:00Z
---

# Make text contrast strong enough to read

## What's wrong

Light grey text on white, white text on pale buttons, or text over photos without an overlay falls below the WCAG contrast ratio, so it's hard or impossible to read.

## Who it affects

People with low vision or colour vision deficiency, older visitors, and anyone reading a phone in bright sunlight.

## How to fix on a custom-coded site

Change the text colour or the background so normal text reaches at least 4.5:1, and large text (24px, or 18.5px bold) at least 3:1. Fix it once in your design tokens or CSS variables rather than per element. For text over images, add a solid or semi-transparent background behind the text.

## Code example

### Incorrect
```html
<p class="price-note">Free delivery over $50</p>
<style>
  .price-note { color: #a3a3a3; background: #ffffff; } /* 2.5:1 */
</style>
```

### Correct
```html
<p class="price-note">Free delivery over $50</p>
<style>
  .price-note { color: #595959; background: #ffffff; } /* 7:1 */
</style>
```

### CSS
```css
/* Fix it at the source: tokens used everywhere */
:root {
  --text-muted: #595959;     /* 7:1 on white (was #a3a3a3, 2.5:1) */
  --button-bg: #0f5f5f;      /* white text on this is 7.4:1 */
}

/* Text over a photo: give it a backing */
.hero-caption {
  color: #ffffff;
  background: rgb(0 0 0 / 0.65);
  padding: 0.5rem 0.75rem;
}
```

### React / Next.js (JSX)
```jsx
// With Tailwind, pick classes that meet 4.5:1, e.g. text-neutral-600 on white
<p className="text-neutral-600">Free delivery over $50</p>
```

### Vue
```vue
<template>
  <p class="price-note">Free delivery over $50</p>
</template>

<style scoped>
.price-note { color: var(--text-muted); }
</style>
```

## How to check your fix

In Chrome DevTools, inspect the text and open the colour picker: it shows the contrast ratio with a pass or fail mark. Check hover, focus and disabled states too. Then rescan with EveryVisitor.
