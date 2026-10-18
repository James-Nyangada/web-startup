---
rule_id: frame-title
platform: wordpress
title: Add informative title attributes to iframes in WordPress
summary: Every `<iframe>` embedding videos, maps, or widgets must include an accessible `title` attribute.
reviewed_at: 2026-10-15T00:00:00Z
---

# Add informative title attributes to iframes in WordPress

## What's wrong

Iframes without titles are announced merely as 'frame', leaving users unaware of the third-party content embedded.

## Who it affects

Screen reader users browsing by landmarks or frames cannot decide whether to enter or skip the frame.

## How to fix on WordPress

Add a `title` attribute to iframe blocks or filter oEmbed HTML in `functions.php` to inject titles on YouTube and Vimeo embeds.

## Code example

### Incorrect
```php
<iframe src="https://maps.google.com/embed..."></iframe>
```

### Correct
```php
<iframe
  src="https://maps.google.com/embed..."
  title="<?php esc_attr_e( 'Store location map', 'textdomain' ); ?>"
  loading="lazy"
></iframe>
```

## How to check your fix

Inspect each `<iframe>` element in DevTools and confirm a clear, descriptive `title` attribute exists.
