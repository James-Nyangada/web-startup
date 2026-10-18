/**
 * WCAG criteria mapping to official W3C Understanding documentation URLs.
 */
const WCAG_LINKS: Record<string, string> = {
  "1.1.1": "https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html",
  "1.2.1": "https://www.w3.org/WAI/WCAG21/Understanding/audio-only-and-video-only-prerecorded.html",
  "1.2.2": "https://www.w3.org/WAI/WCAG21/Understanding/captions-prerecorded.html",
  "1.2.3": "https://www.w3.org/WAI/WCAG21/Understanding/audio-description-or-media-alternative-prerecorded.html",
  "1.3.1": "https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html",
  "1.3.2": "https://www.w3.org/WAI/WCAG21/Understanding/meaningful-sequence.html",
  "1.3.3": "https://www.w3.org/WAI/WCAG21/Understanding/sensory-characteristics.html",
  "1.3.4": "https://www.w3.org/WAI/WCAG21/Understanding/orientation.html",
  "1.3.5": "https://www.w3.org/WAI/WCAG21/Understanding/identify-input-purpose.html",
  "1.4.1": "https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html",
  "1.4.2": "https://www.w3.org/WAI/WCAG21/Understanding/audio-control.html",
  "1.4.3": "https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html",
  "1.4.4": "https://www.w3.org/WAI/WCAG21/Understanding/resize-text.html",
  "1.4.5": "https://www.w3.org/WAI/WCAG21/Understanding/images-of-text.html",
  "1.4.10": "https://www.w3.org/WAI/WCAG21/Understanding/reflow.html",
  "1.4.11": "https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html",
  "1.4.12": "https://www.w3.org/WAI/WCAG21/Understanding/text-spacing.html",
  "1.4.13": "https://www.w3.org/WAI/WCAG21/Understanding/content-on-hover-or-focus.html",
  "2.1.1": "https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html",
  "2.1.2": "https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap.html",
  "2.1.4": "https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts.html",
  "2.2.1": "https://www.w3.org/WAI/WCAG21/Understanding/timing-adjustable.html",
  "2.2.2": "https://www.w3.org/WAI/WCAG21/Understanding/pause-stop-hide.html",
  "2.4.1": "https://www.w3.org/WAI/WCAG21/Understanding/bypass-blocks.html",
  "2.4.2": "https://www.w3.org/WAI/WCAG21/Understanding/page-titled.html",
  "2.4.3": "https://www.w3.org/WAI/WCAG21/Understanding/focus-order.html",
  "2.4.4": "https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html",
  "2.4.6": "https://www.w3.org/WAI/WCAG21/Understanding/headings-and-labels.html",
  "2.4.7": "https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html",
  "2.5.1": "https://www.w3.org/WAI/WCAG21/Understanding/pointer-gestures.html",
  "2.5.2": "https://www.w3.org/WAI/WCAG21/Understanding/pointer-cancellation.html",
  "2.5.3": "https://www.w3.org/WAI/WCAG21/Understanding/label-in-name.html",
  "2.5.8": "https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html",
  "3.1.1": "https://www.w3.org/WAI/WCAG21/Understanding/language-of-page.html",
  "3.1.2": "https://www.w3.org/WAI/WCAG21/Understanding/language-of-parts.html",
  "3.2.1": "https://www.w3.org/WAI/WCAG21/Understanding/on-focus.html",
  "3.2.2": "https://www.w3.org/WAI/WCAG21/Understanding/on-input.html",
  "3.3.1": "https://www.w3.org/WAI/WCAG21/Understanding/error-identification.html",
  "3.3.2": "https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions.html",
  "3.3.7": "https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry.html",
  "3.3.8": "https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html",
  "4.1.1": "https://www.w3.org/WAI/WCAG21/Understanding/parsing.html",
  "4.1.2": "https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html",
  "4.1.3": "https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html",
};

export function getWcagUnderstandingUrl(wcagString?: string): string {
  if (!wcagString) return "https://www.w3.org/WAI/standards-guidelines/wcag/";
  const match = wcagString.match(/\b(\d\.\d\.\d+)\b/);
  if (match && WCAG_LINKS[match[1]]) {
    return WCAG_LINKS[match[1]];
  }
  return "https://www.w3.org/WAI/standards-guidelines/wcag/";
}
