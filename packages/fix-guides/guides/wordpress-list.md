---
rule_id: list
platform: wordpress
title: Ensure ul and ol list containers only contain li elements in WordPress
summary: `<ul>` and `<ol>` tags must contain only `<li>` elements, `<script>`, or `<template>` tags.
reviewed_at: 2026-10-15T00:00:00Z
---

# Ensure ul and ol list containers only contain li elements in WordPress

## What's wrong

Placing `<div>` directly inside `<ul>` breaks list semantics and item numbering.

## Who it affects

Screen readers announce incorrect item counts or stop announcing list structure.

## How to fix on WordPress

Ensure custom menu walkers and post loop templates do not inject `<div>` as direct children of `<ul>`.

## Code example

### Incorrect
```php
<ul class="custom-nav">
  <span class="nav-group">
    <li><a href="#">Home</a></li>
  </span>
</ul>
```

### Correct
```php
<ul class="custom-nav">
  <li class="nav-item"><a href="#">Home</a></li>
</ul>
```

## How to check your fix

Validate HTML using W3C validator or DevTools to verify all direct children of `<ul>` and `<ol>` are `<li>` tags.
