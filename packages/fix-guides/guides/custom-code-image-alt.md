---
rule_id: image-alt
platform: custom
slug: image-alt
title: Add descriptive alt text to images in your code
summary: Every meaningful image needs an alt attribute that says what it shows; decorative images need an empty one.
reviewed_at: 2026-11-16T00:00:00Z
---

# Add descriptive alt text to images in your code

## What's wrong

An `<img>` without an `alt` attribute makes screen readers fall back to reading the file name, such as "IMG_4821.jpg", or skip the image without saying what it showed.

## Who it affects

People who are blind or have low vision and use a screen reader, and anyone on a slow connection where images fail to load.

## How to fix on a custom-coded site

Add an `alt` attribute to every `<img>`. Describe what the image shows and why it matters on the page: for a product photo, name the product and the variant shown. If the image is only decoration, use `alt=""` so screen readers skip it. In components, make `alt` a required prop so it can't be forgotten, and pass the text from your content or product data.

## Code example

### Incorrect
```html
<img src="/images/oak-chair.jpg">
<img src="/images/divider-swirl.svg">
```

### Correct
```html
<img src="/images/oak-chair.jpg" alt="Oak dining chair in natural finish, side view">
<!-- Decorative: empty alt so screen readers skip it -->
<img src="/images/divider-swirl.svg" alt="">
```

### React / Next.js (JSX)
```jsx
import Image from "next/image";

// Make alt required, so every caller has to decide what it should say.
export function ProductImage({ product }) {
  return (
    <Image
      src={product.image.url}
      alt={product.image.alt || `${product.name}, ${product.variantName}`}
      width={600}
      height={600}
    />
  );
}

// Decorative image
<img src="/images/divider-swirl.svg" alt="" />
```

### Vue
```vue
<template>
  <img :src="product.image.url" :alt="product.image.alt || product.name" />
  <!-- Decorative -->
  <img src="/images/divider-swirl.svg" alt="" />
</template>
```

## How to check your fix

Turn on a screen reader (VoiceOver on Mac with Cmd+F5, NVDA on Windows) and move through the page: each image should be announced with a useful description, and decorative images should be skipped. Then run a new EveryVisitor scan to confirm the problem is gone.
