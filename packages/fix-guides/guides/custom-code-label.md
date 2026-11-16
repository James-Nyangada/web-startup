---
rule_id: label
platform: custom
slug: label
title: Connect every form field to a visible label
summary: Inputs need a label element linked by for and id, so screen readers announce what to type.
reviewed_at: 2026-11-16T00:00:00Z
---

# Connect every form field to a visible label

## What's wrong

Form fields that rely on placeholder text, or have a label that isn't linked to the input, are announced as "edit text" with no hint of what to enter.

## Who it affects

Screen reader users, people with memory or attention difficulties when the placeholder disappears as they type, and voice control users who say the field name to move to it.

## How to fix on a custom-coded site

Give each `<input>`, `<textarea>` and `<select>` a `<label>` whose `for` attribute matches the field's `id`, or wrap the field inside the label. Keep the label visible; a placeholder is not a label. In components, generate a unique id for each field so labels never point at the wrong input.

## Code example

### Incorrect
```html
<input type="email" placeholder="Email address">
```

### Correct
```html
<label for="newsletter-email">Email address</label>
<input type="email" id="newsletter-email" name="email" autocomplete="email">
```

### React / Next.js (JSX)
```jsx
import { useId } from "react";

export function TextField({ label, ...props }) {
  const id = useId();
  return (
    <>
      {/* htmlFor, not for, in JSX */}
      <label htmlFor={id}>{label}</label>
      <input id={id} {...props} />
    </>
  );
}

<TextField label="Email address" type="email" name="email" autoComplete="email" />
```

### Vue
```vue
<template>
  <label :for="id">{{ label }}</label>
  <input :id="id" v-bind="$attrs" />
</template>

<script setup>
import { useId } from "vue"; // Vue 3.5+
defineProps({ label: { type: String, required: true } });
const id = useId();
</script>
```

## How to check your fix

Click the label text: the cursor should move into its field. Tab to each field with a screen reader running and confirm it announces the label. Then rescan with EveryVisitor.
