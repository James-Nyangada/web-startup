---
rule_id: nested-interactive
platform: wordpress
title: Avoid nesting interactive controls within each other in WordPress
summary: Do not nest buttons, links, or inputs inside other clickable buttons or links.
reviewed_at: 2026-10-15T00:00:00Z
---

# Avoid nesting interactive controls within each other in WordPress

## What's wrong

Nesting a `<button>` inside an `<a>` tag creates invalid HTML and unpredictable keyboard/screen reader focus.

## Who it affects

Keyboard and screen reader users cannot activate the inner button, or clicking activates both actions simultaneously.

## How to fix on WordPress

Separate clickable post card links from inner category pills or bookmark buttons.

## Code example

### Incorrect
```php
<a href="<?php the_permalink(); ?>" class="post-card">
  <h2><?php the_title(); ?></h2>
  <a href="/category/news" class="badge">News</a>
</a>
```

### Correct
```php
<div class="post-card">
  <h2><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h2>
  <a href="/category/news" class="badge">News</a>
</div>
```

## How to check your fix

Run an axe audit or inspect the DOM to confirm no `<a>` tag contains another `<a>`, `<button>`, or `<input>`.
