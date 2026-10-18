---
rule_id: input-button-name
platform: shopify
title: Ensure input buttons have discernible text values in Shopify
summary: Inputs with `type="button"`, `type="submit"`, or `type="reset"` must have a non-empty `value` attribute.
reviewed_at: 2026-10-15T00:00:00Z
---

# Ensure input buttons have discernible text values in Shopify

## What's wrong

An input button with empty `value=""` has no readable label for assistive technologies.

## Who it affects

Screen reader users cannot tell what action submitting the form will trigger.

## How to fix on Shopify

Provide a descriptive `value="{{ 'sections.cart.checkout' | t }}"`.

## Code example

### Incorrect
```liquid
<input type="submit" value="">
```

### Correct
```liquid
<input type="submit" value="{{ 'sections.cart.checkout' | t }}" class="btn-primary">
```

## How to check your fix

Verify `value` attribute is non-empty and describes the submission result.
