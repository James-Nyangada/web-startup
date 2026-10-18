---
rule_id: button-name
platform: shopify
title: Provide discernible accessible names for buttons in Shopify
summary: Buttons containing only icons or empty labels leave screen reader users with no indication of their action.
reviewed_at: 2026-10-15T00:00:00Z
---

# Provide discernible accessible names for buttons in Shopify

## What's wrong

Buttons without text content or accessible labels (such as search triggers, drawer cart toggles, and modal close buttons) are announced simply as 'button'.

## Who it affects

Screen reader users cannot determine what the button will do. Voice control users cannot click the button by saying its visible name.

## How to fix on Shopify

Add an accessible label to icon-only buttons using `<span class="visually-hidden">{{ 'general.accessibility.close' | t }}</span>` or an `aria-label="{{ 'sections.header.cart' | t }}"` attribute.

## Code example

### Incorrect
```liquid
<button type="button" class="cart-drawer__close">
  {% render 'icon-close' %}
</button>
```

### Correct
```liquid
<button type="button" class="cart-drawer__close" aria-label="{{ 'general.accessibility.close' | t }}">
  {% render 'icon-close' %}
  <span class="visually-hidden">{{ 'general.accessibility.close' | t }}</span>
</button>
```

## How to check your fix

Navigate the page using the Tab key with VoiceOver or NVDA active. Ensure that every interactive button announces a clear action like 'Close cart drawer' or 'Submit search'.
