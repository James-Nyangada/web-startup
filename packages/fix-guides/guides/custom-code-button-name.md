---
rule_id: button-name
platform: custom
slug: button-name
title: Give every button a name screen readers can announce
summary: Icon-only buttons need a text label, either hidden text inside the button or an aria-label.
reviewed_at: 2026-11-16T00:00:00Z
---

# Give every button a name screen readers can announce

## What's wrong

A `<button>` that contains only an icon (a cart, a magnifying glass, an X) has no text, so screen readers announce it only as "button".

## Who it affects

Screen reader users can't tell what the button does. People using voice control can't say the button's name to press it.

## How to fix on a custom-coded site

Put text inside the button. If the design shows only an icon, add visually hidden text inside the button, or an `aria-label` on it. Hide the icon itself from screen readers with `aria-hidden="true"` so it isn't read twice. Keep the label short and say what the button does, such as "Open cart" or "Close menu".

## Code example

### Incorrect
```html
<button class="cart-toggle">
  <svg viewBox="0 0 24 24"><path d="..."/></svg>
</button>
```

### Correct
```html
<button class="cart-toggle" type="button">
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="..."/></svg>
  <span class="visually-hidden">Open cart</span>
</button>

<!-- Or, with no hidden text -->
<button class="cart-toggle" type="button" aria-label="Open cart">
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="..."/></svg>
</button>
```

### CSS
```css
/* Hides text visually but keeps it available to screen readers */
.visually-hidden {
  position: absolute !important;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

### React / Next.js (JSX)
```jsx
export function IconButton({ label, icon: Icon, ...props }) {
  return (
    <button type="button" aria-label={label} {...props}>
      <Icon aria-hidden="true" focusable="false" />
    </button>
  );
}

<IconButton label="Open cart" icon={CartIcon} onClick={openCart} />
```

### Vue
```vue
<template>
  <button type="button" :aria-label="label" @click="$emit('click')">
    <component :is="icon" aria-hidden="true" focusable="false" />
  </button>
</template>

<script setup>
defineProps({ label: { type: String, required: true }, icon: Object });
</script>
```

## How to check your fix

Press Tab to reach the button with the keyboard, and listen with a screen reader: it should say the button's name, such as "Open cart, button". In Chrome DevTools, the Accessibility pane shows the computed name. Then rescan with EveryVisitor.
