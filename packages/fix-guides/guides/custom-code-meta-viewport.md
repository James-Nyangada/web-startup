---
rule_id: meta-viewport
platform: custom
slug: meta-viewport
title: Allow people to zoom on mobile
summary: The viewport meta tag must not block pinch-zoom with user-scalable=no or a low maximum-scale.
reviewed_at: 2026-11-16T00:00:00Z
---

# Allow people to zoom on mobile

## What's wrong

`user-scalable=no` or `maximum-scale=1` in the viewport meta tag stops people from zooming in on phones and tablets.

## Who it affects

People with low vision who need to zoom to read prices, product details and form labels.

## How to fix on a custom-coded site

Remove `user-scalable=no` and `maximum-scale` (or set it to at least 5) from the viewport meta tag. If you blocked zoom to stop iOS zooming into form fields, set form inputs to at least 16px font size instead.

## Code example

### Incorrect
```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
```

### Correct
```html
<meta name="viewport" content="width=device-width, initial-scale=1">
```

### CSS
```css
/* Stops iOS auto-zooming into fields without blocking zoom */
input, select, textarea { font-size: 16px; }
```

### React / Next.js (JSX)
```jsx
// Next.js App Router: app/layout.tsx. Don't set maximumScale or userScalable.
export const viewport = { width: "device-width", initialScale: 1 };
```

### Vue
```vue
// Nuxt: nuxt.config.ts
export default defineNuxtConfig({
  app: { head: { viewport: "width=device-width, initial-scale=1" } },
});
```

## How to check your fix

Open the page on a phone, or use device emulation in DevTools, and pinch to zoom: the page should enlarge. Then rescan with EveryVisitor.
