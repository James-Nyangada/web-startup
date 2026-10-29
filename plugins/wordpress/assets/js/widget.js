/**
 * EveryVisitor Dashboard Widget Script
 */

/* global jQuery, everyvisitorWidget, location */
(function($) {
	'use strict';

	$(function() {
		var $btn = $('#everyvisitor-scan-now-btn');
		var $status = $('#everyvisitor-scan-status');

		if (!$btn.length) {
			return;
		}

		$btn.on('click', function(e) {
			e.preventDefault();

			var defaultText = $btn.text();
			$btn.prop('disabled', true).text(everyvisitorWidget.strings.scanning);
			$status.removeClass('everyvisitor-status-success everyvisitor-status-error')
				.text(everyvisitorWidget.strings.initiating)
				.show();

			$.post(everyvisitorWidget.ajax_url, {
				action: 'everyvisitor_scan_now',
				nonce: everyvisitorWidget.nonce
			}, function(response) {
				if (response && response.success) {
					$status.addClass('everyvisitor-status-success')
						.empty().append($('<span>').text('✓ ' + everyvisitorWidget.strings.queued));
					setTimeout(function() {
						location.reload();
					}, 3000);
				} else {
					var msg = (response && response.data && response.data.message) ? response.data.message : everyvisitorWidget.strings.failed;
					$status.addClass('everyvisitor-status-error')
						.empty().append($('<span>').text('✗ ' + msg));
					$btn.prop('disabled', false).text(defaultText);
				}
			}).fail(function() {
				$status.addClass('everyvisitor-status-error')
					.empty().append($('<span>').text('✗ ' + everyvisitorWidget.strings.networkError));
				$btn.prop('disabled', false).text(defaultText);
			});
		});
	});
})(jQuery);
