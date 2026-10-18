---
rule_id: aria-hidden-focus
platform: shopify
title: Prevent focusable elements inside aria-hidden containers in Shopify
summary: Containers hidden with `aria-hidden="true"` must not contain links, buttons, or inputs that can receive keyboard focus.
reviewed_at: 2026-10-15T00:00:00Z
---

# Prevent focusable elements inside aria-hidden containers in Shopify

## What's wrong

Drawer carts, sliding mobile navigation panels, or modal dialogs that are closed often keep `aria-hidden="true"` while inner buttons remain in the tab order.

## Who it affects

Keyboard navigators tab into invisible elements on the page while screen readers remain completely silent, causing disorientation.

## How to fix on Shopify

When closing drawer carts or popups, apply the HTML `hidden` attribute or `inert` attribute, or remove inner elements from the focus order with `tabindex="-1"`.

## Code example

### Incorrect
```liquid
<div id="CartDrawer" aria-hidden="true" class="cart-drawer is-closed">
  <button type="button" class="btn-checkout">Checkout</button>
</div>
```

### Correct
```liquid
<div id="CartDrawer" aria-hidden="true" inert class="cart-drawer is-closed" hidden>
  <button type="button" tabindex="-1" class="btn-checkout">Checkout</button>
</div>
```

## How to check your fix

Close the drawer or modal, then press Tab repeatedly through the page. Verify that focus never lands on hidden links or buttons inside the closed panel.
