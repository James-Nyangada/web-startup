/**
 * Plain-English rule descriptions (P1-11), written for store owners and
 * agency clients, not accessibility experts. Technical metadata (WCAG criteria,
 * level, impact, help URL) is read from axe-core in catalog.ts so it never drifts.
 *
 * A test fails if axe-core can return a rule that has no entry here.
 */

export type Audience =
  | 'blind'
  | 'low-vision'
  | 'colour-blind'
  | 'deaf'
  | 'keyboard'
  | 'motor'
  | 'cognitive'
  | 'seizure'
  | 'voice-control';

export interface RuleContent {
  title: string;
  description: string;
  affects: Audience[];
}

export const AUDIENCE_LABELS: Record<Audience, string> = {
  blind: 'People who are blind and use a screen reader',
  'low-vision': 'People with low vision',
  'colour-blind': 'People with colour vision deficiency',
  deaf: 'People who are deaf or hard of hearing',
  keyboard: 'People who use a keyboard instead of a mouse',
  motor: 'People with limited dexterity or tremors',
  cognitive: 'People with cognitive or learning disabilities',
  seizure: 'People with photosensitive epilepsy or vestibular disorders',
  'voice-control': 'People who control their device by voice',
};

export const RULE_CONTENT: Record<string, RuleContent> = {
  'area-alt': {
    title: 'Clickable areas of an image map have no text description',
    description:
      'Each clickable area in an image map needs alt text saying where it goes. Without it, a screen reader can only read out the link address, if anything.',
    affects: ['blind', 'voice-control'],
  },
  'aria-allowed-attr': {
    title: 'An element uses ARIA attributes that do not belong on it',
    description:
      'ARIA attributes tell assistive technology what an element is and does. Using one on an element that does not support it gives screen readers wrong or confusing information.',
    affects: ['blind'],
  },
  'aria-braille-equivalent': {
    title: 'Braille-only label has no spoken equivalent',
    description:
      'An element has a braille label (aria-braillelabel) but no normal accessible name, so it is announced differently, or not at all, for people using speech instead of braille.',
    affects: ['blind'],
  },
  'aria-command-name': {
    title: 'A custom button, link or menu item has no name',
    description:
      'An element acting as a button, link or menu item has no text or label, so screen readers announce it only as "button" or "link" with no hint of what it does.',
    affects: ['blind', 'voice-control'],
  },
  'aria-conditional-attr': {
    title: 'An ARIA attribute is used in a way its role does not allow',
    description:
      'Some ARIA attributes are only valid in certain situations, for example aria-checked on a native checkbox. Used wrongly, they can contradict what the element really does.',
    affects: ['blind'],
  },
  'aria-deprecated-role': {
    title: 'An outdated ARIA role is used',
    description:
      'The element uses an ARIA role that has been removed from the specification. Assistive technology may ignore it or announce it inconsistently.',
    affects: ['blind'],
  },
  'aria-hidden-body': {
    title: 'The whole page is hidden from screen readers',
    description:
      'The page body is marked aria-hidden="true", which hides every piece of content from screen readers. The page is effectively blank for blind visitors.',
    affects: ['blind'],
  },
  'aria-hidden-focus': {
    title: 'Hidden content can still receive keyboard focus',
    description:
      'Content hidden from screen readers still contains links or buttons that can be tabbed to. Keyboard and screen reader users land on something that is announced as nothing.',
    affects: ['blind', 'keyboard'],
  },
  'aria-input-field-name': {
    title: 'A custom input field has no label',
    description:
      'A custom text box, combo box or slider has no accessible name, so people using a screen reader do not know what to enter.',
    affects: ['blind', 'voice-control'],
  },
  'aria-meter-name': {
    title: 'A meter has no label',
    description:
      'A meter (for example a strength or capacity gauge) has no name, so screen reader users hear a value with no idea what it measures.',
    affects: ['blind'],
  },
  'aria-progressbar-name': {
    title: 'A progress bar has no label',
    description:
      'A progress bar has no name, so screen reader users hear a percentage without knowing what is loading or progressing.',
    affects: ['blind'],
  },
  'aria-prohibited-attr': {
    title: 'A label is used where it is not allowed',
    description:
      'aria-label or aria-labelledby is set on an element type that cannot have one (such as a plain div or span). Many screen readers ignore it, so the intended label is never heard.',
    affects: ['blind'],
  },
  'aria-required-attr': {
    title: 'A custom control is missing a required ARIA attribute',
    description:
      'An element with an ARIA role is missing an attribute that role needs, for example a checkbox role without aria-checked, so its state is never announced.',
    affects: ['blind'],
  },
  'aria-required-children': {
    title: 'A list, menu or tab set is missing the items it should contain',
    description:
      'An element with a role such as list, menu or tablist does not contain the child roles it requires, so screen readers cannot present it as a working group of items.',
    affects: ['blind'],
  },
  'aria-required-parent': {
    title: 'An item is outside the list, menu or group it belongs to',
    description:
      'An element with a role such as listitem, menuitem or tab is not inside its required parent, so screen readers cannot tell how many items there are or where the user is.',
    affects: ['blind'],
  },
  'aria-roledescription': {
    title: 'A custom role description is on an element without a role',
    description:
      'aria-roledescription only works on elements that already have a meaningful role. Elsewhere it is ignored or confusing.',
    affects: ['blind'],
  },
  'aria-roles': {
    title: 'An element has an invalid ARIA role',
    description:
      'The role attribute contains a value that is not a real ARIA role (often a typo), so assistive technology cannot tell what the element is.',
    affects: ['blind'],
  },
  'aria-tab-name': {
    title: 'A tab has no label',
    description:
      'A tab in a tabbed panel has no text or label, so screen reader users cannot tell the tabs apart.',
    affects: ['blind', 'voice-control'],
  },
  'aria-toggle-field-name': {
    title: 'A custom switch or checkbox has no label',
    description:
      'A custom toggle, switch, checkbox or radio button has no name, so people hear "checkbox, not checked" with no idea what it controls.',
    affects: ['blind', 'voice-control'],
  },
  'aria-tooltip-name': {
    title: 'A tooltip has no text',
    description:
      'An element marked as a tooltip has no accessible text, so screen readers announce an empty tooltip.',
    affects: ['blind'],
  },
  'aria-valid-attr-value': {
    title: 'An ARIA attribute has an invalid value',
    description:
      'An ARIA attribute has a value it does not accept, for example aria-expanded="yes" or aria-labelledby pointing at an ID that does not exist. Screen readers may report the wrong state or no label.',
    affects: ['blind'],
  },
  'aria-valid-attr': {
    title: 'A misspelled or made-up ARIA attribute is used',
    description:
      'An attribute starting with aria- is not a real ARIA attribute, usually a typo. It does nothing, so whatever it was meant to communicate is lost.',
    affects: ['blind'],
  },
  'audio-caption': {
    title: 'Audio has no captions or transcript',
    description:
      'An audio element has no captions track. People who cannot hear miss everything that is said.',
    affects: ['deaf'],
  },
  'autocomplete-valid': {
    title: 'A form field has an incorrect autocomplete value',
    description:
      'A field such as name, email or address has an autocomplete value browsers do not recognise, so autofill does not work. Many people with memory or motor disabilities rely on autofill.',
    affects: ['cognitive', 'motor'],
  },
  'avoid-inline-spacing': {
    title: 'Text spacing is locked and cannot be adjusted',
    description:
      'Inline styles force letter, word or line spacing with !important, so people who need wider spacing to read cannot override it.',
    affects: ['low-vision', 'cognitive'],
  },
  blink: {
    title: 'Blinking text is used',
    description:
      'The page uses the outdated <blink> element. Blinking text is hard to read and can be distracting or harmful.',
    affects: ['cognitive', 'seizure', 'low-vision'],
  },
  'button-name': {
    title: 'A button has no text or label',
    description:
      'A button has no visible text and no label, often because it only contains an icon. Screen readers announce just "button", so people cannot tell what it does.',
    affects: ['blind', 'voice-control'],
  },
  bypass: {
    title: 'There is no way to skip past the menu to the main content',
    description:
      'The page has no skip link, main landmark or headings, so keyboard and screen reader users must move through every menu link on every page before reaching the content.',
    affects: ['keyboard', 'blind'],
  },
  'color-contrast': {
    title: 'Text does not stand out enough from its background',
    description:
      'The contrast between text and its background is below the WCAG minimum (4.5:1 for normal text, 3:1 for large text), making it hard or impossible to read for many people.',
    affects: ['low-vision', 'colour-blind'],
  },
  'css-orientation-lock': {
    title: 'The page only works in one screen orientation',
    description:
      'CSS forces the page into portrait or landscape. People whose device is mounted in a fixed position, for example on a wheelchair, may be unable to use it.',
    affects: ['motor', 'low-vision'],
  },
  'definition-list': {
    title: 'A definition list is built incorrectly',
    description:
      'A <dl> list contains elements other than <dt> and <dd> groups, so screen readers cannot announce the terms and definitions as pairs.',
    affects: ['blind'],
  },
  dlitem: {
    title: 'A definition term or description is outside its list',
    description:
      'A <dt> or <dd> element is not inside a <dl>, so screen readers do not present it as part of a list.',
    affects: ['blind'],
  },
  'document-title': {
    title: 'The page has no title',
    description:
      'The page has no <title>. The title is the first thing a screen reader announces and is what appears in browser tabs and history, so without it people cannot tell pages apart.',
    affects: ['blind', 'cognitive'],
  },
  'duplicate-id-aria': {
    title: 'Labels point to an ID that is used more than once',
    description:
      'An ID referenced by a label or ARIA attribute appears on more than one element, so the label may be attached to the wrong field.',
    affects: ['blind'],
  },
  'form-field-multiple-labels': {
    title: 'A form field has more than one label',
    description:
      'A field is connected to several <label> elements. Screen readers handle this inconsistently and may read only one of them.',
    affects: ['blind'],
  },
  'frame-focusable-content': {
    title: 'An embedded frame with interactive content cannot be reached by keyboard',
    description:
      'An iframe containing links or controls has tabindex="-1", so keyboard users cannot get into it.',
    affects: ['keyboard'],
  },
  'frame-title-unique': {
    title: 'Several embedded frames have the same title',
    description:
      'Two or more iframes share a title, so screen reader users cannot tell which embedded content is which.',
    affects: ['blind'],
  },
  'frame-title': {
    title: 'An embedded frame has no title',
    description:
      'An iframe (for example a video, map or widget) has no title, so screen reader users hear "frame" with no idea what it contains.',
    affects: ['blind'],
  },
  'html-has-lang': {
    title: 'The page does not say what language it is in',
    description:
      'The <html> element has no lang attribute, so screen readers may read the page with the wrong pronunciation, and translation tools may guess wrong.',
    affects: ['blind', 'cognitive'],
  },
  'html-lang-valid': {
    title: 'The page language code is not valid',
    description:
      'The lang attribute on <html> is not a real language code, so screen readers cannot pick the right voice.',
    affects: ['blind'],
  },
  'html-xml-lang-mismatch': {
    title: 'The page declares two different languages',
    description:
      'The lang and xml:lang attributes disagree, so assistive technology may use the wrong language.',
    affects: ['blind'],
  },
  'image-alt': {
    title: 'An image has no text description (alt text)',
    description:
      'An image has no alt attribute. Screen readers may read out the file name instead, or skip it. Informative images need a short description; purely decorative images need alt="".',
    affects: ['blind'],
  },
  'input-button-name': {
    title: 'A form button has no text',
    description:
      'An <input> button (submit, reset or button) has no value or label, so screen readers announce "button" with no hint of what it does.',
    affects: ['blind', 'voice-control'],
  },
  'input-image-alt': {
    title: 'An image used as a button has no text description',
    description:
      'An <input type="image"> button has no alt text, so people using a screen reader cannot tell what the button does.',
    affects: ['blind', 'voice-control'],
  },
  'label-content-name-mismatch': {
    title: "A control's hidden label does not match its visible text",
    description:
      'The accessible name of a button or link does not include its visible text. People using voice control say what they see ("click Buy now") and nothing happens.',
    affects: ['voice-control', 'blind'],
  },
  label: {
    title: 'A form field has no label',
    description:
      'A text box, checkbox or other field has no label connected to it, so screen reader users do not know what to type or choose. Placeholder text is not a substitute.',
    affects: ['blind', 'voice-control', 'cognitive'],
  },
  'link-in-text-block': {
    title: 'Links in text are only shown by colour',
    description:
      'Links inside a paragraph are distinguished from the surrounding text only by colour, with no underline or enough contrast. People who cannot see the colour difference cannot find them.',
    affects: ['colour-blind', 'low-vision'],
  },
  'link-name': {
    title: 'A link has no text',
    description:
      'A link has no text or label, often because it only contains an icon or an image without alt text. Screen readers announce "link" and possibly the web address.',
    affects: ['blind', 'voice-control'],
  },
  list: {
    title: 'A bulleted or numbered list is built incorrectly',
    description:
      'A <ul> or <ol> contains elements other than list items, so screen readers may announce the wrong number of items or not treat it as a list.',
    affects: ['blind'],
  },
  listitem: {
    title: 'A list item is outside a list',
    description:
      'An <li> element is not inside a <ul> or <ol>, so screen readers do not announce it as part of a list.',
    affects: ['blind'],
  },
  marquee: {
    title: 'Scrolling marquee text is used',
    description:
      'The page uses the outdated <marquee> element. Moving text is hard to read and cannot be paused.',
    affects: ['cognitive', 'low-vision', 'seizure'],
  },
  'meta-refresh': {
    title: 'The page refreshes or redirects on a timer',
    description:
      'The page reloads or redirects automatically after a delay. People who read slowly or use a screen reader can lose their place or be moved away before they finish.',
    affects: ['blind', 'cognitive', 'motor'],
  },
  'meta-viewport': {
    title: 'Zooming is disabled on mobile',
    description:
      'The viewport settings stop people from pinch-zooming. People with low vision rely on zoom to read.',
    affects: ['low-vision'],
  },
  'nested-interactive': {
    title: 'A clickable element is inside another clickable element',
    description:
      'A button or link contains another button or link. Screen readers may not announce the inner one, and keyboard users may not be able to reach it.',
    affects: ['blind', 'keyboard'],
  },
  'no-autoplay-audio': {
    title: 'Audio plays automatically',
    description:
      'Audio or video with sound starts by itself for more than 3 seconds without a way to stop it. It drowns out screen readers and is disorienting.',
    affects: ['blind', 'cognitive'],
  },
  'object-alt': {
    title: 'Embedded content has no text description',
    description:
      'An <object> element (embedded file or media) has no text alternative, so screen reader users do not know what it is.',
    affects: ['blind'],
  },
  'p-as-heading': {
    title: 'Bold text is used instead of a real heading',
    description:
      'A paragraph is styled to look like a heading but is not marked up as one, so screen reader users cannot jump to it or understand the page structure.',
    affects: ['blind', 'cognitive'],
  },
  'role-img-alt': {
    title: 'An element shown as an image has no text description',
    description:
      'An element with role="img" (often an icon or background image) has no label, so screen readers skip it or announce nothing useful.',
    affects: ['blind'],
  },
  'scrollable-region-focusable': {
    title: 'A scrolling area cannot be scrolled with the keyboard',
    description:
      'A box with its own scroll bar cannot receive keyboard focus, so keyboard users cannot scroll to see the hidden content.',
    affects: ['keyboard'],
  },
  'select-name': {
    title: 'A drop-down menu has no label',
    description:
      'A <select> drop-down has no label, so screen reader users do not know what they are choosing, for example size or country.',
    affects: ['blind', 'voice-control'],
  },
  'server-side-image-map': {
    title: 'A server-side image map is used',
    description:
      'The page uses a server-side image map, which only works with a mouse. Keyboard and screen reader users cannot use the links.',
    affects: ['keyboard', 'blind'],
  },
  'summary-name': {
    title: 'An expandable section has no heading text',
    description:
      'A <summary> element (the clickable heading of a details/expand section) has no text, so screen readers announce an empty control.',
    affects: ['blind', 'voice-control'],
  },
  'svg-img-alt': {
    title: 'An SVG image has no text description',
    description:
      'An SVG marked as an image has no title or label, so screen readers skip it or announce nothing useful.',
    affects: ['blind'],
  },
  'table-fake-caption': {
    title: 'A table caption is faked with a table cell',
    description:
      'The first row of a table is used as its caption instead of a real <caption> element, so screen readers treat the caption as data.',
    affects: ['blind'],
  },
  'target-size': {
    title: 'A button or link is too small to tap reliably',
    description:
      'A clickable target is smaller than 24 by 24 pixels and too close to its neighbours. People with tremors or limited dexterity often hit the wrong one.',
    affects: ['motor'],
  },
  'td-has-header': {
    title: 'Data table cells are not linked to their headers',
    description:
      'In a large data table, cells are not connected to header cells, so screen reader users hear numbers without knowing which row or column they belong to.',
    affects: ['blind'],
  },
  'td-headers-attr': {
    title: 'Table cells point to headers that do not exist',
    description:
      "A table cell's headers attribute refers to IDs that are not header cells in the same table, so screen readers announce the wrong headers or none.",
    affects: ['blind'],
  },
  'th-has-data-cells': {
    title: 'A table header does not label any data',
    description:
      'A table header cell has no data cells under or beside it, which makes the table structure confusing for screen reader users.',
    affects: ['blind'],
  },
  'valid-lang': {
    title: 'Part of the page has an invalid language code',
    description:
      'An element marks text as being in another language, but the language code is not valid, so screen readers cannot switch pronunciation.',
    affects: ['blind'],
  },
  'video-caption': {
    title: 'A video has no captions',
    description:
      'A video has no captions track. People who are deaf or hard of hearing, and anyone watching without sound, miss the dialogue.',
    affects: ['deaf'],
  },
};
