---
rule_id: duplicate-id-aria
platform: wordpress
title: Ensure IDs referenced by ARIA attributes are unique in WordPress
summary: IDs targeted by `aria-labelledby`, `aria-describedby`, or `aria-controls` must be unique across the entire DOM.
reviewed_at: 2026-10-15T00:00:00Z
---

# Ensure IDs referenced by ARIA attributes are unique in WordPress

## What's wrong

When multiple elements share the same ID, assistive technology can only associate the very first matching node.

## Who it affects

Screen readers announce the wrong product name, price, or modal description.

## How to fix on WordPress

Append `get_the_ID()` or block client ID to ensure all element IDs in loops are completely unique.

## Code example

### Incorrect
```php
<?php while ( have_posts() ) : the_post(); ?>
  <h3 id="post-title"><?php the_title(); ?></h3>
  <a href="<?php the_permalink(); ?>" aria-labelledby="post-title">Read</a>
<?php endwhile; ?>
```

### Correct
```php
<?php while ( have_posts() ) : the_post(); ?>
  <h3 id="post-title-<?php the_ID(); ?>"><?php the_title(); ?></h3>
  <a href="<?php the_permalink(); ?>" aria-labelledby="post-title-<?php the_ID(); ?>">Read</a>
<?php endwhile; ?>
```

## How to check your fix

Inspect the page with DevTools Console using `document.querySelectorAll('[id="your-id"]')` to confirm no duplicates exist.
