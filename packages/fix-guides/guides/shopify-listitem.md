---
rule_id: listitem
platform: shopify
title: Wrap all li elements inside parent ul or ol containers in Shopify
summary: Every `<li>` element must be directly contained within a parent `<ul>` or `<ol>`.
reviewed_at: 2026-10-15T00:00:00Z
---

# Wrap all li elements inside parent ul or ol containers in Shopify

## What's wrong

Orphaned `<li>` elements outside of list tags violate HTML grammar and break accessibility semantics.

## Who it affects

Screen readers cannot announce 'List of X items' or announce the position of the item in the list.

## How to fix on Shopify

Verify Liquid loops rendering `<li>` tags are surrounded by `<ul>` and `</ul>` outside the `for` loop.

## Code example

### Incorrect
```liquid
{% for link in linklists.main-menu.links %}
  <li class="menu-item"><a href="{{ link.url }}">{{ link.title }}</a></li>
{% endfor %}
```

### Correct
```liquid
<ul class="menu-list">
  {% for link in linklists.main-menu.links %}
    <li class="menu-item"><a href="{{ link.url }}">{{ link.title }}</a></li>
  {% endfor %}
</ul>
```

## How to check your fix

Inspect each `<li>` element in DevTools and confirm its immediate parent is `<ul>` or `<ol>`.
