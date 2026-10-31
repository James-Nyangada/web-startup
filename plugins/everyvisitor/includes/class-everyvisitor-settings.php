<?php
/**
 * EveryVisitor Settings Page Handler.
 *
 * @package EveryVisitor
 */

if ( ! defined( 'WPINC' ) ) {
	die;
}

/**
 * Settings page, connect handshake and form handling.
 */
class EveryVisitor_Settings {

	/**
	 * API Client.
	 *
	 * @var EveryVisitor_API
	 */
	private $api;

	/**
	 * Constructor.
	 *
	 * @param EveryVisitor_API $api API instance.
	 */
	public function __construct( EveryVisitor_API $api ) {
		$this->api = $api;

		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_init', array( $this, 'handle_handshake_callback' ) );
		add_action( 'admin_init', array( $this, 'handle_form_submissions' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
	}

	/**
	 * Register Settings sub-menu item.
	 */
	public function register_menu(): void {
		add_options_page(
			__( 'EveryVisitor Settings', 'everyvisitor' ),
			__( 'EveryVisitor', 'everyvisitor' ),
			'manage_options',
			'everyvisitor',
			array( $this, 'render_page' )
		);
	}

	/**
	 * Enqueue settings page CSS.
	 *
	 * @param string $hook Page hook.
	 */
	public function enqueue_assets( string $hook ): void {
		if ( 'settings_page_everyvisitor' !== $hook ) {
			return;
		}

		wp_enqueue_style(
			'everyvisitor-settings-css',
			EVERYVISITOR_PLUGIN_URL . 'assets/css/settings.css',
			array(),
			EVERYVISITOR_VERSION
		);
	}

	/**
	 * Handle return from EveryVisitor sign-in handshake (/connect/start callback).
	 */
	public function handle_handshake_callback(): void {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- The return from EveryVisitor cannot carry a WordPress nonce; it is authenticated by the single-use state token compared below.
		if ( ! isset( $_GET['everyvisitor_connected'] ) || '1' !== $_GET['everyvisitor_connected'] ) {
			if ( isset( $_GET['page'] ) && 'everyvisitor' === $_GET['page'] && isset( $_GET['handshake_success'] ) && '1' === $_GET['handshake_success'] ) {
				add_settings_error(
					'everyvisitor_messages',
					'connect_success',
					__( 'Connected successfully via sign-in handshake! Ownership is verified.', 'everyvisitor' ),
					'updated'
				);
			}
			return;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Unauthorized user.', 'everyvisitor' ) );
		}

		$returned_state = isset( $_GET['state'] ) ? sanitize_text_field( wp_unslash( $_GET['state'] ) ) : '';
		$saved_state    = get_transient( 'everyvisitor_connect_state' );

		if ( empty( $saved_state ) || empty( $returned_state ) || ! hash_equals( $saved_state, $returned_state ) ) {
			delete_transient( 'everyvisitor_connect_state' );
			add_settings_error(
				'everyvisitor_messages',
				'invalid_handshake',
				__( 'Connection handshake failed anti-forgery security check. Please try again.', 'everyvisitor' ),
				'error'
			);
			return;
		}

		delete_transient( 'everyvisitor_connect_state' );

		$code    = isset( $_GET['code'] ) ? sanitize_text_field( wp_unslash( $_GET['code'] ) ) : '';
		$api_key = isset( $_GET['api_key'] ) ? sanitize_text_field( wp_unslash( $_GET['api_key'] ) ) : '';

		if ( ! empty( $code ) ) {
			$result = $this->api->exchange_connect_code( $code );
		} elseif ( ! empty( $api_key ) ) {
			$result = $this->api->connect_site( $api_key );
		} else {
			add_settings_error(
				'everyvisitor_messages',
				'missing_key',
				__( 'No authorization code or API key returned during handshake authorization.', 'everyvisitor' ),
				'error'
			);
			return;
		}
		if ( is_wp_error( $result ) ) {
			add_settings_error(
				'everyvisitor_messages',
				'handshake_failed',
				sprintf(
					/* translators: %s: Error message */
					__( 'Handshake connection failed: %s', 'everyvisitor' ),
					$result->get_error_message()
				),
				'error'
			);
		} else {
			wp_safe_redirect(
				add_query_arg(
					array(
						'page'              => 'everyvisitor',
						'handshake_success' => '1',
					),
					admin_url( 'options-general.php' )
				)
			);
			exit;
		}
		// phpcs:enable WordPress.Security.NonceVerification.Recommended
	}

	/**
	 * Process form submissions (Manual Connect, Disconnect).
	 */
	public function handle_form_submissions(): void {
		if ( ! isset( $_POST['everyvisitor_action'] ) ) {
			return;
		}

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Unauthorized user.', 'everyvisitor' ) );
		}

		$action = sanitize_text_field( wp_unslash( $_POST['everyvisitor_action'] ) );

		if ( 'connect' === $action ) {
			check_admin_referer( 'everyvisitor_connect_action', 'everyvisitor_nonce' );

			$raw_key = isset( $_POST['everyvisitor_api_key'] ) ? sanitize_text_field( wp_unslash( $_POST['everyvisitor_api_key'] ) ) : '';

			if ( empty( $raw_key ) ) {
				add_settings_error( 'everyvisitor_messages', 'empty_key', __( 'Please provide an API key.', 'everyvisitor' ), 'error' );
				return;
			}

			if ( isset( $_POST['everyvisitor_api_url'] ) ) {
				$custom_api_url = esc_url_raw( wp_unslash( $_POST['everyvisitor_api_url'] ) );
				if ( ! empty( $custom_api_url ) ) {
					update_option( 'everyvisitor_api_url', untrailingslashit( $custom_api_url ) );
				}
			}

			$result = $this->api->connect_site( $raw_key );
			if ( is_wp_error( $result ) ) {
				add_settings_error(
					'everyvisitor_messages',
					'connect_failed',
					sprintf(
						/* translators: %s: Error message */
						__( 'Connection failed: %s', 'everyvisitor' ),
						$result->get_error_message()
					),
					'error'
				);
			} else {
				add_settings_error(
					'everyvisitor_messages',
					'connect_success',
					__( 'Connected successfully! Site ownership is verified and continuous monitoring is active.', 'everyvisitor' ),
					'updated'
				);
			}
		} elseif ( 'disconnect' === $action ) {
			check_admin_referer( 'everyvisitor_disconnect_action', 'everyvisitor_nonce' );

			delete_option( 'everyvisitor_api_key' );
			delete_option( 'everyvisitor_site_id' );
			delete_option( 'everyvisitor_site_name' );
			delete_option( 'everyvisitor_connected_at' );
			delete_option( 'everyvisitor_score' );
			delete_option( 'everyvisitor_critical_count' );
			delete_option( 'everyvisitor_serious_count' );
			delete_option( 'everyvisitor_last_scan_at' );
			delete_transient( 'everyvisitor_site_summary' );
			delete_transient( 'everyvisitor_connect_state' );

			add_settings_error(
				'everyvisitor_messages',
				'disconnect_success',
				__( 'Disconnected from EveryVisitor.', 'everyvisitor' ),
				'updated'
			);
		}
	}

	/**
	 * Render settings page.
	 */
	public function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$api_key      = $this->api->get_api_key();
		$site_id      = get_option( 'everyvisitor_site_id', '' );
		$is_connected = ! empty( $api_key ) && ! empty( $site_id );
		$score        = get_option( 'everyvisitor_score', null );
		$critical     = get_option( 'everyvisitor_critical_count', 0 );
		$serious      = get_option( 'everyvisitor_serious_count', 0 );
		$last_scan    = get_option( 'everyvisitor_last_scan_at', '' );
		$app_url      = $this->api->get_app_url();
		$api_url      = $this->api->get_api_url();
		$view_url     = $is_connected ? $app_url . '/sites/' . rawurlencode( $site_id ) : $app_url;

		// Generate handshake URL for 1-Click Connect.
		$state = wp_generate_password( 32, false );
		set_transient( 'everyvisitor_connect_state', $state, 15 * MINUTE_IN_SECONDS );
		$return_url    = admin_url( 'options-general.php?page=everyvisitor' );
		$handshake_url = add_query_arg(
			array(
				'url'        => home_url(),
				'name'       => get_bloginfo( 'name' ),
				'platform'   => 'wordpress',
				'return_url' => $return_url,
				'state'      => $state,
			),
			$app_url . '/connect/start'
		);
		?>
		<div class="wrap everyvisitor-settings-wrap">
			<h1><?php esc_html_e( 'EveryVisitor Accessibility Settings', 'everyvisitor' ); ?></h1>
			<?php settings_errors( 'everyvisitor_messages' ); ?>

			<div class="everyvisitor-card">
				<?php if ( $is_connected ) : ?>
					<div class="everyvisitor-connected-header">
						<div>
							<span class="everyvisitor-badge-verified">
								● <?php esc_html_e( 'Connected & Verified', 'everyvisitor' ); ?>
							</span>
							<h2 class="everyvisitor-site-title">
								<?php echo esc_html( get_option( 'everyvisitor_site_name', get_bloginfo( 'name' ) ) ); ?>
							</h2>
							<p class="everyvisitor-site-meta">
								<?php
								/* translators: %s: Site ID */
								printf( esc_html__( 'Site ID: %s', 'everyvisitor' ), '<code>' . esc_html( $site_id ) . '</code>' );
								?>
							</p>
						</div>
						<div>
							<a href="<?php echo esc_url( $view_url ); ?>" target="_blank" rel="noopener noreferrer" class="button button-primary">
								<?php esc_html_e( 'Open in EveryVisitor App', 'everyvisitor' ); ?> &rarr;
							</a>
						</div>
					</div>

					<div class="everyvisitor-stats-grid">
						<div class="everyvisitor-stat-card">
							<div class="everyvisitor-stat-label"><?php esc_html_e( 'Accessibility Score', 'everyvisitor' ); ?></div>
							<div class="everyvisitor-stat-val" style="color: <?php echo null !== $score && $score >= 90 ? '#10b981' : ( null !== $score && $score >= 70 ? '#f59e0b' : '#ef4444' ); ?>;">
								<?php echo null !== $score ? esc_html( (string) $score ) : '&mdash;'; ?>
								<span style="font-size: 16px; font-weight: 400; color: #94a3b8;">/100</span>
							</div>
						</div>
						<div class="everyvisitor-stat-card">
							<div class="everyvisitor-stat-label"><?php esc_html_e( 'Critical Issues', 'everyvisitor' ); ?></div>
							<div class="everyvisitor-stat-val" style="color: <?php echo (int) $critical > 0 ? '#ef4444' : '#10b981'; ?>;">
								<?php echo esc_html( (string) $critical ); ?>
							</div>
						</div>
						<div class="everyvisitor-stat-card">
							<div class="everyvisitor-stat-label"><?php esc_html_e( 'Serious Issues', 'everyvisitor' ); ?></div>
							<div class="everyvisitor-stat-val" style="color: <?php echo (int) $serious > 0 ? '#f59e0b' : '#10b981'; ?>;">
								<?php echo esc_html( (string) $serious ); ?>
							</div>
						</div>
					</div>

					<table class="form-table" role="presentation">
						<tr>
							<th scope="row"><?php esc_html_e( 'Active API Key', 'everyvisitor' ); ?></th>
							<td>
								<code class="everyvisitor-code-box">
									<?php echo esc_html( $this->api->mask_api_key( $api_key ) ); ?>
								</code>
								<p class="description">
									<?php esc_html_e( 'Stored safely in your WordPress database. The full key secret is never redisplayed.', 'everyvisitor' ); ?>
								</p>
							</td>
						</tr>
						<tr>
							<th scope="row"><?php esc_html_e( 'Last Scan', 'everyvisitor' ); ?></th>
							<td>
								<p style="margin: 0;">
									<?php echo ! empty( $last_scan ) ? esc_html( date_i18n( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), strtotime( $last_scan ) ) ) : esc_html__( 'No scan run yet', 'everyvisitor' ); ?>
								</p>
							</td>
						</tr>
					</table>

					<div class="everyvisitor-card-footer">
						<form method="post" action="" onsubmit="return confirm('<?php echo esc_js( __( 'Are you sure you want to disconnect? Accessibility monitoring will pause.', 'everyvisitor' ) ); ?>');">
							<?php wp_nonce_field( 'everyvisitor_disconnect_action', 'everyvisitor_nonce' ); ?>
							<input type="hidden" name="everyvisitor_action" value="disconnect" />
							<button type="submit" class="button button-link-delete">
								<?php esc_html_e( 'Disconnect from EveryVisitor', 'everyvisitor' ); ?>
							</button>
						</form>
					</div>

				<?php else : ?>
					<h2 style="margin-top: 0; font-size: 20px;"><?php esc_html_e( 'Connect to EveryVisitor', 'everyvisitor' ); ?></h2>
					<p style="color: #475569; font-size: 14px; line-height: 1.6;">
						<?php esc_html_e( 'Connect your WordPress site to EveryVisitor for continuous WCAG accessibility audits and compliance tracking. Verification is automatic.', 'everyvisitor' ); ?>
					</p>

					<!-- Handshake 1-Click Connect Button -->
					<div class="everyvisitor-handshake-box">
						<h3 style="margin-top: 0; font-size: 16px; font-weight: 600;">
							<?php esc_html_e( 'Recommended: 1-Click Handshake', 'everyvisitor' ); ?>
						</h3>
						<p style="color: #64748b; font-size: 13px; margin: 6px 0 16px 0;">
							<?php esc_html_e( 'Sign in to EveryVisitor and authorize connection. A dedicated site key is issued and saved automatically.', 'everyvisitor' ); ?>
						</p>
						<a href="<?php echo esc_url( $handshake_url ); ?>" class="button button-primary button-hero">
							<?php esc_html_e( 'Connect with EveryVisitor &rarr;', 'everyvisitor' ); ?>
						</a>
					</div>

					<details style="margin-top: 16px; border-top: 1px solid #f0f0f1; padding-top: 16px;">
						<summary style="cursor: pointer; font-weight: 600; color: #475569;">
							<?php esc_html_e( 'Or connect manually by pasting an API key', 'everyvisitor' ); ?>
						</summary>

						<form method="post" action="" style="margin-top: 12px;">
							<?php wp_nonce_field( 'everyvisitor_connect_action', 'everyvisitor_nonce' ); ?>
							<input type="hidden" name="everyvisitor_action" value="connect" />

							<table class="form-table" role="presentation">
								<tr>
									<th scope="row">
										<label for="everyvisitor_api_key"><?php esc_html_e( 'API Key', 'everyvisitor' ); ?></label>
									</th>
									<td>
										<input type="password" id="everyvisitor_api_key" name="everyvisitor_api_key" class="regular-text" placeholder="psk_..." autocomplete="off" />
										<p class="description">
											<?php
											printf(
												/* translators: %s: Link to API keys */
												esc_html__( 'Generate a key in your %s.', 'everyvisitor' ),
												'<a href="' . esc_url( $app_url . '/settings/api-keys' ) . '" target="_blank" rel="noopener noreferrer">' . esc_html__( 'EveryVisitor Settings', 'everyvisitor' ) . '</a>'
											);
											?>
										</p>
									</td>
								</tr>
								<tr>
									<th scope="row">
										<label for="everyvisitor_api_url"><?php esc_html_e( 'API URL', 'everyvisitor' ); ?></label>
									</th>
									<td>
										<input type="url" id="everyvisitor_api_url" name="everyvisitor_api_url" class="regular-text" value="<?php echo esc_attr( $api_url ); ?>" />
										<p class="description">
											<?php esc_html_e( 'Default is https://api.everyvisitor.app (customise only for local testing).', 'everyvisitor' ); ?>
										</p>
									</td>
								</tr>
							</table>

							<p class="submit">
								<button type="submit" class="button button-secondary">
									<?php esc_html_e( 'Save Key & Connect', 'everyvisitor' ); ?>
								</button>
							</p>
						</form>
					</details>
				<?php endif; ?>
			</div>

			<!-- External Service Disclosure -->
			<div class="everyvisitor-disclosure-box">
				<strong><?php esc_html_e( 'External Service Notice:', 'everyvisitor' ); ?></strong>
				<?php
				printf(
					/* translators: 1: Service URL, 2: Terms URL, 3: Privacy URL */
					esc_html__( 'This plugin communicates with the external %1$s service to perform automated accessibility audits and retrieve WCAG compliance summaries. Read the %2$s and %3$s.', 'everyvisitor' ),
					'<a href="https://everyvisitor.app" target="_blank" rel="noopener noreferrer">EveryVisitor</a>',
					'<a href="https://everyvisitor.app/terms" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Terms of Service', 'everyvisitor' ) . '</a>',
					'<a href="https://everyvisitor.app/privacy" target="_blank" rel="noopener noreferrer">' . esc_html__( 'Privacy Policy', 'everyvisitor' ) . '</a>'
				);
				?>
			</div>
		</div>
		<?php
	}
}
