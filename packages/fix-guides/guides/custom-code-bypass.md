---
rule_id: bypass
platform: custom
slug: bypass
title: Add a skip link to jump past the navigation
summary: A skip link or main landmark lets keyboard users go straight to the content without tabbing through every menu item.
reviewed_at: 2026-11-16T00:00:00Z
---

# Add a skip link to jump past the navigation

## What's wrong

Without a skip link or a `<main>` landmark, keyboard users must press Tab through the whole header and menu on every page before reaching the content.

## Who it affects

Keyboard users, switch users and screen reader users, for whom a long menu can mean dozens of key presses per page.

## How to fix on a custom-coded site

Wrap your page content in a `<main>` element and add a "Skip to content" link as the first focusable element in the `<body>`, pointing at the main element's `id`. The link can stay hidden until it receives focus.

## Code example

### Incorrect
```html
<body>
  <header>...30 menu links...</header>
  <div class="content">...</div>
</body>
```

### Correct
```html
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header>...</header>
  <main id="main-content" tabindex="-1">...</main>
</body>
```

### CSS
```css
.skip-link {
  position: absolute;
  left: 1rem;
  top: -100px;
}
.skip-link:focus {
  top: 1rem;
  z-index: 1000;
  padding: 0.5rem 1rem;
  background: #ffffff;
  color: #111111;
  outline: 3px solid #1a56db;
}
```

### React / Next.js (JSX)
```jsx
// app/layout.tsx
<body>
  <a className="skip-link" href="#main-content">Skip to content</a>
  <Header />
  <main id="main-content" tabIndex={-1}>{children}</main>
</body>
```

### Vue
```vue
<!-- App.vue -->
<template>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <SiteHeader />
  <main id="main-content" tabindex="-1"><RouterView /></main>
</template>
```

## How to check your fix

Load the page and press Tab once: the skip link should appear. Press Enter, then Tab again: focus should land inside the main content. Then rescan with EveryVisitor.
