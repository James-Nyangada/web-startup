---
rule_id: listitem
platform: custom
slug: listitem
title: Put list items inside a list
summary: li elements must sit directly inside a ul, ol or menu element.
reviewed_at: 2026-11-16T00:00:00Z
---

# Put list items inside a list

## What's wrong

An `<li>` that isn't inside a `<ul>` or `<ol>`, often because a component renders list items on their own, isn't announced as part of a list.

## Who it affects

Screen reader users, who lose the list structure and item count.

## How to fix on a custom-coded site

Wrap the `<li>` elements in a `<ul>` or `<ol>`. If a component renders `<li>`, make sure every place that uses it puts it inside a list. If it isn't really a list, use a `<div>` instead.

## Code example

### Incorrect
```html
<div class="breadcrumbs">
  <li><a href="/">Home</a></li>
  <li><a href="/chairs">Chairs</a></li>
</div>
```

### Correct
```html
<nav aria-label="Breadcrumb">
  <ol class="breadcrumbs">
    <li><a href="/">Home</a></li>
    <li><a href="/chairs" aria-current="page">Chairs</a></li>
  </ol>
</nav>
```

### React / Next.js (JSX)
```jsx
<nav aria-label="Breadcrumb">
  <ol>
    {crumbs.map((c, i) => (
      <li key={c.href}>
        <Link href={c.href} aria-current={i === crumbs.length - 1 ? "page" : undefined}>
          {c.label}
        </Link>
      </li>
    ))}
  </ol>
</nav>
```

### Vue
```vue
<template>
  <nav aria-label="Breadcrumb">
    <ol>
      <li v-for="c in crumbs" :key="c.href"><RouterLink :to="c.href">{{ c.label }}</RouterLink></li>
    </ol>
  </nav>
</template>
```

## How to check your fix

Inspect each `<li>` in DevTools and confirm its parent is `<ul>` or `<ol>`. Then rescan with EveryVisitor.
