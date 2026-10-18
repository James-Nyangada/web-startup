---
rule_id: listitem
platform: wordpress
title: Wrap all li elements inside parent ul or ol containers in WordPress
summary: Every `<li>` element must be directly contained within a parent `<ul>` or `<ol>`.
reviewed_at: 2026-10-15T00:00:00Z
---

# Wrap all li elements inside parent ul or ol containers in WordPress

## What's wrong

Orphaned `<li>` elements outside of list tags violate HTML grammar and break accessibility semantics.

## Who it affects

Screen readers cannot announce 'List of X items' or announce the position of the item in the list.

## How to fix on WordPress

Wrap dynamic post lists and block query loops in proper `<ul>` containers.

## Code example

### Incorrect
```php
<?php while ( have_posts() ) : the_post(); ?>
  <li><?php the_title(); ?></li>
<?php endwhile; ?>
```

### Correct
```php
<ul class="post-list">
  <?php while ( have_posts() ) : the_post(); ?>
    <li><?php the_title(); ?></li>
  <?php endwhile; ?>
</ul>
```

## How to check your fix

Inspect each `<li>` element in DevTools and confirm its immediate parent is `<ul>` or `<ol>`.
