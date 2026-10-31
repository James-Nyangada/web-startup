<?php
/**
 * Clean uninstall procedure for EveryVisitor plugin.
 *
 * Removes all settings, API keys, and transients from the WordPress database
 * when the plugin is deleted via the WordPress Admin.
 *
 * @package EveryVisitor
 */

// If uninstall not called from WordPress, exit.
if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

$everyvisitor_options = array(
	'everyvisitor_api_key',
	'everyvisitor_site_id',
	'everyvisitor_site_name',
	'everyvisitor_api_url',
	'everyvisitor_app_url',
	'everyvisitor_connected_at',
	'everyvisitor_score',
	'everyvisitor_critical_count',
	'everyvisitor_serious_count',
	'everyvisitor_last_scan_at',
);

if ( is_multisite() ) {
	global $wpdb;
	$everyvisitor_blog_ids      = $wpdb->get_col( $wpdb->prepare( "SELECT blog_id FROM {$wpdb->blogs} WHERE site_id = %d", (int) $wpdb->siteid ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching -- One-off uninstall query across the network.
	$everyvisitor_original_blog = get_current_blog_id();

	if ( ! empty( $everyvisitor_blog_ids ) ) {
		foreach ( $everyvisitor_blog_ids as $everyvisitor_blog_id ) {
			switch_to_blog( (int) $everyvisitor_blog_id );
			foreach ( $everyvisitor_options as $everyvisitor_option_name ) {
				delete_option( $everyvisitor_option_name );
			}
			delete_transient( 'everyvisitor_site_summary' );
			delete_transient( 'everyvisitor_connect_state' );
		}
		switch_to_blog( $everyvisitor_original_blog );
	}
} else {
	foreach ( $everyvisitor_options as $everyvisitor_option_name ) {
		delete_option( $everyvisitor_option_name );
	}
	delete_transient( 'everyvisitor_site_summary' );
	delete_transient( 'everyvisitor_connect_state' );
}
