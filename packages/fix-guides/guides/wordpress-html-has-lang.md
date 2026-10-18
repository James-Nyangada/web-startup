---
rule_id: html-has-lang
platform: wordpress
title: Add the lang attribute to the html element in WordPress
summary: The root `<html>` element must declare the document's primary language using a valid `lang` attribute.
reviewed_at: 2026-10-15T00:00:00Z
---

# Add the lang attribute to the html element in WordPress

## What's wrong

Omitting the `lang` attribute causes assistive technology to default to the user's system language, mispronouncing words.

## Who it affects

Screen reader users hear English text spoken using French or German phonetic engines, making text unintelligible.

## How to fix on WordPress

In `header.php`, output `<html <?php language_attributes(); ?>>`.

## Code example

### Incorrect
```php
<!DOCTYPE html>
<html>
```

### Correct
```php
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
```

## How to check your fix

Inspect the root element in DevTools Elements panel. Verify `<html lang="en">` (or matching store locale) is present.
