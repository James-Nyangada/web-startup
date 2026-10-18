---
rule_id: aria-hidden-focus
platform: wordpress
title: Prevent focusable elements inside aria-hidden containers in WordPress
summary: Containers hidden with `aria-hidden="true"` must not contain links, buttons, or inputs that can receive keyboard focus.
reviewed_at: 2026-10-15T00:00:00Z
---

# Prevent focusable elements inside aria-hidden containers in WordPress

## What's wrong

Drawer carts, sliding mobile navigation panels, or modal dialogs that are closed often keep `aria-hidden="true"` while inner buttons remain in the tab order.

## Who it affects

Keyboard navigators tab into invisible elements on the page while screen readers remain completely silent, causing disorientation.

## How to fix on WordPress

In JavaScript mobile menu or modal scripts, add the `inert` attribute to closed off-canvas menus or toggle `display: none` when the drawer is collapsed.

## Code example

### Incorrect
```javascript
// Opening/closing mobile menu without managing inert
mobileMenu.setAttribute('aria-hidden', 'true');
```

### Correct
```javascript
// Correctly disable focus when off-canvas is closed
mobileMenu.setAttribute('aria-hidden', 'true');
mobileMenu.setAttribute('inert', '');
mobileMenu.style.display = 'none';
```

## How to check your fix

Close the drawer or modal, then press Tab repeatedly through the page. Verify that focus never lands on hidden links or buttons inside the closed panel.
