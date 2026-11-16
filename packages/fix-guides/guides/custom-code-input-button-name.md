---
rule_id: input-button-name
platform: custom
slug: input-button-name
title: Give input buttons a value people can hear
summary: Inputs of type submit, button or reset need a value attribute describing what they do.
reviewed_at: 2026-11-16T00:00:00Z
---

# Give input buttons a value people can hear

## What's wrong

An `<input type="submit">` or `<input type="button">` with an empty or missing `value` is announced only as "button", or with a browser default like "Submit".

## Who it affects

Screen reader users and voice control users, who can't tell which form the button submits or what it does.

## How to fix on a custom-coded site

Set a clear `value` on every input button, such as "Subscribe" or "Apply discount". Better still, use a `<button>` element with text inside, which is easier to style and to translate.

## Code example

### Incorrect
```html
<input type="submit" value="">
<input type="button" class="apply-code">
```

### Correct
```html
<input type="submit" value="Subscribe">

<!-- Preferred: a button element -->
<button type="button" class="apply-code">Apply discount code</button>
```

### React / Next.js (JSX)
```jsx
<button type="submit">Subscribe</button>
```

### Vue
```vue
<template>
  <button type="submit">{{ t("newsletter.subscribe") }}</button>
</template>
```

## How to check your fix

Tab to the button and confirm the screen reader announces its purpose. Then rescan with EveryVisitor.
