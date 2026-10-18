---
rule_id: html-has-lang
platform: shopify
title: Add the lang attribute to the html element in Shopify
summary: The root `<html>` element must declare the document's primary language using a valid `lang` attribute.
reviewed_at: 2026-10-15T00:00:00Z
---

# Add the lang attribute to the html element in Shopify

## What's wrong

Omitting the `lang` attribute causes assistive technology to default to the user's system language, mispronouncing words.

## Who it affects

Screen reader users hear English text spoken using French or German phonetic engines, making text unintelligible.

## How to fix on Shopify

In `layout/theme.liquid`, set `<html lang="{{ request.locale.iso_code }}">`.

## Code example

### Incorrect
```liquid
<!doctype html>
<html>
```

### Correct
```liquid
<!doctype html>
<html class="no-js" lang="{{ request.locale.iso_code }}">
```

## How to check your fix

Inspect the root element in DevTools Elements panel. Verify `<html lang="en">` (or matching store locale) is present.
