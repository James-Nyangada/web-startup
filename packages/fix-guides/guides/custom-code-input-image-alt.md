---
rule_id: input-image-alt
platform: custom
slug: input-image-alt
title: Add alt text to image buttons
summary: An input of type image works as a button, so its alt text must say what the button does.
reviewed_at: 2026-11-16T00:00:00Z
---

# Add alt text to image buttons

## What's wrong

An `<input type="image">` without `alt` text gives screen readers nothing to announce, or just the image file name.

## Who it affects

Screen reader users, who can't tell what the graphical button does, such as search or checkout.

## How to fix on a custom-coded site

Add an `alt` attribute that describes the action, not the picture: "Search", not "magnifying glass". Or replace it with a `<button>` containing an icon and hidden text.

## Code example

### Incorrect
```html
<input type="image" src="/icons/search.png">
```

### Correct
```html
<input type="image" src="/icons/search.png" alt="Search">

<!-- Or a button element -->
<button type="submit">
  <img src="/icons/search.png" alt="">
  <span class="visually-hidden">Search</span>
</button>
```

### React / Next.js (JSX)
```jsx
<input type="image" src="/icons/search.png" alt="Search" />
```

### Vue
```vue
<template>
  <input type="image" src="/icons/search.png" :alt="t('search.submit')" />
</template>
```

## How to check your fix

Tab to the image button with a screen reader on and confirm it announces the action. Then rescan with EveryVisitor.
