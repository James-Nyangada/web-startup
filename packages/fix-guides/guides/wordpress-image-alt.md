---
rule_id: image-alt
platform: wordpress
title: Add descriptive alt text to images in WordPress
summary: Every product and theme image needs meaningful alternative text so screen reader users know what is displayed.
reviewed_at: 2026-10-15T00:00:00Z
---

# Add descriptive alt text to images in WordPress

## What's wrong

Images rendered without an `alt` attribute or with missing descriptions prevent screen readers from announcing what the image portrays.

## Who it affects

People who are blind or have low vision and use screen readers cannot tell what products or graphics look like. Users on low-bandwidth connections where images fail to load also rely on alt text.

## How to fix on WordPress

In WordPress, always specify alternative text when uploading images in the Media Library. When coding theme templates or blocks, use `wp_get_attachment_image( $id, 'full' )` which automatically includes the stored alt text. For custom markup, use `esc_attr( get_post_meta( $id, '_wp_attachment_image_alt', true ) )`.

## Code example

### Incorrect
```php
<img src="<?php echo esc_url( $image_url ); ?>" />
```

### Correct
```php
<?php echo wp_get_attachment_image( $attachment_id, 'large', false, array( 'class' => 'product-featured-image' ) ); ?>
```
For custom template tags:
```php
<img src="<?php echo esc_url( $thumb_url ); ?>" alt="<?php echo esc_attr( get_post_meta( get_post_thumbnail_id(), '_wp_attachment_image_alt', true ) ); ?>" />
```

## How to check your fix

Inspect the rendered HTML in Chrome DevTools to confirm every `<img>` has an `alt` attribute. Run an axe-core or screen reader check and verify decorative images have `alt=""` while informative images have clear, concise descriptions.
