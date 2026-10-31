<?php
/**
 * EveryVisitor API Client.
 *
 * @package EveryVisitor
 */

if ( ! defined( 'WPINC' ) ) {
	die;
}

/**
 * Client for the EveryVisitor REST API.
 */
class EveryVisitor_API {

	/**
	 * Get the configured API endpoint base URL.
	 */
	public function get_api_url(): string {
		$url = get_option( 'everyvisitor_api_url', EVERYVISITOR_DEFAULT_API_URL );
		return untrailingslashit( $url );
	}

	/**
	 * Get the configured web app URL.
	 */
	public function get_app_url(): string {
		$url = get_option( 'everyvisitor_app_url', EVERYVISITOR_DEFAULT_APP_URL );
		return untrailingslashit( $url );
	}

	/**
	 * Retrieve saved API key.
	 */
	public function get_api_key(): string {
		return (string) get_option( 'everyvisitor_api_key', '' );
	}

	/**
	 * Mask an API key for safe display in the admin UI (e.g. psk_••••••••••••••••••••••••xxxx).
	 *
	 * @param string $key Full API key.
	 * @return string
	 */
	public function mask_api_key( string $key ): string {
		if ( empty( $key ) ) {
			return '';
		}
		$len = strlen( $key );
		if ( $len <= 8 ) {
			return str_repeat( '•', $len );
		}
		$prefix = substr( $key, 0, 4 );
		$suffix = substr( $key, -4 );
		$dots   = str_repeat( '•', min( 28, max( 8, $len - 8 ) ) );
		return $prefix . $dots . $suffix;
	}

	/**
	 * Perform an authenticated HTTP request to the EveryVisitor API.
	 *
	 * @param string               $endpoint Relative endpoint path, e.g. '/v1/sites/connect'.
	 * @param string               $method   'GET' or 'POST'.
	 * @param array<string, mixed> $body     Request body for POST.
	 * @param string|null          $override_key Optional explicit API key.
	 * @return array<string, mixed>|WP_Error
	 */
	public function request( string $endpoint, string $method = 'GET', array $body = array(), ?string $override_key = null ) {
		$api_key = $override_key ?? $this->get_api_key();
		if ( empty( $api_key ) ) {
			return new WP_Error( 'missing_api_key', __( 'No API key configured.', 'everyvisitor' ) );
		}

		$url = $this->get_api_url() . '/' . ltrim( $endpoint, '/' );

		$headers = array(
			'Authorization' => 'Bearer ' . $api_key,
			'Accept'        => 'application/json',
			'User-Agent'    => 'EveryVisitor-WordPress/' . EVERYVISITOR_VERSION . '; ' . home_url(),
		);

		$args = array(
			'method'      => $method,
			'headers'     => $headers,
			'timeout'     => 15,
			'redirection' => 2,
			'httpversion' => '1.1',
			'sslverify'   => true,
		);

		if ( 'POST' === $method ) {
			$headers['Content-Type'] = 'application/json; charset=utf-8';
			$args['headers']         = $headers;
			$args['body']            = wp_json_encode( $body );
		}

		$response = wp_remote_request( $url, $args );

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$raw_body    = wp_remote_retrieve_body( $response );
		$decoded     = json_decode( $raw_body, true );

		if ( $status_code < 200 || $status_code >= 300 ) {
			$message = __( 'API request failed.', 'everyvisitor' );
			if ( is_array( $decoded ) && isset( $decoded['error']['message'] ) ) {
				$message = sanitize_text_field( $decoded['error']['message'] );
			}
			return new WP_Error(
				'api_error_' . $status_code,
				$message,
				array(
					'status' => $status_code,
					'data'   => $decoded,
				)
			);
		}

		return is_array( $decoded ) ? $decoded : array();
	}

	/**
	 * Extract normalized summary metrics from API response.
	 *
	 * @param array<string, mixed> $data Full API response 'data' array.
	 * @return array<string, mixed>
	 */
	private function extract_metrics( array $data ): array {
		$site_data = $data['site'] ?? array();

		// Score.
		$score = null;
		if ( isset( $data['score'] ) && null !== $data['score'] ) {
			$score = (int) $data['score'];
		} elseif ( isset( $site_data['score'] ) && null !== $site_data['score'] ) {
			$score = (int) $site_data['score'];
		}

		// Critical Count.
		$critical = 0;
		if ( isset( $data['severityCounts']['critical'] ) ) {
			$critical = (int) $data['severityCounts']['critical'];
		} elseif ( isset( $data['openCritical'] ) ) {
			$critical = (int) $data['openCritical'];
		} elseif ( isset( $site_data['openCritical'] ) ) {
			$critical = (int) $site_data['openCritical'];
		}

		// Serious Count.
		$serious = 0;
		if ( isset( $data['severityCounts']['serious'] ) ) {
			$serious = (int) $data['severityCounts']['serious'];
		} elseif ( isset( $data['openSerious'] ) ) {
			$serious = (int) $data['openSerious'];
		} elseif ( isset( $site_data['openSerious'] ) ) {
			$serious = (int) $site_data['openSerious'];
		}

		// Last Scan Date.
		$last_scan_at = '';
		if ( ! empty( $data['latestScanSummary']['finishedAt'] ) ) {
			$last_scan_at = (string) $data['latestScanSummary']['finishedAt'];
		} elseif ( ! empty( $data['lastScanAt'] ) ) {
			$last_scan_at = (string) $data['lastScanAt'];
		} elseif ( ! empty( $site_data['lastScanAt'] ) ) {
			$last_scan_at = (string) $site_data['lastScanAt'];
		}

		return array(
			'score'        => $score,
			'openCritical' => $critical,
			'openSerious'  => $serious,
			'lastScanAt'   => $last_scan_at,
		);
	}

	/**
	 * Exchange an ephemeral authorization code for an API key and site details.
	 *
	 * @param string $code Single-use connect exchange code.
	 * @return array<string, mixed>|WP_Error
	 */
	public function exchange_connect_code( string $code ) {
		$url = $this->get_api_url() . '/v1/sites/connect/exchange';

		$args = array(
			'method'      => 'POST',
			'headers'     => array(
				'Content-Type' => 'application/json; charset=utf-8',
				'Accept'       => 'application/json',
				'User-Agent'   => 'EveryVisitor-WordPress/' . EVERYVISITOR_VERSION . '; ' . home_url(),
			),
			'body'        => wp_json_encode( array( 'code' => $code ) ),
			'timeout'     => 15,
			'redirection' => 2,
			'httpversion' => '1.1',
			'sslverify'   => true,
		);

		$response = wp_remote_request( $url, $args );

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$raw_body    = wp_remote_retrieve_body( $response );
		$decoded     = json_decode( $raw_body, true );

		if ( $status_code < 200 || $status_code >= 300 ) {
			$message = __( 'Failed to exchange connection code.', 'everyvisitor' );
			if ( is_array( $decoded ) && isset( $decoded['error']['message'] ) ) {
				$message = sanitize_text_field( $decoded['error']['message'] );
			}
			return new WP_Error( 'code_exchange_failed', $message, array( 'status' => $status_code ) );
		}

		$api_key = $decoded['data']['apiKey']['secret'] ?? '';
		if ( empty( $api_key ) ) {
			return new WP_Error( 'invalid_exchange_response', __( 'No API key returned in exchange.', 'everyvisitor' ) );
		}

		return $this->connect_site( $api_key );
	}

	/**
	 * Connect and auto-verify WordPress site with EveryVisitor.
	 *
	 * @param string $api_key Provided API key.
	 * @return array<string, mixed>|WP_Error
	 */
	public function connect_site( string $api_key ) {
		$site_url  = home_url();
		$site_name = get_bloginfo( 'name' );

		$res = $this->request(
			'/v1/sites/connect',
			'POST',
			array(
				'url'      => $site_url,
				'name'     => $site_name,
				'platform' => 'wordpress',
			),
			$api_key
		);

		if ( is_wp_error( $res ) ) {
			return $res;
		}

		$data      = $res['data'] ?? array();
		$site_data = $data['site'] ?? array();
		if ( empty( $site_data['id'] ) ) {
			return new WP_Error( 'invalid_response', __( 'Invalid response received from EveryVisitor.', 'everyvisitor' ) );
		}

		$metrics = $this->extract_metrics( $data );

		// Store connection details in options.
		update_option( 'everyvisitor_api_key', sanitize_text_field( $api_key ) );
		update_option( 'everyvisitor_site_id', sanitize_text_field( $site_data['id'] ) );
		update_option( 'everyvisitor_site_name', sanitize_text_field( $site_data['name'] ?? $site_name ) );
		update_option( 'everyvisitor_connected_at', current_time( 'mysql' ) );

		if ( null !== $metrics['score'] ) {
			update_option( 'everyvisitor_score', (int) $metrics['score'] );
		}
		update_option( 'everyvisitor_critical_count', (int) $metrics['openCritical'] );
		update_option( 'everyvisitor_serious_count', (int) $metrics['openSerious'] );
		if ( ! empty( $metrics['lastScanAt'] ) ) {
			update_option( 'everyvisitor_last_scan_at', sanitize_text_field( $metrics['lastScanAt'] ) );
		}

		$cached_summary = array_merge( $site_data, $metrics );
		set_transient( 'everyvisitor_site_summary', $cached_summary, 5 * MINUTE_IN_SECONDS );

		return $cached_summary;
	}

	/**
	 * Fetch latest site summary, optionally using transient cache.
	 *
	 * @param bool $force_refresh Skip transient cache.
	 * @return array<string, mixed>|WP_Error
	 */
	public function get_site_summary( bool $force_refresh = false ) {
		$site_id = get_option( 'everyvisitor_site_id', '' );
		if ( empty( $site_id ) ) {
			return new WP_Error( 'not_connected', __( 'Site is not connected to EveryVisitor.', 'everyvisitor' ) );
		}

		if ( ! $force_refresh ) {
			$cached = get_transient( 'everyvisitor_site_summary' );
			if ( is_array( $cached ) && ! empty( $cached ) ) {
				return $cached;
			}
		}

		$res = $this->request( '/v1/sites/' . rawurlencode( $site_id ), 'GET' );
		if ( is_wp_error( $res ) ) {
			return $res;
		}

		$data      = $res['data'] ?? array();
		$site_data = $data['site'] ?? array();
		$metrics   = $this->extract_metrics( $data );

		if ( null !== $metrics['score'] ) {
			update_option( 'everyvisitor_score', (int) $metrics['score'] );
		}
		update_option( 'everyvisitor_critical_count', (int) $metrics['openCritical'] );
		update_option( 'everyvisitor_serious_count', (int) $metrics['openSerious'] );
		if ( ! empty( $metrics['lastScanAt'] ) ) {
			update_option( 'everyvisitor_last_scan_at', sanitize_text_field( $metrics['lastScanAt'] ) );
		}

		$cached_summary = array_merge( $site_data, $metrics );
		set_transient( 'everyvisitor_site_summary', $cached_summary, 5 * MINUTE_IN_SECONDS );

		return $cached_summary;
	}

	/**
	 * Trigger an on-demand scan for this site.
	 *
	 * @return array<string, mixed>|WP_Error
	 */
	public function trigger_scan() {
		$site_id = get_option( 'everyvisitor_site_id', '' );
		if ( empty( $site_id ) ) {
			return new WP_Error( 'not_connected', __( 'Site is not connected to EveryVisitor.', 'everyvisitor' ) );
		}

		$res = $this->request(
			'/v1/sites/' . rawurlencode( $site_id ) . '/scans',
			'POST',
			array( 'trigger' => 'plugin' )
		);

		if ( is_wp_error( $res ) ) {
			return $res;
		}

		// Invalidate cached summary to reflect new scan in progress.
		delete_transient( 'everyvisitor_site_summary' );

		return $res['data'] ?? array();
	}
}
