import os

GUIDES = [
    {
        "rule_id": "image-alt",
        "title_shopify": "Add descriptive alt text to images in Shopify",
        "title_wp": "Add descriptive alt text to images in WordPress",
        "summary": "Every product and theme image needs meaningful alternative text so screen reader users know what is displayed.",
        "wrong": "Images rendered without an `alt` attribute or with missing descriptions prevent screen readers from announcing what the image portrays.",
        "affects": "People who are blind or have low vision and use screen readers cannot tell what products or graphics look like. Users on low-bandwidth connections where images fail to load also rely on alt text.",
        "fix_shopify": "In Shopify, make sure every Liquid `image_tag` includes an `alt` parameter using `image.alt | escape`. For product media uploaded in the admin, fill in the 'Alt text' field under Products > Media. If an image is purely decorative, explicitly set `alt: ''`.",
        "fix_wp": "In WordPress, always specify alternative text when uploading images in the Media Library. When coding theme templates or blocks, use `wp_get_attachment_image( $id, 'full' )` which automatically includes the stored alt text. For custom markup, use `esc_attr( get_post_meta( $id, '_wp_attachment_image_alt', true ) )`.",
        "code_shopify": """### Incorrect
```liquid
<img src="{{ product.featured_image | image_url: width: 600 }}">
```

### Correct
```liquid
{{ product.featured_image | image_url: width: 600 | image_tag: alt: product.featured_image.alt, class: 'product-card__image' }}
```
For decorative background badges:
```liquid
<img src="{{ 'badge-glow.svg' | asset_url }}" alt="" role="presentation">
```""",
        "code_wp": """### Incorrect
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
```""",
        "check": "Inspect the rendered HTML in Chrome DevTools to confirm every `<img>` has an `alt` attribute. Run an axe-core or screen reader check and verify decorative images have `alt=\"\"` while informative images have clear, concise descriptions.",
    },
    {
        "rule_id": "button-name",
        "title_shopify": "Provide discernible accessible names for buttons in Shopify",
        "title_wp": "Provide discernible accessible names for buttons in WordPress",
        "summary": "Buttons containing only icons or empty labels leave screen reader users with no indication of their action.",
        "wrong": "Buttons without text content or accessible labels (such as search triggers, drawer cart toggles, and modal close buttons) are announced simply as 'button'.",
        "affects": "Screen reader users cannot determine what the button will do. Voice control users cannot click the button by saying its visible name.",
        "fix_shopify": "Add an accessible label to icon-only buttons using `<span class=\"visually-hidden\">{{ 'general.accessibility.close' | t }}</span>` or an `aria-label=\"{{ 'sections.header.cart' | t }}\"` attribute.",
        "fix_wp": "In WordPress theme templates, wrap icon buttons with a `<span class=\"screen-reader-text\"><?php esc_html_e( 'Search', 'textdomain' ); ?></span>` element or use `aria-label=\"<?php esc_attr_e( 'Close modal', 'textdomain' ); ?>\"`.",
        "code_shopify": """### Incorrect
```liquid
<button type=\"button\" class=\"cart-drawer__close\">
  {% render 'icon-close' %}
</button>
```

### Correct
```liquid
<button type=\"button\" class=\"cart-drawer__close\" aria-label=\"{{ 'general.accessibility.close' | t }}\">
  {% render 'icon-close' %}
  <span class=\"visually-hidden\">{{ 'general.accessibility.close' | t }}</span>
</button>
```""",
        "code_wp": """### Incorrect
```php
<button type=\"submit\" class=\"search-submit\">
  <i class=\"icon-search\"></i>
</button>
```

### Correct
```php
<button type=\"submit\" class=\"search-submit\" aria-label=\"<?php esc_attr_e( 'Search site', 'textdomain' ); ?>\">
  <i class=\"icon-search\" aria-hidden=\"true\"></i>
  <span class=\"screen-reader-text\"><?php esc_html_e( 'Search site', 'textdomain' ); ?></span>
</button>
```""",
        "check": "Navigate the page using the Tab key with VoiceOver or NVDA active. Ensure that every interactive button announces a clear action like 'Close cart drawer' or 'Submit search'.",
    },
    {
        "rule_id": "link-name",
        "title_shopify": "Ensure all links have discernible accessible text in Shopify",
        "title_wp": "Ensure all links have discernible accessible text in WordPress",
        "summary": "Links must contain descriptive text so users know where following the link will lead.",
        "wrong": "Links that wrap only SVG icons, background images, or generic phrases like 'Click here' fail to communicate their destination.",
        "affects": "Screen reader users who navigate by pulling up a links list hear ambiguous entries like 'link, icon' or repetitive URLs.",
        "fix_shopify": "Add descriptive text inside the `<a>` tag using visually hidden text or an `aria-label`. For product cards, ensure the link specifies the product title and variant.",
        "fix_wp": "Include descriptive text inside theme navigation and post links. Replace ambiguous read-more anchors with dynamic titles using `the_title()` inside `<span class=\"screen-reader-text\">`.",
        "code_shopify": """### Incorrect
```liquid
<a href=\"{{ settings.social_instagram_link }}\">
  {% render 'icon-instagram' %}
</a>
```

### Correct
```liquid
<a href=\"{{ settings.social_instagram_link }}\" class=\"social-link\" aria-label=\"Follow us on Instagram\">
  {% render 'icon-instagram' %}
  <span class=\"visually-hidden\">Follow us on Instagram (opens in new tab)</span>
</a>
```""",
        "code_wp": """### Incorrect
```php
<a href=\"<?php the_permalink(); ?>\" class=\"read-more\">Read more</a>
```

### Correct
```php
<a href=\"<?php the_permalink(); ?>\" class=\"read-more\">
  <?php esc_html_e( 'Read more', 'textdomain' ); ?>
  <span class=\"screen-reader-text\"><?php echo esc_html( sprintf( __( 'about %s', 'textdomain' ), get_the_title() ) ); ?></span>
</a>
```""",
        "check": "Open browser accessibility tree or VoiceOver links list (VO + U > Links) and verify every link has a meaningful, unique name explaining its destination.",
    },
    {
        "rule_id": "color-contrast",
        "title_shopify": "Fix color contrast ratios for text in Shopify themes",
        "title_wp": "Fix color contrast ratios for text in WordPress themes",
        "summary": "Text and interactive controls must have at least 4.5:1 contrast against their background (3:1 for large text).",
        "wrong": "Light gray text, subtle subheadings, or low-contrast button states fail WCAG 1.4.3 minimum contrast requirements.",
        "affects": "People with low vision, color vision deficiency, and customers using devices in direct sunlight or dim environments cannot read critical store information.",
        "fix_shopify": "Adjust color tokens in `config/settings_schema.json` and CSS custom properties in `assets/base.css` to guarantee a 4.5:1 ratio for body text against backgrounds.",
        "fix_wp": "Update the color palette in `theme.json` or customize CSS styles in `style.css` to increase foreground text darkness or background lightness.",
        "code_shopify": """### Incorrect
```css
.product-card__price {
  color: #999999; /* 2.8:1 on white - FAILS */
}
```

### Correct
```css
.product-card__price {
  color: #595959; /* 4.6:1 on white - PASSES WCAG AA */
}
```""",
        "code_wp": """### Incorrect
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
```""",
        "check": "Use Chrome DevTools color picker to inspect element contrast. Confirm the contrast badge displays a green checkmark indicating ≥ 4.5:1 ratio.",
    },
    {
        "rule_id": "label",
        "title_shopify": "Associate form inputs with accessible labels in Shopify",
        "title_wp": "Associate form inputs with accessible labels in WordPress",
        "summary": "Form inputs must have a programmatic `<label>` element connected via `for` and `id` attributes.",
        "wrong": "Inputs that rely exclusively on `placeholder` attributes lose their label once a user begins typing, leaving screen readers disoriented.",
        "affects": "Screen reader users, people with cognitive impairments, and speech-input users cannot reliably fill out newsletter, contact, or checkout forms.",
        "fix_shopify": "Add a `<label for=\"{{ input_id }}\">` element preceding the `<input id=\"{{ input_id }}\">`. If visual styling requires hiding the label, use the `.visually-hidden` class instead of removing the tag.",
        "fix_wp": "Ensure all form inputs in theme search forms, comment sections, or form plugins have a matching `<label for=\"field-id\">` paired with `<input id=\"field-id\">`.",
        "code_shopify": """### Incorrect
```liquid
<input type=\"email\" name=\"contact[email]\" placeholder=\"Enter your email\">
```

### Correct
```liquid
<label for=\"Newsletter-Email--{{ section.id }}\" class=\"visually-hidden\">
  {{ 'general.newsletter.email_label' | t }}
</label>
<input
  id=\"Newsletter-Email--{{ section.id }}\"
  type=\"email\"
  name=\"contact[email]\"
  placeholder=\"{{ 'general.newsletter.placeholder' | t }}\"
  required
>
```""",
        "code_wp": """### Incorrect
```php
<input type=\"search\" class=\"search-field\" name=\"s\" placeholder=\"Search products...\">
```

### Correct
```php
<label for=\"search-field-<?php echo esc_attr( uniqid() ); ?>\" class=\"screen-reader-text\">
  <?php esc_html_e( 'Search products', 'textdomain' ); ?>
</label>
<input
  id=\"search-field-<?php echo esc_attr( uniqid() ); ?>\"
  type=\"search\"
  class=\"search-field\"
  name=\"s\"
  placeholder=\"<?php esc_attr_e( 'Search products...', 'textdomain' ); ?>\"
>
```""",
        "check": "Click directly on the text label. The browser should immediately move focus into the corresponding form field.",
    },
    {
        "rule_id": "aria-hidden-focus",
        "title_shopify": "Prevent focusable elements inside aria-hidden containers in Shopify",
        "title_wp": "Prevent focusable elements inside aria-hidden containers in WordPress",
        "summary": "Containers hidden with `aria-hidden=\"true\"` must not contain links, buttons, or inputs that can receive keyboard focus.",
        "wrong": "Drawer carts, sliding mobile navigation panels, or modal dialogs that are closed often keep `aria-hidden=\"true\"` while inner buttons remain in the tab order.",
        "affects": "Keyboard navigators tab into invisible elements on the page while screen readers remain completely silent, causing disorientation.",
        "fix_shopify": "When closing drawer carts or popups, apply the HTML `hidden` attribute or `inert` attribute, or remove inner elements from the focus order with `tabindex=\"-1\"`.",
        "fix_wp": "In JavaScript mobile menu or modal scripts, add the `inert` attribute to closed off-canvas menus or toggle `display: none` when the drawer is collapsed.",
        "code_shopify": """### Incorrect
```liquid
<div id=\"CartDrawer\" aria-hidden=\"true\" class=\"cart-drawer is-closed\">
  <button type=\"button\" class=\"btn-checkout\">Checkout</button>
</div>
```

### Correct
```liquid
<div id=\"CartDrawer\" aria-hidden=\"true\" inert class=\"cart-drawer is-closed\" hidden>
  <button type=\"button\" tabindex=\"-1\" class=\"btn-checkout\">Checkout</button>
</div>
```""",
        "code_wp": """### Incorrect
```javascript
// Opening/closing mobile menu without managing inert
mobileMenu.setAttribute('aria-hidden', 'true');
```

### Correct
```javascript
// Correctly disable focus when off-canvas is closed
mobileMenu.setAttribute('aria-hidden', 'true');
mobileMenu.setAttribute('inert', '');
mobileMenu.style.display = 'none';
```""",
        "check": "Close the drawer or modal, then press Tab repeatedly through the page. Verify that focus never lands on hidden links or buttons inside the closed panel.",
    },
    {
        "rule_id": "document-title",
        "title_shopify": "Ensure every page has a descriptive document title in Shopify",
        "title_wp": "Ensure every page has a descriptive document title in WordPress",
        "summary": "Every web page must have an informative `<title>` tag in the `<head>` explaining its specific purpose.",
        "wrong": "Pages with missing, generic, or duplicate `<title>` elements leave users unaware of which section or product they are viewing.",
        "affects": "Screen reader users rely on the page title as the very first information announced when a new page loads. It also affects browser tab identification.",
        "fix_shopify": "In `layout/theme.liquid`, format the `<title>` tag to include the current page title, current pagination page, and the store name.",
        "fix_wp": "Ensure `add_theme_support( 'title-tag' );` is registered in `functions.php` and avoid hardcoding static title strings in `header.php`.",
        "code_shopify": """### Incorrect
```liquid
<title>My Store</title>
```

### Correct
```liquid
<title>
  {{ page_title }}
  {%- if current_tags %} &ndash; tagged \"{{ current_tags | join: ', ' }}\"{% endif -%}
  {%- if current_page != 1 %} &ndash; Page {{ current_page }}{% endif -%}
  {%- unless page_title contains shop.name %} &ndash; {{ shop.name }}{% endunless -%}
</title>
```""",
        "code_wp": """### Incorrect
```php
<head>
  <title>My WordPress Website</title>
</head>
```

### Correct
```php
// In functions.php
function theme_slug_setup() {
    add_theme_support( 'title-tag' );
}
add_action( 'after_setup_theme', 'theme_slug_setup' );

// In header.php
<head>
  <?php wp_head(); ?>
</head>
```""",
        "check": "Look at the browser tab title on product, collection, and search pages. Verify that the title accurately identifies the specific page content.",
    },
    {
        "rule_id": "html-has-lang",
        "title_shopify": "Add the lang attribute to the html element in Shopify",
        "title_wp": "Add the lang attribute to the html element in WordPress",
        "summary": "The root `<html>` element must declare the document's primary language using a valid `lang` attribute.",
        "wrong": "Omitting the `lang` attribute causes assistive technology to default to the user's system language, mispronouncing words.",
        "affects": "Screen reader users hear English text spoken using French or German phonetic engines, making text unintelligible.",
        "fix_shopify": "In `layout/theme.liquid`, set `<html lang=\"{{ request.locale.iso_code }}\">`.",
        "fix_wp": "In `header.php`, output `<html <?php language_attributes(); ?>>`.",
        "code_shopify": """### Incorrect
```liquid
<!doctype html>
<html>
```

### Correct
```liquid
<!doctype html>
<html class=\"no-js\" lang=\"{{ request.locale.iso_code }}\">
```""",
        "code_wp": """### Incorrect
```php
<!DOCTYPE html>
<html>
```

### Correct
```php
<!DOCTYPE html>
<html <?php language_attributes(); ?>>
```""",
        "check": "Inspect the root element in DevTools Elements panel. Verify `<html lang=\"en\">` (or matching store locale) is present.",
    },
    {
        "rule_id": "html-lang-valid",
        "title_shopify": "Use a valid BCP 47 language code on the html element in Shopify",
        "title_wp": "Use a valid BCP 47 language code on the html element in WordPress",
        "summary": "The language code specified on `<html>` must be an authorized BCP 47 language tag.",
        "wrong": "Values like `lang=\"english\"` or malformed region codes cause speech synthesis software to fail.",
        "affects": "Screen readers fall back to default speech synthesizers or report language parsing errors.",
        "fix_shopify": "Always use Shopify's native `request.locale.iso_code` object rather than hardcoded language strings.",
        "fix_wp": "Use WordPress's native `language_attributes()` function which extracts valid codes configured in General Settings.",
        "code_shopify": """### Incorrect
```liquid
<html lang=\"english\">
```

### Correct
```liquid
<html lang=\"{{ request.locale.iso_code }}\">
```""",
        "code_wp": """### Incorrect
```php
<html lang=\"en_US_custom\">
```

### Correct
```php
<html <?php language_attributes(); ?>>
```""",
        "check": "Validate the `lang` tag against the IANA language subtag registry (e.g. `en`, `en-US`, `fr`, `de`).",
    },
    {
        "rule_id": "form-field-multiple-labels",
        "title_shopify": "Resolve duplicate or multiple labels for form inputs in Shopify",
        "title_wp": "Resolve duplicate or multiple labels for form inputs in WordPress",
        "summary": "Form inputs should be associated with exactly one primary label element to avoid conflicting instructions.",
        "wrong": "Having two `<label for=\"field-id\">` elements referencing the same input can cause screen readers to announce both repeatedly or miss instructions.",
        "affects": "Screen reader users receive confusing or duplicated announcements when navigating into the input field.",
        "fix_shopify": "Keep one primary `<label>`. Move extra helper text or requirements into a `<span>` and link it using `aria-describedby`.",
        "fix_wp": "Ensure form builders and custom theme templates do not output redundant label tags for the same input ID.",
        "code_shopify": """### Incorrect
```liquid
<label for=\"customer-email\">Email</label>
<input id=\"customer-email\" type=\"email\">
<label for=\"customer-email\">We will never share your email</label>
```

### Correct
```liquid
<label for=\"customer-email\">Email</label>
<input id=\"customer-email\" type=\"email\" aria-describedby=\"customer-email-hint\">
<span id=\"customer-email-hint\" class=\"field-hint\">We will never share your email</span>
```""",
        "code_wp": """### Incorrect
```php
<label for=\"user-login\">Username</label>
<label for=\"user-login\">Enter your username or email</label>
<input id=\"user-login\" name=\"log\" type=\"text\">
```

### Correct
```php
<label for=\"user-login\"><?php esc_html_e( 'Username', 'textdomain' ); ?></label>
<input id=\"user-login\" name=\"log\" type=\"text\" aria-describedby=\"user-login-desc\">
<span id=\"user-login-desc\" class=\"description\"><?php esc_html_e( 'Enter your username or email', 'textdomain' ); ?></span>
```""",
        "check": "Search the template DOM for `for=\"[input-id]\"` and confirm exactly one `<label>` tag matches that ID.",
    },
    {
        "rule_id": "frame-title",
        "title_shopify": "Add informative title attributes to iframes in Shopify",
        "title_wp": "Add informative title attributes to iframes in WordPress",
        "summary": "Every `<iframe>` embedding videos, maps, or widgets must include an accessible `title` attribute.",
        "wrong": "Iframes without titles are announced merely as 'frame', leaving users unaware of the third-party content embedded.",
        "affects": "Screen reader users browsing by landmarks or frames cannot decide whether to enter or skip the frame.",
        "fix_shopify": "Add `title=\"{{ section.settings.video_title | escape }}\"` to all video embed or app iframes in Liquid section templates.",
        "fix_wp": "Add a `title` attribute to iframe blocks or filter oEmbed HTML in `functions.php` to inject titles on YouTube and Vimeo embeds.",
        "code_shopify": """### Incorrect
```liquid
<iframe src=\"https://www.youtube.com/embed/{{ video_id }}\"></iframe>
```

### Correct
```liquid
<iframe
  src=\"https://www.youtube.com/embed/{{ video_id }}\"
  title=\"{{ 'sections.video.embed_title' | t: title: section.settings.heading | escape }}\"
  loading=\"lazy\"
></iframe>
```""",
        "code_wp": """### Incorrect
```php
<iframe src=\"https://maps.google.com/embed...\"></iframe>
```

### Correct
```php
<iframe
  src=\"https://maps.google.com/embed...\"
  title=\"<?php esc_attr_e( 'Store location map', 'textdomain' ); ?>\"
  loading=\"lazy\"
></iframe>
```""",
        "check": "Inspect each `<iframe>` element in DevTools and confirm a clear, descriptive `title` attribute exists.",
    },
    {
        "rule_id": "input-image-alt",
        "title_shopify": "Add alt text to image submit buttons in Shopify",
        "title_wp": "Add alt text to image submit buttons in WordPress",
        "summary": "Inputs with `type=\"image\"` function as submit buttons and require descriptive `alt` text.",
        "wrong": "An `<input type=\"image\">` missing `alt` text has no accessible name for screen readers.",
        "affects": "Screen reader users cannot identify the button's action and hear only 'Image button, unlabelled'.",
        "fix_shopify": "Add `alt=\"{{ 'general.search.submit' | t }}\"` to any image input buttons.",
        "fix_wp": "Add `alt=\"<?php esc_attr_e( 'Submit', 'textdomain' ); ?>\"` to image buttons.",
        "code_shopify": """### Incorrect
```liquid
<input type=\"image\" src=\"{{ 'search-icon.png' | asset_url }}\">
```

### Correct
```liquid
<input type=\"image\" src=\"{{ 'search-icon.png' | asset_url }}\" alt=\"{{ 'general.search.submit' | t }}\">
```""",
        "code_wp": """### Incorrect
```php
<input type=\"image\" src=\"<?php echo esc_url( $btn_img ); ?>\">
```

### Correct
```php
<input type=\"image\" src=\"<?php echo esc_url( $btn_img ); ?>\" alt=\"<?php esc_attr_e( 'Search products', 'textdomain' ); ?>\">
```""",
        "check": "Inspect `<input type=\"image\">` elements and confirm `alt` attribute is non-empty and descriptive.",
    },
    {
        "rule_id": "input-button-name",
        "title_shopify": "Ensure input buttons have discernible text values in Shopify",
        "title_wp": "Ensure input buttons have discernible text values in WordPress",
        "summary": "Inputs with `type=\"button\"`, `type=\"submit\"`, or `type=\"reset\"` must have a non-empty `value` attribute.",
        "wrong": "An input button with empty `value=\"\"` has no readable label for assistive technologies.",
        "affects": "Screen reader users cannot tell what action submitting the form will trigger.",
        "fix_shopify": "Provide a descriptive `value=\"{{ 'sections.cart.checkout' | t }}\"`.",
        "fix_wp": "Provide a translated `value=\"<?php esc_attr_e( 'Place order', 'woocommerce' ); ?>\"`.",
        "code_shopify": """### Incorrect
```liquid
<input type=\"submit\" value=\"\">
```

### Correct
```liquid
<input type=\"submit\" value=\"{{ 'sections.cart.checkout' | t }}\" class=\"btn-primary\">
```""",
        "code_wp": """### Incorrect
```php
<input type=\"submit\" value=\"\">
```

### Correct
```php
<input type=\"submit\" value=\"<?php esc_attr_e( 'Apply coupon', 'woocommerce' ); ?>\" class=\"button\">
```""",
        "check": "Verify `value` attribute is non-empty and describes the submission result.",
    },
    {
        "rule_id": "list",
        "title_shopify": "Ensure ul and ol list containers only contain li elements in Shopify",
        "title_wp": "Ensure ul and ol list containers only contain li elements in WordPress",
        "summary": "`<ul>` and `<ol>` tags must contain only `<li>` elements, `<script>`, or `<template>` tags.",
        "wrong": "Placing `<div>` directly inside `<ul>` breaks list semantics and item numbering.",
        "affects": "Screen readers announce incorrect item counts or stop announcing list structure.",
        "fix_shopify": "Move wrapping containers inside the `<li>` tag in collection and navigation loops.",
        "fix_wp": "Ensure custom menu walkers and post loop templates do not inject `<div>` as direct children of `<ul>`.",
        "code_shopify": """### Incorrect
```liquid
<ul class=\"product-grid\">
  <div class=\"grid-row\">
    <li>Product 1</li>
  </div>
</ul>
```

### Correct
```liquid
<ul class=\"product-grid\">
  <li class=\"product-grid__item\">
    <div class=\"product-card\">Product 1</div>
  </li>
</ul>
```""",
        "code_wp": """### Incorrect
```php
<ul class=\"custom-nav\">
  <span class=\"nav-group\">
    <li><a href=\"#\">Home</a></li>
  </span>
</ul>
```

### Correct
```php
<ul class=\"custom-nav\">
  <li class=\"nav-item\"><a href=\"#\">Home</a></li>
</ul>
```""",
        "check": "Validate HTML using W3C validator or DevTools to verify all direct children of `<ul>` and `<ol>` are `<li>` tags.",
    },
    {
        "rule_id": "listitem",
        "title_shopify": "Wrap all li elements inside parent ul or ol containers in Shopify",
        "title_wp": "Wrap all li elements inside parent ul or ol containers in WordPress",
        "summary": "Every `<li>` element must be directly contained within a parent `<ul>` or `<ol>`.",
        "wrong": "Orphaned `<li>` elements outside of list tags violate HTML grammar and break accessibility semantics.",
        "affects": "Screen readers cannot announce 'List of X items' or announce the position of the item in the list.",
        "fix_shopify": "Verify Liquid loops rendering `<li>` tags are surrounded by `<ul>` and `</ul>` outside the `for` loop.",
        "fix_wp": "Wrap dynamic post lists and block query loops in proper `<ul>` containers.",
        "code_shopify": """### Incorrect
```liquid
{% for link in linklists.main-menu.links %}
  <li class=\"menu-item\"><a href=\"{{ link.url }}\">{{ link.title }}</a></li>
{% endfor %}
```

### Correct
```liquid
<ul class=\"menu-list\">
  {% for link in linklists.main-menu.links %}
    <li class=\"menu-item\"><a href=\"{{ link.url }}\">{{ link.title }}</a></li>
  {% endfor %}
</ul>
```""",
        "code_wp": """### Incorrect
```php
<?php while ( have_posts() ) : the_post(); ?>
  <li><?php the_title(); ?></li>
<?php endwhile; ?>
```

### Correct
```php
<ul class=\"post-list\">
  <?php while ( have_posts() ) : the_post(); ?>
    <li><?php the_title(); ?></li>
  <?php endwhile; ?>
</ul>
```""",
        "check": "Inspect each `<li>` element in DevTools and confirm its immediate parent is `<ul>` or `<ol>`.",
    },
    {
        "rule_id": "meta-viewport",
        "title_shopify": "Enable zooming and scaling on mobile viewports in Shopify",
        "title_wp": "Enable zooming and scaling on mobile viewports in WordPress",
        "summary": "Do not disable user zooming with `user-scalable=no` or `maximum-scale=1.0`.",
        "wrong": "Disabling pinch-to-zoom on mobile devices prevents customers with low vision from reading product details.",
        "affects": "Users with low vision who rely on browser zoom cannot enlarge text or photos.",
        "fix_shopify": "In `layout/theme.liquid`, set `<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">`.",
        "fix_wp": "In `header.php`, ensure the viewport meta tag does not contain `user-scalable=no` or `maximum-scale=1`.",
        "code_shopify": """### Incorrect
```liquid
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no\">
```

### Correct
```liquid
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
```""",
        "code_wp": """### Incorrect
```php
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, user-scalable=0\">
```

### Correct
```php
<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">
```""",
        "check": "Open the storefront on a mobile device and pinch to zoom in. Verify the page enlarges smoothly.",
    },
    {
        "rule_id": "select-name",
        "title_shopify": "Provide accessible names for select dropdowns in Shopify",
        "title_wp": "Provide accessible names for select dropdowns in WordPress",
        "summary": "Every `<select>` element must have an associated `<label>` or `aria-label`.",
        "wrong": "Variant pickers, quantity dropdowns, and currency selectors without labels leave users unaware of what is being chosen.",
        "affects": "Screen reader users hear 'Combo box, unlabelled' without knowing if they are choosing size, color, or shipping.",
        "fix_shopify": "Add `<label for=\"Option-{{ section.id }}-{{ forloop.index0 }}\">{{ option.name }}</label>`.",
        "fix_wp": "Ensure WooCommerce variant select dropdowns have explicit `<label for=\"...\">` tags.",
        "code_shopify": """### Incorrect
```liquid
<select name=\"id\">
  {% for variant in product.variants %}
    <option value=\"{{ variant.id }}\">{{ variant.title }}</option>
  {% endfor %}
</select>
```

### Correct
```liquid
<label for=\"ProductSelect-{{ section.id }}\" class=\"visually-hidden\">
  {{ 'products.product.select_variant' | t }}
</label>
<select id=\"ProductSelect-{{ section.id }}\" name=\"id\">
  {% for variant in product.variants %}
    <option value=\"{{ variant.id }}\">{{ variant.title }}</option>
  {% endfor %}
</select>
```""",
        "code_wp": """### Incorrect
```php
<select name=\"quantity\">
  <option value=\"1\">1</option>
</select>
```

### Correct
```php
<label for=\"cart-quantity-<?php echo esc_attr( $cart_item_key ); ?>\" class=\"screen-reader-text\">
  <?php esc_html_e( 'Quantity', 'woocommerce' ); ?>
</label>
<select id=\"cart-quantity-<?php echo esc_attr( $cart_item_key ); ?>\" name=\"quantity\">
  <option value=\"1\">1</option>
</select>
```""",
        "check": "Tab to the `<select>` dropdown using a screen reader. Confirm it announces the field name clearly (e.g. 'Size, combo box').",
    },
    {
        "rule_id": "bypass",
        "title_shopify": "Add a skip to content link in Shopify themes",
        "title_wp": "Add a skip to content link in WordPress themes",
        "summary": "Provide a skip link as the very first focusable element so keyboard users can bypass repetitive navigation.",
        "wrong": "Without a skip link, keyboard users must press Tab dozens of times across header menus before reaching the page content.",
        "affects": "People with motor disabilities or repetitive strain injury navigating via keyboard or switch controls.",
        "fix_shopify": "Place `<a href=\"#MainContent\" class=\"skip-to-content-link visually-hidden-focusable\">Skip to content</a>` at the top of `layout/theme.liquid`.",
        "fix_wp": "Add `<a class=\"skip-link screen-reader-text\" href=\"#primary\"><?php esc_html_e( 'Skip to content', 'textdomain' ); ?></a>` at the top of `header.php`.",
        "code_shopify": """### Incorrect
```liquid
<!-- No skip link before header -->
<header class=\"header\">...</header>
<main id=\"MainContent\">...</main>
```

### Correct
```liquid
<a href=\"#MainContent\" class=\"skip-to-content-link visually-hidden-focusable\">
  {{ 'accessibility.skip_to_text' | t }}
</a>
<header class=\"header\">...</header>
<main id=\"MainContent\" tabindex=\"-1\">...</main>
```""",
        "code_wp": """### Incorrect
```php
<!-- Direct header output -->
<?php get_header(); ?>
<main id=\"primary\">...</main>
```

### Correct
```php
<a class=\"skip-link screen-reader-text\" href=\"#primary\">
  <?php esc_html_e( 'Skip to content', 'textdomain' ); ?>
</a>
<header class=\"site-header\">...</header>
<main id=\"primary\" tabindex=\"-1\">...</main>
```""",
        "check": "Reload the page and press the Tab key once. The 'Skip to content' link must become visible with a clear focus ring, and pressing Enter must move focus directly to the main element.",
    },
    {
        "rule_id": "target-size",
        "title_shopify": "Ensure interactive touch targets meet minimum 24px size in Shopify",
        "title_wp": "Ensure interactive touch targets meet minimum 24px size in WordPress",
        "summary": "Interactive targets like buttons, links, and pagination swatches must measure at least 24×24px (WCAG 2.2 Level AA).",
        "wrong": "Tiny close buttons, swatch dots, or footer links packed together trigger accidental clicks.",
        "affects": "People with motor tremors, limited dexterity, or anyone using a mobile touchscreen.",
        "fix_shopify": "Set `min-width: 44px; min-height: 44px;` in theme CSS or use padding so the clickable area meets requirements.",
        "fix_wp": "Add padding and minimum dimensions to theme buttons, category pills, and social icon links.",
        "code_shopify": """### Incorrect
```css
.color-swatch {
  width: 16px;
  height: 16px;
  margin: 2px;
}
```

### Correct
```css
.color-swatch {
  width: 28px;
  height: 28px;
  padding: 8px; /* Extends tap target to > 44px */
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```""",
        "code_wp": """### Incorrect
```css
.pagination a {
  padding: 2px 4px;
  font-size: 12px;
}
```

### Correct
```css
.pagination a {
  min-width: 40px;
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
}
```""",
        "check": "Inspect interactive elements in DevTools or turn on mobile emulation. Confirm target dimensions are at least 24×24px (recommended 44×44px).",
    },
    {
        "rule_id": "svg-img-alt",
        "title_shopify": "Provide accessible text for SVG images with role img in Shopify",
        "title_wp": "Provide accessible text for SVG images with role img in WordPress",
        "summary": "SVGs with `role=\"img\"` must contain an accessible label or `<title>` element.",
        "wrong": "Screen readers announce an unlabelled SVG with `role=\"img\"` as an empty graphic without context.",
        "affects": "Screen reader users miss branding, icons representing payment methods, or rating stars.",
        "fix_shopify": "Add `<title id=\"svg-title-{{ id }}\">Label</title>` inside the SVG and reference it with `aria-labelledby=\"svg-title-{{ id }}\"`.",
        "fix_wp": "Include a `<title>` tag inside inline SVG assets or specify `aria-label=\"Description\"` on the SVG tag.",
        "code_shopify": """### Incorrect
```liquid
<svg role=\"img\" viewBox=\"0 0 24 24\">
  <path d=\"...\"></path>
</svg>
```

### Correct
```liquid
<svg role=\"img\" viewBox=\"0 0 24 24\" aria-labelledby=\"store-logo-title\">
  <title id=\"store-logo-title\">{{ shop.name }} logo</title>
  <path d=\"...\"></path>
</svg>
```""",
        "code_wp": """### Incorrect
```php
<svg role=\"img\" class=\"star-rating\">...</svg>
```

### Correct
```php
<svg role=\"img\" class=\"star-rating\" aria-label=\"<?php echo esc_attr( sprintf( __( 'Rating: %s out of 5 stars', 'textdomain' ), $rating ) ); ?>\">
  <path d=\"...\"></path>
</svg>
```""",
        "check": "Test with a screen reader to confirm the SVG announces the descriptive title rather than remaining silent.",
    },
    {
        "rule_id": "aria-required-attr",
        "title_shopify": "Include all required ARIA attributes for custom widgets in Shopify",
        "title_wp": "Include all required ARIA attributes for custom widgets in WordPress",
        "summary": "Elements using custom ARIA roles (e.g. `checkbox`, `combobox`, `slider`) must include all mandatory attributes.",
        "wrong": "Omitting required attributes like `aria-checked` on `role=\"checkbox\"` causes assistive technologies to malfunction.",
        "affects": "Screen reader users cannot tell whether a filter is selected or what range a slider represents.",
        "fix_shopify": "Ensure custom variant swatches or filter toggles initialize all required ARIA state attributes.",
        "fix_wp": "Verify theme tab scripts or accordions output required attributes like `aria-selected` and `aria-controls`.",
        "code_shopify": """### Incorrect
```liquid
<div role=\"checkbox\" class=\"filter-checkbox\">
  In stock
</div>
```

### Correct
```liquid
<div
  role=\"checkbox\"
  aria-checked=\"{% if filter_value.active %}true{% else %}false{% endif %}\"
  tabindex=\"0\"
  class=\"filter-checkbox\"
>
  {{ filter_value.label }}
</div>
```""",
        "code_wp": """### Incorrect
```php
<div role=\"slider\" class=\"price-slider\"></div>
```

### Correct
```php
<div
  role=\"slider\"
  aria-valuemin=\"0\"
  aria-valuemax=\"1000\"
  aria-valuenow=\"<?php echo esc_attr( $current_price ); ?>\"
  tabindex=\"0\"
  class=\"price-slider\"
></div>
```""",
        "check": "Validate custom controls with axe DevTools to confirm all required ARIA attributes are present and dynamically updated.",
    },
    {
        "rule_id": "aria-roles",
        "title_shopify": "Use valid WAI-ARIA role values in Shopify themes",
        "title_wp": "Use valid WAI-ARIA role values in WordPress themes",
        "summary": "The `role` attribute must contain a valid, non-deprecated WAI-ARIA role string.",
        "wrong": "Misspelled roles like `role=\"btn\"` or `role=\"nav\"` are ignored by assistive tools.",
        "affects": "Screen readers treat the element as generic text or a generic container, discarding accessibility semantics.",
        "fix_shopify": "Correct typo roles to standard W3C roles such as `button`, `navigation`, `banner`, or `complementary`.",
        "fix_wp": "Update theme template files and block attributes to use valid ARIA role specifications.",
        "code_shopify": """### Incorrect
```liquid
<div role=\"btn\" class=\"cart-button\">Cart</div>
```

### Correct
```liquid
<button type=\"button\" class=\"cart-button\">Cart</button>
<!-- Or if div is mandatory -->
<div role=\"button\" tabindex=\"0\" class=\"cart-button\">Cart</div>
```""",
        "code_wp": """### Incorrect
```php
<nav role=\"navigation-bar\">...</nav>
```

### Correct
```php
<nav aria-label=\"<?php esc_attr_e( 'Main Menu', 'textdomain' ); ?>\">...</nav>
```""",
        "check": "Inspect elements with `role` attributes in DevTools. Check against the W3C WAI-ARIA Roles specification.",
    },
    {
        "rule_id": "aria-allowed-attr",
        "title_shopify": "Use only permitted ARIA attributes on HTML elements in Shopify",
        "title_wp": "Use only permitted ARIA attributes on HTML elements in WordPress",
        "summary": "ARIA attributes must only be used on elements whose role supports them.",
        "wrong": "Using attributes like `aria-expanded` on `role=\"link\"` or elements that do not support expansion creates conflicting semantics.",
        "affects": "Screen readers may ignore the attribute or report incorrect widget behavior to the user.",
        "fix_shopify": "Use native semantic elements like `<button>` instead of `<a>` for expandable menus and accordions.",
        "fix_wp": "Use `<button type=\"button\" aria-expanded=\"false\">` for dropdown menu triggers instead of anchor links.",
        "code_shopify": """### Incorrect
```liquid
<a href=\"#\" aria-expanded=\"false\" class=\"accordion-trigger\">Shipping Info</a>
```

### Correct
```liquid
<button type=\"button\" aria-expanded=\"false\" aria-controls=\"ShippingPanel\" class=\"accordion-trigger\">
  Shipping Info
</button>
```""",
        "code_wp": """### Incorrect
```php
<span aria-expanded=\"false\" class=\"dropdown-toggle\">Categories</span>
```

### Correct
```php
<button type=\"button\" aria-expanded=\"false\" class=\"dropdown-toggle\">
  <?php esc_html_e( 'Categories', 'textdomain' ); ?>
</button>
```""",
        "check": "Run axe DevTools and verify that no 'aria-allowed-attr' violations are reported for interactive components.",
    },
    {
        "rule_id": "duplicate-id-aria",
        "title_shopify": "Ensure IDs referenced by ARIA attributes are unique in Shopify",
        "title_wp": "Ensure IDs referenced by ARIA attributes are unique in WordPress",
        "summary": "IDs targeted by `aria-labelledby`, `aria-describedby`, or `aria-controls` must be unique across the entire DOM.",
        "wrong": "When multiple elements share the same ID, assistive technology can only associate the very first matching node.",
        "affects": "Screen readers announce the wrong product name, price, or modal description.",
        "fix_shopify": "Append Liquid's `{{ section.id }}` or `{{ forloop.index }}` to generate unique IDs across repeating product cards.",
        "fix_wp": "Append `get_the_ID()` or block client ID to ensure all element IDs in loops are completely unique.",
        "code_shopify": """### Incorrect
```liquid
{% for product in collection.products %}
  <h3 id=\"product-title\">{{ product.title }}</h3>
  <button aria-labelledby=\"product-title\">Quick Add</button>
{% endfor %}
```

### Correct
```liquid
{% for product in collection.products %}
  <h3 id=\"product-title-{{ section.id }}-{{ product.id }}\">{{ product.title }}</h3>
  <button aria-labelledby=\"product-title-{{ section.id }}-{{ product.id }}\">Quick Add</button>
{% endfor %}
```""",
        "code_wp": """### Incorrect
```php
<?php while ( have_posts() ) : the_post(); ?>
  <h3 id=\"post-title\"><?php the_title(); ?></h3>
  <a href=\"<?php the_permalink(); ?>\" aria-labelledby=\"post-title\">Read</a>
<?php endwhile; ?>
```

### Correct
```php
<?php while ( have_posts() ) : the_post(); ?>
  <h3 id=\"post-title-<?php the_ID(); ?>\"><?php the_title(); ?></h3>
  <a href=\"<?php the_permalink(); ?>\" aria-labelledby=\"post-title-<?php the_ID(); ?>\">Read</a>
<?php endwhile; ?>
```""",
        "check": "Inspect the page with DevTools Console using `document.querySelectorAll('[id=\"your-id\"]')` to confirm no duplicates exist.",
    },
    {
        "rule_id": "nested-interactive",
        "title_shopify": "Avoid nesting interactive controls within each other in Shopify",
        "title_wp": "Avoid nesting interactive controls within each other in WordPress",
        "summary": "Do not nest buttons, links, or inputs inside other clickable buttons or links.",
        "wrong": "Nesting a `<button>` inside an `<a>` tag creates invalid HTML and unpredictable keyboard/screen reader focus.",
        "affects": "Keyboard and screen reader users cannot activate the inner button, or clicking activates both actions simultaneously.",
        "fix_shopify": "Restructure the card so the anchor wraps only the product title or media, and the button sits as an adjacent sibling.",
        "fix_wp": "Separate clickable post card links from inner category pills or bookmark buttons.",
        "code_shopify": """### Incorrect
```liquid
<a href=\"{{ product.url }}\" class=\"product-card\">
  <h2>{{ product.title }}</h2>
  <button type=\"button\" class=\"quick-add\">Add to Cart</button>
</a>
```

### Correct
```liquid
<div class=\"product-card\">
  <h2><a href=\"{{ product.url }}\">{{ product.title }}</a></h2>
  <button type=\"button\" class=\"quick-add\">Add to Cart</button>
</div>
```""",
        "code_wp": """### Incorrect
```php
<a href=\"<?php the_permalink(); ?>\" class=\"post-card\">
  <h2><?php the_title(); ?></h2>
  <a href=\"/category/news\" class=\"badge\">News</a>
</a>
```

### Correct
```php
<div class=\"post-card\">
  <h2><a href=\"<?php the_permalink(); ?>\"><?php the_title(); ?></a></h2>
  <a href=\"/category/news\" class=\"badge\">News</a>
</div>
```""",
        "check": "Run an axe audit or inspect the DOM to confirm no `<a>` tag contains another `<a>`, `<button>`, or `<input>`.",
    },
]

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "guides")
os.makedirs(OUTPUT_DIR, exist_ok=True)

count = 0
for g in GUIDES:
    rule_id = g["rule_id"]
    for platform in ["shopify", "wordpress"]:
        title = g["title_shopify"] if platform == "shopify" else g["title_wp"]
        platform_name = "Shopify" if platform == "shopify" else "WordPress"
        fix_text = g["fix_shopify"] if platform == "shopify" else g["fix_wp"]
        code_text = g["code_shopify"] if platform == "shopify" else g["code_wp"]
        slug = f"{platform}-{rule_id}"
        filename = f"{slug}.md"
        filepath = os.path.join(OUTPUT_DIR, filename)

        content = f"""---
rule_id: {rule_id}
platform: {platform}
title: {title}
summary: {g["summary"]}
reviewed_at: 2026-10-15T00:00:00Z
---

# {title}

## What's wrong

{g["wrong"]}

## Who it affects

{g["affects"]}

## How to fix on {platform_name}

{fix_text}

## Code example

{code_text}

## How to check your fix

{g["check"]}
"""
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
        count += 1

print(f"Successfully generated {count} fix guides in {OUTPUT_DIR}")
