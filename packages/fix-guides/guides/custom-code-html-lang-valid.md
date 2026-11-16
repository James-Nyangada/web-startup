---
rule_id: html-lang-valid
platform: custom
slug: html-lang-valid
title: Use a valid language code in the lang attribute
summary: The lang value must be a real language code such as en or en-GB, not a made-up or empty value.
reviewed_at: 2026-11-16T00:00:00Z
---

# Use a valid language code in the lang attribute

## What's wrong

Values like `lang="english"`, `lang="en_US"` (underscore) or `lang=""` aren't valid language codes, so screen readers can't use them.

## Who it affects

Screen reader users, whose software may use the wrong voice and pronunciation.

## How to fix on a custom-coded site

Use a valid BCP 47 code: a two-letter language code, optionally with a hyphen and region, such as `en`, `en-US`, `pt-BR`. If your app builds the value from a locale setting, convert underscores to hyphens.

## Code example

### Incorrect
```html
<html lang="english">
<html lang="en_US">
```

### Correct
```html
<html lang="en">
<html lang="en-US">
```

### React / Next.js (JSX)
```jsx
// Locale strings like "en_US" come from many back-ends; convert them
const lang = locale.replace("_", "-"); // "en-US"

<html lang={lang}>
```

### Vue
```vue
// Nuxt i18n sets this for you when each locale has a `language` code:
// i18n: { locales: [{ code: "en", language: "en-US" }] }
```

## How to check your fix

Inspect the `<html>` element and confirm the `lang` value is a real code. Then rescan with EveryVisitor.
