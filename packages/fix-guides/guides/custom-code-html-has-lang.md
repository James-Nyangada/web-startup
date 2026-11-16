---
rule_id: html-has-lang
platform: custom
slug: html-has-lang
title: Set the page language on the html element
summary: The html element needs a lang attribute so screen readers pronounce the text correctly.
reviewed_at: 2026-11-16T00:00:00Z
---

# Set the page language on the html element

## What's wrong

Without `lang` on `<html>`, screen readers guess the language, often from the user's settings, and may read English text with French pronunciation or the reverse.

## Who it affects

Screen reader users, and people using browser translation or reading tools.

## How to fix on a custom-coded site

Add `lang` to the root `<html>` element with the page's main language code, such as `en`, `en-GB`, `fr` or `de`. For multi-language sites, set it per locale.

## Code example

### Incorrect
```html
<!doctype html>
<html>
```

### Correct
```html
<!doctype html>
<html lang="en">
```

### React / Next.js (JSX)
```jsx
// Next.js App Router: app/layout.tsx
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

// Plain React (Vite, Create React App): edit index.html -> <html lang="en">
```

### Vue
```vue
// Nuxt: nuxt.config.ts
export default defineNuxtConfig({
  app: { head: { htmlAttrs: { lang: "en" } } },
});

// Plain Vue (Vite): edit index.html -> <html lang="en">
```

## How to check your fix

View the page source or inspect the `<html>` element in DevTools and confirm `lang` is set. Then rescan with EveryVisitor.
