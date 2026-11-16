---
rule_id: document-title
platform: custom
slug: document-title
title: Give every page a descriptive title
summary: Each page needs a unique title element naming the page first and the site second.
reviewed_at: 2026-11-16T00:00:00Z
---

# Give every page a descriptive title

## What's wrong

Pages with no `<title>`, or the same title on every page, leave people unsure which page they're on and which browser tab is which.

## Who it affects

Screen reader users, who hear the title first when a page loads, and anyone with many tabs open.

## How to fix on a custom-coded site

Set a unique `<title>` on every page, with the specific page first and the site name last: "Oak dining chair – Oakhaus". In single-page apps, update the title on every route change, because the browser won't do it for you.

## Code example

### Incorrect
```html
<head>
  <title>Oakhaus</title>
</head>
```

### Correct
```html
<head>
  <title>Oak dining chair – Oakhaus</title>
</head>
```

### React / Next.js (JSX)
```jsx
// Next.js App Router: app/products/[slug]/page.tsx
export async function generateMetadata({ params }) {
  const product = await getProduct((await params).slug);
  return { title: `${product.name} – Oakhaus` };
}

// Plain React (React 19 hoists <title> into <head>)
function ProductPage({ product }) {
  return (
    <>
      <title>{`${product.name} – Oakhaus`}</title>
      {/* page */}
    </>
  );
}
```

### Vue
```vue
<script setup>
// Nuxt: useHead / useSeoMeta. Plain Vue: set document.title in a router afterEach hook.
useHead({ title: () => `${product.value.name} – Oakhaus` });
</script>
```

## How to check your fix

Visit several pages and read the browser tab: each should name the page. In a single-page app, navigate between routes and check the title changes. Then rescan with EveryVisitor.
