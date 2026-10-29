<?php
/**
 * EveryVisitor Dashboard Widget.
 *
 * @package EveryVisitor
 */

if ( ! defined( 'WPINC' ) ) {
	die;
}

/**
 * WordPress dashboard widget and "Scan now" AJAX action.
 */
class EveryVisitor_Widget {

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

		add_action( 'wp_dashboard_setup', array( $this, 'register_dashboard_widget' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_widget_assets' ) );
		add_action( 'wp_ajax_everyvisitor_scan_now', array( $this, 'ajax_scan_now' ) );
	}

	/**
	 * Register Dashboard Widget in WordPress Admin.
	 */
	public function register_dashboard_widget(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		wp_add_dashboard_widget(
			'everyvisitor_accessibility_widget',
			__( 'EveryVisitor Accessibility', 'everyvisitor' ),
			array( $this, 'render_widget' )
		);
	}

	/**
	 * Enqueue assets for the dashboard widget.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public function enqueue_widget_assets( string $hook ): void {
		if ( 'index.php' !== $hook ) {
			return;
		}

		wp_enqueue_style(
			'everyvisitor-widget-css',
			EVERYVISITOR_PLUGIN_URL . 'assets/css/widget.css',
			array(),
			EVERYVISITOR_VERSION
		);

		wp_enqueue_script(
			'everyvisitor-widget-js',
			EVERYVISITOR_PLUGIN_URL . 'assets/js/widget.js',
			array( 'jquery' ),
			EVERYVISITOR_VERSION,
			true
		);

		wp_localize_script(
			'everyvisitor-widget-js',
			'everyvisitorWidget',
			array(
				'ajax_url' => admin_url( 'admin-ajax.php' ),
				'nonce'    => wp_create_nonce( 'everyvisitor_widget_nonce' ),
				'strings'  => array(
					'scanning'     => __( 'Queueing scan…', 'everyvisitor' ),
					'initiating'   => __( 'Initiating automated WCAG scan on EveryVisitor server…', 'everyvisitor' ),
					'queued'       => __( 'Scan queued successfully! Results will update shortly.', 'everyvisitor' ),
					'failed'       => __( 'Scan request failed.', 'everyvisitor' ),
					'networkError' => __( 'Network error occurred.', 'everyvisitor' ),
				),
			)
		);
	}

	/**
	 * Render Dashboard Widget Content.
	 */
	public function render_widget(): void {
		$site_id = get_option( 'everyvisitor_site_id', '' );
		$api_key = $this->api->get_api_key();

		if ( empty( $api_key ) || empty( $site_id ) ) {
			$settings_url = admin_url( 'options-general.php?page=everyvisitor' );
			?>
			<div class="everyvisitor-unconnected-box">
				<p class="everyvisitor-unconnected-text">
					<?php esc_html_e( 'Connect your site to start monitoring WCAG accessibility compliance.', 'everyvisitor' ); ?>
				</p>
				<a href="<?php echo esc_url( $settings_url ); ?>" class="button button-primary">
					<?php esc_html_e( 'Connect EveryVisitor', 'everyvisitor' ); ?>
				</a>
			</div>
			<?php
			return;
		}

		$summary   = $this->api->get_site_summary();
		$score     = is_array( $summary ) && isset( $summary['score'] ) ? $summary['score'] : get_option( 'everyvisitor_score', null );
		$critical  = is_array( $summary ) && isset( $summary['openCritical'] ) ? (int) $summary['openCritical'] : (int) get_option( 'everyvisitor_critical_count', 0 );
		$serious   = is_array( $summary ) && isset( $summary['openSerious'] ) ? (int) $summary['openSerious'] : (int) get_option( 'everyvisitor_serious_count', 0 );
		$last_scan = is_array( $summary ) && ! empty( $summary['lastScanAt'] ) ? $summary['lastScanAt'] : get_option( 'everyvisitor_last_scan_at', '' );
		$app_url   = $this->api->get_app_url();
		$full_url  = $app_url . '/sites/' . rawurlencode( $site_id );

		$score_class = 'score-good';
		if ( null === $score || $score < 70 ) {
			$score_class = 'score-critical';
		} elseif ( $score < 90 ) {
			$score_class = 'score-warning';
		}
		?>
		<div class="everyvisitor-widget-inner">
			<div class="everyvisitor-widget-header">
				<div class="everyvisitor-score-display">
					<div class="everyvisitor-score-circle <?php echo esc_attr( $score_class ); ?>">
						<?php echo null !== $score ? esc_html( (string) $score ) : '&mdash;'; ?>
					</div>
					<div class="everyvisitor-score-meta">
						<span class="everyvisitor-score-label">
							<?php esc_html_e( 'Accessibility Score', 'everyvisitor' ); ?>
						</span>
						<span class="everyvisitor-score-status">
							<?php
							if ( null !== $score && $score >= 90 ) {
								esc_html_e( 'Good Compliance', 'everyvisitor' );
							} elseif ( null !== $score && $score >= 70 ) {
								esc_html_e( 'Needs Improvement', 'everyvisitor' );
							} elseif ( null !== $score ) {
								esc_html_e( 'Critical Attention Needed', 'everyvisitor' );
							} else {
								esc_html_e( 'Awaiting first scan', 'everyvisitor' );
							}
							?>
						</span>
					</div>
				</div>

				<button type="button" id="everyvisitor-scan-now-btn" class="button button-secondary">
					<?php esc_html_e( 'Scan now', 'everyvisitor' ); ?>
				</button>
			</div>

			<div class="everyvisitor-problems-grid">
				<div class="everyvisitor-problem-card">
					<div class="everyvisitor-problem-label"><?php esc_html_e( 'Critical Problems', 'everyvisitor' ); ?></div>
					<div class="everyvisitor-problem-count <?php echo $critical > 0 ? 'text-danger' : 'text-ok'; ?>">
						<?php echo esc_html( (string) $critical ); ?>
					</div>
				</div>
				<div class="everyvisitor-problem-card">
					<div class="everyvisitor-problem-label"><?php esc_html_e( 'Serious Problems', 'everyvisitor' ); ?></div>
					<div class="everyvisitor-problem-count <?php echo $serious > 0 ? 'text-warning' : 'text-ok'; ?>">
						<?php echo esc_html( (string) $serious ); ?>
					</div>
				</div>
			</div>

			<div id="everyvisitor-scan-status" class="everyvisitor-scan-status"></div>

			<div class="everyvisitor-widget-footer">
				<span>
					<?php
					if ( ! empty( $last_scan ) ) {
						/* translators: %s: Human-readable time difference */
						printf( esc_html__( 'Last scan: %s ago', 'everyvisitor' ), esc_html( human_time_diff( strtotime( $last_scan ), time() ) ) );
					} else {
						esc_html_e( 'Last scan: None', 'everyvisitor' );
					}
					?>
				</span>
				<a href="<?php echo esc_url( $full_url ); ?>" target="_blank" rel="noopener noreferrer">
					<?php esc_html_e( 'View full report &rarr;', 'everyvisitor' ); ?>
				</a>
			</div>
		</div>
		<?php
	}

	/**
	 * AJAX endpoint for "Scan now" button.
	 */
	public function ajax_scan_now(): void {
		check_ajax_referer( 'everyvisitor_widget_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', 'everyvisitor' ) ), 403 );
		}

		$result = $this->api->trigger_scan();
		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'message' => $result->get_error_message() ) );
		}

		wp_send_json_success( array( 'data' => $result ) );
	}
}
