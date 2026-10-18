---
rule_id: image-alt
platform: shopify
title: Add descriptive alt text to images in Shopify
summary: Every product and theme image needs meaningful alternative text so screen reader users know what is displayed.
reviewed_at: 2026-10-15T00:00:00Z
---

# Add descriptive alt text to images in Shopify

## What's wrong

Images rendered without an `alt` attribute or with missing descriptions prevent screen readers from announcing what the image portrays.

## Who it affects

People who are blind or have low vision and use screen readers cannot tell what products or graphics look like. Users on low-bandwidth connections where images fail to load also rely on alt text.

## How to fix on Shopify

In Shopify, make sure every Liquid `image_tag` includes an `alt` parameter using `image.alt | escape`. For product media uploaded in the admin, fill in the 'Alt text' field under Products > Media. If an image is purely decorative, explicitly set `alt: ''`.

## Code example

### Incorrect
```liquid
<img src="{{ product.featured_image | image_url: width: 600 }}">
```

### Correct
```liquid
{{ product.featured_image | image_url: width: 600 | image_tag: alt: product.featured_image.alt, class: 'product-card__image' }}
```
For decorative background badges:
```liquid
<img src="{{ 'badge-glow.svg' | asset_url }}" alt="" role="presentation">
```

## How to check your fix

Inspect the rendered HTML in Chrome DevTools to confirm every `<img>` has an `alt` attribute. Run an axe-core or screen reader check and verify decorative images have `alt=""` while informative images have clear, concise descriptions.
