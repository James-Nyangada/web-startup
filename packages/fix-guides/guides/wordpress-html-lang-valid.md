---
rule_id: html-lang-valid
platform: wordpress
title: Use a valid BCP 47 language code on the html element in WordPress
summary: The language code specified on `<html>` must be an authorized BCP 47 language tag.
reviewed_at: 2026-10-15T00:00:00Z
---

# Use a valid BCP 47 language code on the html element in WordPress

## What's wrong

Values like `lang="english"` or malformed region codes cause speech synthesis software to fail.

## Who it affects

Screen readers fall back to default speech synthesizers or report language parsing errors.

## How to fix on WordPress

Use WordPress's native `language_attributes()` function which extracts valid codes configured in General Settings.

## Code example

### Incorrect
```php
<html lang="en_US_custom">
```

### Correct
```php
<html <?php language_attributes(); ?>>
```

## How to check your fix

Validate the `lang` tag against the IANA language subtag registry (e.g. `en`, `en-US`, `fr`, `de`).
