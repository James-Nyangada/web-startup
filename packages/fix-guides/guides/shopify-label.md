---
rule_id: label
platform: shopify
title: Associate form inputs with accessible labels in Shopify
summary: Form inputs must have a programmatic `<label>` element connected via `for` and `id` attributes.
reviewed_at: 2026-10-15T00:00:00Z
---

# Associate form inputs with accessible labels in Shopify

## What's wrong

Inputs that rely exclusively on `placeholder` attributes lose their label once a user begins typing, leaving screen readers disoriented.

## Who it affects

Screen reader users, people with cognitive impairments, and speech-input users cannot reliably fill out newsletter, contact, or checkout forms.

## How to fix on Shopify

Add a `<label for="{{ input_id }}">` element preceding the `<input id="{{ input_id }}">`. If visual styling requires hiding the label, use the `.visually-hidden` class instead of removing the tag.

## Code example

### Incorrect
```liquid
<input type="email" name="contact[email]" placeholder="Enter your email">
```

### Correct
```liquid
<label for="Newsletter-Email--{{ section.id }}" class="visually-hidden">
  {{ 'general.newsletter.email_label' | t }}
</label>
<input
  id="Newsletter-Email--{{ section.id }}"
  type="email"
  name="contact[email]"
  placeholder="{{ 'general.newsletter.placeholder' | t }}"
  required
>
```

## How to check your fix

Click directly on the text label. The browser should immediately move focus into the corresponding form field.
