<?php
/**
 * Plugin Name:       EveryVisitor Accessibility
 * Plugin URI:        https://everyvisitor.app
 * Description:       Automated WCAG accessibility monitoring and issue tracking for WordPress. Connect to EveryVisitor for continuous compliance checks, actionable fix instructions, and admin dashboard reporting.
 * Version:           1.0.0
 * Requires at least: 6.2
 * Requires PHP:      8.1
 * Author:            EveryVisitor
 * Author URI:        https://everyvisitor.app
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       everyvisitor
 * Domain Path:       /languages
 *
 * @package EveryVisitor
 */

// If this file is called directly, abort.
if ( ! defined( 'WPINC' ) ) {
	die;
}

define( 'EVERYVISITOR_VERSION', '1.0.0' );
define( 'EVERYVISITOR_PLUGIN_FILE', __FILE__ );
define( 'EVERYVISITOR_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'EVERYVISITOR_PLUGIN_URL', plugin_dir_url( __FILE__ ) );
define( 'EVERYVISITOR_DEFAULT_API_URL', 'https://api.everyvisitor.app' );
define( 'EVERYVISITOR_DEFAULT_APP_URL', 'https://everyvisitor.app' );

require_once EVERYVISITOR_PLUGIN_DIR . 'includes/class-everyvisitor-api.php';
require_once EVERYVISITOR_PLUGIN_DIR . 'includes/class-everyvisitor-settings.php';
require_once EVERYVISITOR_PLUGIN_DIR . 'includes/class-everyvisitor-widget.php';
require_once EVERYVISITOR_PLUGIN_DIR . 'includes/class-everyvisitor.php';

/**
 * Bootstrap the plugin.
 */
function everyvisitor_init(): EveryVisitor {
	return EveryVisitor::get_instance();
}
add_action( 'plugins_loaded', 'everyvisitor_init' );

// Activation hook.
register_activation_hook(
	__FILE__,
	function () {
		// Set default options if not present.
		if ( false === get_option( 'everyvisitor_api_url' ) ) {
			add_option( 'everyvisitor_api_url', EVERYVISITOR_DEFAULT_API_URL );
		}
		if ( false === get_option( 'everyvisitor_app_url' ) ) {
			add_option( 'everyvisitor_app_url', EVERYVISITOR_DEFAULT_APP_URL );
		}
	}
);

// Deactivation hook.
register_deactivation_hook(
	__FILE__,
	function () {
		// Transient caches pruned on deactivation.
		delete_transient( 'everyvisitor_site_summary' );
	}
);
