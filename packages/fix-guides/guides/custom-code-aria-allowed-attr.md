---
rule_id: aria-allowed-attr
platform: custom
slug: aria-allowed-attr
title: Use only ARIA attributes the element's role supports
summary: ARIA attributes must be allowed for the element's role, or screen readers ignore or misreport them.
reviewed_at: 2026-11-16T00:00:00Z
---

# Use only ARIA attributes the element's role supports

## What's wrong

Attributes like `aria-checked` on a link, or `aria-expanded` on a plain `<div>` with no role, aren't supported for that role, so screen readers ignore them or announce confusing states.

## Who it affects

Screen reader users, who may hear wrong or missing state information on toggles, menus and tabs.

## How to fix on a custom-coded site

Check which ARIA attributes the element's role allows. Remove attributes that don't belong, or give the element the correct role, or better, use the native element that has that behaviour built in: `<button aria-expanded>` for a disclosure, `<input type="checkbox">` for a checkbox.

## Code example

### Incorrect
```html
<a href="#" aria-checked="true">Gift wrap</a>
<div aria-expanded="false" class="faq-question">Delivery times</div>
```

### Correct
```html
<label><input type="checkbox" checked> Gift wrap</label>

<button type="button" aria-expanded="false" aria-controls="faq-1">Delivery times</button>
<div id="faq-1" hidden>...</div>
```

### React / Next.js (JSX)
```jsx
const [open, setOpen] = useState(false);

<button type="button" aria-expanded={open} aria-controls="faq-1" onClick={() => setOpen(!open)}>
  Delivery times
</button>
<div id="faq-1" hidden={!open}>...</div>
```

### Vue
```vue
<template>
  <button type="button" :aria-expanded="open" aria-controls="faq-1" @click="open = !open">
    Delivery times
  </button>
  <div id="faq-1" v-show="open">...</div>
</template>
```

## How to check your fix

In DevTools' Accessibility pane, check the element's role and the ARIA attributes it reports. With a screen reader, operate the control and confirm the state (expanded, checked) is announced correctly. Then rescan with EveryVisitor.
