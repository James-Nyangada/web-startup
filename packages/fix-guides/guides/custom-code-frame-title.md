---
rule_id: frame-title
platform: custom
slug: frame-title
title: Add a title to embedded frames
summary: Every iframe, such as a video, map or chat widget, needs a title describing its content.
reviewed_at: 2026-11-16T00:00:00Z
---

# Add a title to embedded frames

## What's wrong

An `<iframe>` without a `title` is announced only as "frame", so people can't tell a video from a map or a payment form.

## Who it affects

Screen reader users moving between frames or landmarks on the page.

## How to fix on a custom-coded site

Add a short, unique `title` to every `<iframe>` that says what's inside, such as "Video: How to assemble the oak chair" or "Map of our showroom". Third-party embed snippets often leave it out; add it yourself after pasting the snippet.

## Code example

### Incorrect
```html
<iframe src="https://www.youtube.com/embed/abc123"></iframe>
```

### Correct
```html
<iframe
  src="https://www.youtube.com/embed/abc123"
  title="Video: How to assemble the oak chair"
  loading="lazy"
  allowfullscreen></iframe>
```

### React / Next.js (JSX)
```jsx
<iframe
  src={`https://www.youtube.com/embed/${videoId}`}
  title={`Video: ${videoTitle}`}
  loading="lazy"
  allowFullScreen
/>
```

### Vue
```vue
<template>
  <iframe
    :src="`https://www.youtube.com/embed/${videoId}`"
    :title="`Video: ${videoTitle}`"
    loading="lazy"
    allowfullscreen
  />
</template>
```

## How to check your fix

In the browser's accessibility tree, check each iframe has a name. With a screen reader, move to the frame and confirm the title is announced. Then rescan with EveryVisitor.
