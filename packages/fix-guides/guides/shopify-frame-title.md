---
rule_id: frame-title
platform: shopify
title: Add informative title attributes to iframes in Shopify
summary: Every `<iframe>` embedding videos, maps, or widgets must include an accessible `title` attribute.
reviewed_at: 2026-10-15T00:00:00Z
---

# Add informative title attributes to iframes in Shopify

## What's wrong

Iframes without titles are announced merely as 'frame', leaving users unaware of the third-party content embedded.

## Who it affects

Screen reader users browsing by landmarks or frames cannot decide whether to enter or skip the frame.

## How to fix on Shopify

Add `title="{{ section.settings.video_title | escape }}"` to all video embed or app iframes in Liquid section templates.

## Code example

### Incorrect
```liquid
<iframe src="https://www.youtube.com/embed/{{ video_id }}"></iframe>
```

### Correct
```liquid
<iframe
  src="https://www.youtube.com/embed/{{ video_id }}"
  title="{{ 'sections.video.embed_title' | t: title: section.settings.heading | escape }}"
  loading="lazy"
></iframe>
```

## How to check your fix

Inspect each `<iframe>` element in DevTools and confirm a clear, descriptive `title` attribute exists.
