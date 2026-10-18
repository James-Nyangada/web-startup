---
rule_id: link-name
platform: wordpress
title: Ensure all links have discernible accessible text in WordPress
summary: Links must contain descriptive text so users know where following the link will lead.
reviewed_at: 2026-10-15T00:00:00Z
---

# Ensure all links have discernible accessible text in WordPress

## What's wrong

Links that wrap only SVG icons, background images, or generic phrases like 'Click here' fail to communicate their destination.

## Who it affects

Screen reader users who navigate by pulling up a links list hear ambiguous entries like 'link, icon' or repetitive URLs.

## How to fix on WordPress

Include descriptive text inside theme navigation and post links. Replace ambiguous read-more anchors with dynamic titles using `the_title()` inside `<span class="screen-reader-text">`.

## Code example

### Incorrect
```php
<a href="<?php the_permalink(); ?>" class="read-more">Read more</a>
```

### Correct
```php
<a href="<?php the_permalink(); ?>" class="read-more">
  <?php esc_html_e( 'Read more', 'textdomain' ); ?>
  <span class="screen-reader-text"><?php echo esc_html( sprintf( __( 'about %s', 'textdomain' ), get_the_title() ) ); ?></span>
</a>
```

## How to check your fix

Open browser accessibility tree or VoiceOver links list (VO + U > Links) and verify every link has a meaningful, unique name explaining its destination.
