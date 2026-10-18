---
rule_id: form-field-multiple-labels
platform: wordpress
title: Resolve duplicate or multiple labels for form inputs in WordPress
summary: Form inputs should be associated with exactly one primary label element to avoid conflicting instructions.
reviewed_at: 2026-10-15T00:00:00Z
---

# Resolve duplicate or multiple labels for form inputs in WordPress

## What's wrong

Having two `<label for="field-id">` elements referencing the same input can cause screen readers to announce both repeatedly or miss instructions.

## Who it affects

Screen reader users receive confusing or duplicated announcements when navigating into the input field.

## How to fix on WordPress

Ensure form builders and custom theme templates do not output redundant label tags for the same input ID.

## Code example

### Incorrect
```php
<label for="user-login">Username</label>
<label for="user-login">Enter your username or email</label>
<input id="user-login" name="log" type="text">
```

### Correct
```php
<label for="user-login"><?php esc_html_e( 'Username', 'textdomain' ); ?></label>
<input id="user-login" name="log" type="text" aria-describedby="user-login-desc">
<span id="user-login-desc" class="description"><?php esc_html_e( 'Enter your username or email', 'textdomain' ); ?></span>
```

## How to check your fix

Search the template DOM for `for="[input-id]"` and confirm exactly one `<label>` tag matches that ID.
