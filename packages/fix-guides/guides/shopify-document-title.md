---
rule_id: document-title
platform: shopify
title: Ensure every page has a descriptive document title in Shopify
summary: Every web page must have an informative `<title>` tag in the `<head>` explaining its specific purpose.
reviewed_at: 2026-10-15T00:00:00Z
---

# Ensure every page has a descriptive document title in Shopify

## What's wrong

Pages with missing, generic, or duplicate `<title>` elements leave users unaware of which section or product they are viewing.

## Who it affects

Screen reader users rely on the page title as the very first information announced when a new page loads. It also affects browser tab identification.

## How to fix on Shopify

In `layout/theme.liquid`, format the `<title>` tag to include the current page title, current pagination page, and the store name.

## Code example

### Incorrect
```liquid
<title>My Store</title>
```

### Correct
```liquid
<title>
  {{ page_title }}
  {%- if current_tags %} &ndash; tagged "{{ current_tags | join: ', ' }}"{% endif -%}
  {%- if current_page != 1 %} &ndash; Page {{ current_page }}{% endif -%}
  {%- unless page_title contains shop.name %} &ndash; {{ shop.name }}{% endunless -%}
</title>
```

## How to check your fix

Look at the browser tab title on product, collection, and search pages. Verify that the title accurately identifies the specific page content.
