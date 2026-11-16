---
rule_id: link-name
platform: custom
slug: link-name
title: Give every link text that says where it goes
summary: Links that wrap only an icon or image need a text label so screen reader users know their destination.
reviewed_at: 2026-11-16T00:00:00Z
---

# Give every link text that says where it goes

## What's wrong

Links containing only an icon, an image with no alt text, or nothing at all are announced as "link" or as the raw URL.

## Who it affects

Screen reader users, especially those who pull up a list of all links on the page to find their way around.

## How to fix on a custom-coded site

Make sure each `<a>` contains text. For icon links (social media, account, logo), add visually hidden text or an `aria-label`, and hide the icon with `aria-hidden="true"`. For an image link, the image's `alt` text becomes the link's name, so describe the destination. Avoid vague text like "click here"; say where the link goes.

## Code example

### Incorrect
```html
<a href="https://instagram.com/oakhaus">
  <svg viewBox="0 0 24 24"><path d="..."/></svg>
</a>

<a href="/"><img src="/logo.svg"></a>
```

### Correct
```html
<a href="https://instagram.com/oakhaus">
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="..."/></svg>
  <span class="visually-hidden">Oakhaus on Instagram</span>
</a>

<a href="/"><img src="/logo.svg" alt="Oakhaus home"></a>
```

### React / Next.js (JSX)
```jsx
import Link from "next/link";

<Link href="/account" aria-label="Your account">
  <UserIcon aria-hidden="true" focusable="false" />
</Link>

<Link href="/">
  <img src="/logo.svg" alt="Oakhaus home" />
</Link>
```

### Vue
```vue
<template>
  <RouterLink to="/account" aria-label="Your account">
    <UserIcon aria-hidden="true" focusable="false" />
  </RouterLink>
</template>
```

## How to check your fix

Open the screen reader's list of links (VoiceOver rotor with VO+U, or NVDA+F7) and check every entry makes sense on its own. Tab through the page and confirm each link announces its destination. Then rescan with EveryVisitor.
