=== EveryVisitor Accessibility ===
Contributors: everyvisitor
Tags: accessibility, a11y, wcag, compliance, ada
Requires at least: 6.2
Tested up to: 7.1
Stable tag: 1.0.0
Requires PHP: 8.1
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Automated WCAG accessibility monitoring, instant scoring, and issue tracking for WordPress without code modifications or frontend scripts.

== Description ==

EveryVisitor provides continuous, automated accessibility monitoring for your WordPress website.

Unlike overlay widgets that inject intrusive JavaScript into customer browsers, EveryVisitor performs non-intrusive server-side scans against WCAG 2.1 AA and WCAG 2.2 AA standards, giving website owners and developers clear, actionable fix guides.

### Key Features

* **Zero-Configuration Verification**: Connect with your API key to automatically verify site ownership. No DNS editing or meta tags required.
* **WordPress Admin Dashboard Widget**: See your live compliance score, open critical issues, and serious issues right on your WordPress dashboard.
* **On-Demand "Scan Now"**: Initiate immediate re-scans directly from your WordPress dashboard whenever you update templates or publish new content.
* **Non-Intrusive**: No scripts, banners, or widgets are injected into your public-facing frontend. Scanning takes place on EveryVisitor's high-speed cloud infrastructure.
* **Clean Uninstallation**: Leaves zero database clutter when deleted.

### External Service Disclosure

This plugin relies on the external cloud service **EveryVisitor** (https://everyvisitor.app) to conduct accessibility scans, calculate WCAG scores, and compile violation reports.

* **What data is sent**: When you connect the plugin or trigger a scan, your website's public home URL, site title, and requested scan parameters are transmitted to EveryVisitor's REST API.
* **How it works**: EveryVisitor's cloud engine crawls and analyzes your public pages using Axe-core and automated WCAG 2.2 evaluation rules.
* **Terms of Service**: https://everyvisitor.app/terms
* **Privacy Policy**: https://everyvisitor.app/privacy

== Installation ==

1. Upload the `everyvisitor` folder to your `/wp-content/plugins/` directory, or install it directly via the WordPress Plugins menu.
2. Activate the plugin through the **Plugins** screen in WordPress.
3. Navigate to **Settings > EveryVisitor**.
4. Click **Connect with EveryVisitor**, sign in or create an account, and click **Authorize & Connect**. Your site is verified immediately and the dashboard widget is active.
5. Prefer a manual setup? Paste an API key from your [EveryVisitor account](https://everyvisitor.app/settings/api-keys) and click **Save Key & Connect**.

== Frequently Asked Questions ==

= Does this plugin inject any scripts or overlays into my site? =
No. EveryVisitor never injects scripts, toolbars, or overlays into your visitors' browsers. All scans are performed externally by our cloud scanner.

= Where do I get an API key? =
Log in to your EveryVisitor account at https://everyvisitor.app and navigate to Settings > API keys to generate a key. Or skip the key and use the one-click **Connect with EveryVisitor** button.

= How often does EveryVisitor scan my site? =
In addition to on-demand scans triggered via the "Scan now" button in your WordPress dashboard, EveryVisitor runs automated scheduled scans according to your organization's plan settings (e.g., weekly or daily).

= What happens when I deactivate or uninstall the plugin? =
Deactivating pauses the dashboard widget. Uninstalling deletes all EveryVisitor options, API keys, and transients from your WordPress database.

== Screenshots ==

1. WordPress Admin Dashboard Widget displaying live accessibility score, open issues, and Scan Now button.
2. Settings screen with connection status, masked API key, and direct links to full report.

== Changelog ==

= 1.0.0 =
* Initial public release.
* Added automatic site ownership verification via REST API.
* Added WordPress Admin Dashboard widget with live WCAG score and issue counters.
* Added on-demand "Scan now" AJAX trigger.
* Added clean uninstallation routines.
