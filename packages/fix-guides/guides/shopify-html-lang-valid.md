---
rule_id: html-lang-valid
platform: shopify
title: Use a valid BCP 47 language code on the html element in Shopify
summary: The language code specified on `<html>` must be an authorized BCP 47 language tag.
reviewed_at: 2026-10-15T00:00:00Z
---

# Use a valid BCP 47 language code on the html element in Shopify

## What's wrong

Values like `lang="english"` or malformed region codes cause speech synthesis software to fail.

## Who it affects

Screen readers fall back to default speech synthesizers or report language parsing errors.

## How to fix on Shopify

Always use Shopify's native `request.locale.iso_code` object rather than hardcoded language strings.

## Code example

### Incorrect
```liquid
<html lang="english">
```

### Correct
```liquid
<html lang="{{ request.locale.iso_code }}">
```

## How to check your fix

Validate the `lang` tag against the IANA language subtag registry (e.g. `en`, `en-US`, `fr`, `de`).
