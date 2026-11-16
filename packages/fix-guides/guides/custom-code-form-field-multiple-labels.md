---
rule_id: form-field-multiple-labels
platform: custom
slug: form-field-multiple-labels
title: Give each form field only one label
summary: A field with several label elements pointing at it is announced inconsistently across screen readers.
reviewed_at: 2026-11-16T00:00:00Z
---

# Give each form field only one label

## What's wrong

When two `<label>` elements reference the same field, for example a visible label and a second one added for styling, screen readers may read one, both or neither.

## Who it affects

Screen reader users and voice control users.

## How to fix on a custom-coded site

Keep one `<label>` per field. Put extra information, such as a hint or an error message, in a separate element and connect it with `aria-describedby`.

## Code example

### Incorrect
```html
<label for="postcode">Postcode</label>
<input id="postcode">
<label for="postcode" class="hint">We deliver to UK addresses only</label>
```

### Correct
```html
<label for="postcode">Postcode</label>
<input id="postcode" aria-describedby="postcode-hint" autocomplete="postal-code">
<p id="postcode-hint" class="hint">We deliver to UK addresses only</p>
```

### React / Next.js (JSX)
```jsx
const id = useId();

<label htmlFor={id}>Postcode</label>
<input id={id} aria-describedby={`${id}-hint`} autoComplete="postal-code" />
<p id={`${id}-hint`} className="hint">We deliver to UK addresses only</p>
```

### Vue
```vue
<template>
  <label for="postcode">Postcode</label>
  <input id="postcode" aria-describedby="postcode-hint" autocomplete="postal-code" />
  <p id="postcode-hint" class="hint">We deliver to UK addresses only</p>
</template>
```

## How to check your fix

Tab to the field with a screen reader on: it should say the label once, then the hint. Then rescan with EveryVisitor.
