---
rule_id: link-name
platform: shopify
title: Ensure all links have discernible accessible text in Shopify
summary: Links must contain descriptive text so users know where following the link will lead.
reviewed_at: 2026-10-15T00:00:00Z
---

# Ensure all links have discernible accessible text in Shopify

## What's wrong

Links that wrap only SVG icons, background images, or generic phrases like 'Click here' fail to communicate their destination.

## Who it affects

Screen reader users who navigate by pulling up a links list hear ambiguous entries like 'link, icon' or repetitive URLs.

## How to fix on Shopify

Add descriptive text inside the `<a>` tag using visually hidden text or an `aria-label`. For product cards, ensure the link specifies the product title and variant.

## Code example

### Incorrect
```liquid
<a href="{{ settings.social_instagram_link }}">
  {% render 'icon-instagram' %}
</a>
```

### Correct
```liquid
<a href="{{ settings.social_instagram_link }}" class="social-link" aria-label="Follow us on Instagram">
  {% render 'icon-instagram' %}
  <span class="visually-hidden">Follow us on Instagram (opens in new tab)</span>
</a>
```

## How to check your fix

Open browser accessibility tree or VoiceOver links list (VO + U > Links) and verify every link has a meaningful, unique name explaining its destination.
