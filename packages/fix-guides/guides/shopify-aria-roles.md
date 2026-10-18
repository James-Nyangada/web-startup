---
rule_id: aria-roles
platform: shopify
title: Use valid WAI-ARIA role values in Shopify themes
summary: The `role` attribute must contain a valid, non-deprecated WAI-ARIA role string.
reviewed_at: 2026-10-15T00:00:00Z
---

# Use valid WAI-ARIA role values in Shopify themes

## What's wrong

Misspelled roles like `role="btn"` or `role="nav"` are ignored by assistive tools.

## Who it affects

Screen readers treat the element as generic text or a generic container, discarding accessibility semantics.

## How to fix on Shopify

Correct typo roles to standard W3C roles such as `button`, `navigation`, `banner`, or `complementary`.

## Code example

### Incorrect
```liquid
<div role="btn" class="cart-button">Cart</div>
```

### Correct
```liquid
<button type="button" class="cart-button">Cart</button>
<!-- Or if div is mandatory -->
<div role="button" tabindex="0" class="cart-button">Cart</div>
```

## How to check your fix

Inspect elements with `role` attributes in DevTools. Check against the W3C WAI-ARIA Roles specification.
