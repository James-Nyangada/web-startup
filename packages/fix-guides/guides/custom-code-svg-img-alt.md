---
rule_id: svg-img-alt
platform: custom
slug: svg-img-alt
title: Give meaningful SVG images a text alternative
summary: An SVG with role img needs an accessible name from aria-label or a title element.
reviewed_at: 2026-11-16T00:00:00Z
---

# Give meaningful SVG images a text alternative

## What's wrong

An inline `<svg role="img">` with no `aria-label` or `<title>` is announced as an unlabelled image, so ratings, payment logos and badges say nothing.

## Who it affects

Screen reader users, who miss information shown only in graphics, such as a 4-star rating.

## How to fix on a custom-coded site

For meaningful SVGs, add `role="img"` with an `aria-label`, or put a `<title>` as the SVG's first child and reference it with `aria-labelledby`. For purely decorative SVGs, use `aria-hidden="true"` instead.

## Code example

### Incorrect
```html
<svg role="img" class="rating" viewBox="0 0 100 20">...</svg>
```

### Correct
```html
<svg role="img" class="rating" viewBox="0 0 100 20" aria-labelledby="rating-title">
  <title id="rating-title">Rated 4 out of 5 stars</title>
  ...
</svg>

<!-- Decorative -->
<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">...</svg>
```

### React / Next.js (JSX)
```jsx
export function StarRating({ value }) {
  return (
    <svg role="img" aria-label={`Rated ${value} out of 5 stars`} viewBox="0 0 100 20">
      {/* stars */}
    </svg>
  );
}
```

### Vue
```vue
<template>
  <svg role="img" :aria-label="`Rated ${value} out of 5 stars`" viewBox="0 0 100 20">
    <!-- stars -->
  </svg>
</template>
```

## How to check your fix

Move through the page with a screen reader and confirm the graphic is announced with its meaning. Decorative SVGs should be skipped. Then rescan with EveryVisitor.
