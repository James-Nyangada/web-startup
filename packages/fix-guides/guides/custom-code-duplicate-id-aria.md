---
rule_id: duplicate-id-aria
platform: custom
slug: duplicate-id-aria
title: Use unique IDs for elements that labels and ARIA point to
summary: IDs referenced by for, aria-labelledby or aria-describedby must be unique on the page.
reviewed_at: 2026-11-16T00:00:00Z
---

# Use unique IDs for elements that labels and ARIA point to

## What's wrong

When two elements share an `id`, a label or `aria-labelledby` can point to the wrong one, so a field is announced with another field's name. This often happens when a component with a hard-coded id is used twice.

## Who it affects

Screen reader users, who hear wrong or missing labels and descriptions.

## How to fix on a custom-coded site

Make every `id` unique on the page. In components, never hard-code ids; generate them per instance and pass them to the label and the ARIA attributes.

## Code example

### Incorrect
```html
<!-- Product card rendered twice -->
<label for="qty">Quantity</label><input id="qty" type="number">
<label for="qty">Quantity</label><input id="qty" type="number">
```

### Correct
```html
<label for="qty-oak-chair">Quantity</label><input id="qty-oak-chair" type="number">
<label for="qty-ash-stool">Quantity</label><input id="qty-ash-stool" type="number">
```

### React / Next.js (JSX)
```jsx
import { useId } from "react";

function QuantityField() {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <>
      <label htmlFor={id}>Quantity</label>
      <input id={id} type="number" aria-describedby={hintId} />
      <p id={hintId}>Maximum 10 per order</p>
    </>
  );
}
```

### Vue
```vue
<script setup>
import { useId } from "vue"; // Vue 3.5+
const id = useId();
</script>

<template>
  <label :for="id">Quantity</label>
  <input :id="id" type="number" :aria-describedby="`${id}-hint`" />
  <p :id="`${id}-hint`">Maximum 10 per order</p>
</template>
```

## How to check your fix

In the DevTools console, run `[...document.querySelectorAll('[id]')].map(e => e.id).filter((id, i, a) => a.indexOf(id) !== i)` to list repeated ids. Then rescan with EveryVisitor.
