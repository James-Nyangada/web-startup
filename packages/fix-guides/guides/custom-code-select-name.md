---
rule_id: select-name
platform: custom
slug: select-name
title: Give dropdown menus a label
summary: Every select element needs a label so people know what they're choosing, such as size or sort order.
reviewed_at: 2026-11-16T00:00:00Z
---

# Give dropdown menus a label

## What's wrong

A `<select>` with no label is announced as "combo box" or "pop-up button" without saying what it controls.

## Who it affects

Screen reader users choosing a size, colour, quantity, country or sort order, and voice control users.

## How to fix on a custom-coded site

Add a `<label>` linked to the `<select>` with `for` and `id`. If the design has no room for visible text, use visually hidden label text, or an `aria-label` as a last resort. The first option should not stand in for the label.

## Code example

### Incorrect
```html
<select name="sort">
  <option>Featured</option>
  <option>Price, low to high</option>
</select>
```

### Correct
```html
<label for="sort-by">Sort by</label>
<select id="sort-by" name="sort">
  <option>Featured</option>
  <option>Price, low to high</option>
</select>
```

### React / Next.js (JSX)
```jsx
const id = useId();

<label htmlFor={id}>Size</label>
<select id={id} value={size} onChange={(e) => setSize(e.target.value)}>
  {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
</select>
```

### Vue
```vue
<template>
  <label for="size">Size</label>
  <select id="size" v-model="size">
    <option v-for="s in sizes" :key="s" :value="s">{{ s }}</option>
  </select>
</template>
```

## How to check your fix

Tab to the dropdown with a screen reader on and confirm it says the label, such as "Sort by, Featured, pop-up button". Then rescan with EveryVisitor.
