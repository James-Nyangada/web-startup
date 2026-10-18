---
rule_id: form-field-multiple-labels
platform: shopify
title: Resolve duplicate or multiple labels for form inputs in Shopify
summary: Form inputs should be associated with exactly one primary label element to avoid conflicting instructions.
reviewed_at: 2026-10-15T00:00:00Z
---

# Resolve duplicate or multiple labels for form inputs in Shopify

## What's wrong

Having two `<label for="field-id">` elements referencing the same input can cause screen readers to announce both repeatedly or miss instructions.

## Who it affects

Screen reader users receive confusing or duplicated announcements when navigating into the input field.

## How to fix on Shopify

Keep one primary `<label>`. Move extra helper text or requirements into a `<span>` and link it using `aria-describedby`.

## Code example

### Incorrect
```liquid
<label for="customer-email">Email</label>
<input id="customer-email" type="email">
<label for="customer-email">We will never share your email</label>
```

### Correct
```liquid
<label for="customer-email">Email</label>
<input id="customer-email" type="email" aria-describedby="customer-email-hint">
<span id="customer-email-hint" class="field-hint">We will never share your email</span>
```

## How to check your fix

Search the template DOM for `for="[input-id]"` and confirm exactly one `<label>` tag matches that ID.
