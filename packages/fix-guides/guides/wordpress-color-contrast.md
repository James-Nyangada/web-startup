---
rule_id: color-contrast
platform: wordpress
title: Fix color contrast ratios for text in WordPress themes
summary: Text and interactive controls must have at least 4.5:1 contrast against their background (3:1 for large text).
reviewed_at: 2026-10-15T00:00:00Z
---

# Fix color contrast ratios for text in WordPress themes

## What's wrong

Light gray text, subtle subheadings, or low-contrast button states fail WCAG 1.4.3 minimum contrast requirements.

## Who it affects

People with low vision, color vision deficiency, and customers using devices in direct sunlight or dim environments cannot read critical store information.

## How to fix on WordPress

Update the color palette in `theme.json` or customize CSS styles in `style.css` to increase foreground text darkness or background lightness.

## Code example

### Incorrect
```json
{
  "settings": {
    "color": {
      "palette": [
        { "slug": "muted", "color": "#a0aec0", "name": "Muted" }
      ]
    }
  }
}
```

### Correct
```json
{
  "settings": {
    "color": {
      "palette": [
        { "slug": "muted", "color": "#4a5568", "name": "Muted Accessible" }
      ]
    }
  }
}
```

## How to check your fix

Use Chrome DevTools color picker to inspect element contrast. Confirm the contrast badge displays a green checkmark indicating ≥ 4.5:1 ratio.
