---
rule_id: aria-required-attr
platform: custom
slug: aria-required-attr
title: Add the ARIA attributes a role requires
summary: Some roles need specific attributes, such as aria-checked on a checkbox or aria-valuenow on a slider.
reviewed_at: 2026-11-16T00:00:00Z
---

# Add the ARIA attributes a role requires

## What's wrong

Custom widgets like `role="checkbox"`, `role="slider"` or `role="combobox"` without their required attributes leave screen readers unable to report the current state or value.

## Who it affects

Screen reader users, who can't tell whether a box is ticked or what value a slider is set to.

## How to fix on a custom-coded site

Add every attribute the role requires and keep it updated as the widget changes: `aria-checked` for checkboxes and switches, `aria-valuenow` (with `aria-valuemin` and `aria-valuemax`) for sliders, `aria-expanded` for comboboxes. Where you can, replace the custom widget with the native element, which needs none of this.

## Code example

### Incorrect
```html
<div role="checkbox" tabindex="0">Subscribe to offers</div>
<div role="slider" tabindex="0"></div>
```

### Correct
```html
<div role="checkbox" tabindex="0" aria-checked="false">Subscribe to offers</div>
<div role="slider" tabindex="0" aria-label="Maximum price"
     aria-valuemin="0" aria-valuemax="500" aria-valuenow="250"></div>

<!-- Simpler: native elements -->
<label><input type="checkbox"> Subscribe to offers</label>
<label>Maximum price <input type="range" min="0" max="500" value="250"></label>
```

### React / Next.js (JSX)
```jsx
<div
  role="switch"
  tabIndex={0}
  aria-checked={on}
  onClick={() => setOn(!on)}
  onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setOn(!on)}
>
  Email me offers
</div>
```

### Vue
```vue
<template>
  <div role="switch" tabindex="0" :aria-checked="on"
       @click="on = !on" @keydown.space.prevent="on = !on">
    Email me offers
  </div>
</template>
```

## How to check your fix

Operate the widget with the keyboard while a screen reader is on and confirm it announces the state or value each time it changes. Then rescan with EveryVisitor.
