<?php
/**
 * Main plugin class.
 *
 * @package EveryVisitor
 */

if ( ! defined( 'WPINC' ) ) {
	die;
}

/**
 * Main plugin orchestration class.
 */
class EveryVisitor {

	/**
	 * Single instance of the plugin.
	 *
	 * @var EveryVisitor|null
	 */
	private static $instance = null;

	/**
	 * API client.
	 *
	 * @var EveryVisitor_API
	 */
	public $api;

	/**
	 * Settings handler.
	 *
	 * @var EveryVisitor_Settings
	 */
	public $settings;

	/**
	 * Widget handler.
	 *
	 * @var EveryVisitor_Widget
	 */
	public $widget;

	/**
	 * Main instance accessor.
	 */
	public static function get_instance(): EveryVisitor {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		$this->api      = new EveryVisitor_API();
		$this->settings = new EveryVisitor_Settings( $this->api );
		$this->widget   = new EveryVisitor_Widget( $this->api );

		add_action( 'admin_notices', array( $this, 'maybe_render_setup_notice' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( EVERYVISITOR_PLUGIN_FILE ), array( $this, 'add_action_links' ) );
	}

	/**
	 * Add "Settings" link to the WordPress plugins list table.
	 *
	 * @param array<string, string> $links Existing action links.
	 * @return array<string, string>
	 */
	public function add_action_links( array $links ): array {
		$settings_url  = admin_url( 'options-general.php?page=everyvisitor' );
		$settings_link = '<a href="' . esc_url( $settings_url ) . '">' . esc_html__( 'Settings', 'everyvisitor' ) . '</a>';
		array_unshift( $links, $settings_link );
		return $links;
	}

	/**
	 * Show admin notice if plugin is installed but API key is not connected.
	 */
	public function maybe_render_setup_notice(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$screen = get_current_screen();
		if ( $screen && 'settings_page_everyvisitor' === $screen->id ) {
			return; // Don't show on the plugin settings page itself.
		}

		$api_key = get_option( 'everyvisitor_api_key', '' );
		if ( empty( $api_key ) ) {
			$settings_url = admin_url( 'options-general.php?page=everyvisitor' );
			?>
			<div class="notice notice-info is-dismissible">
				<p>
					<strong><?php esc_html_e( 'EveryVisitor Accessibility:', 'everyvisitor' ); ?></strong>
					<?php esc_html_e( 'Connect your site to start automated WCAG accessibility monitoring.', 'everyvisitor' ); ?>
					<a href="<?php echo esc_url( $settings_url ); ?>" class="button button-secondary" style="margin-left: 8px;">
						<?php esc_html_e( 'Connect Now', 'everyvisitor' ); ?>
					</a>
				</p>
			</div>
			<?php
		}
	}
}
