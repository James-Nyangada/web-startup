import type { Severity } from "./severity";

export type IssueStatus = "open" | "regressed" | "needsReview" | "fixed" | "ignored";

export type Issue = {
  id: string;
  siteId?: string;
  rule: string;
  sev: Severity;
  title: string;
  template: string;
  occ: number;
  pages: number;
  status: IssueStatus;
  /** Initials shown in the avatar. */
  assignee?: string;
  assigneeName?: string;
  assigneeId?: string | null;
  due?: string;
  dueDate?: string | null;
  wcag: string;
  wcagCriteria?: string[];
  first: string;
  last: string;
  who: string;
  why: string;
  occs: [string, string][];
  snippet: string;
  axe: string;
  steps: string[];
  code: string;
  gen: string;
  check: string;
  ai?: string;
  history?: [HistoryKind, string, string][];
  ignoreReason?: string;
};

export type HistoryKind = "found" | "ok" | "reg" | "user" | "eye";

export const NAMES = { DM: "Daniel Mwangi", AK: "Aisha Kamau" } as const;

/** Score over the last 12 scans: [date, score, open problems, partial?]. */
export const TREND: [string, number, number, boolean?][] = [
  ["5 Aug", 61, 24],
  ["12 Aug", 63, 22],
  ["19 Aug", 62, 23],
  ["26 Aug", 66, 20],
  ["2 Sep", 64, 21, true],
  ["9 Sep", 68, 18],
  ["16 Sep", 70, 17],
  ["23 Sep", 69, 17],
  ["30 Sep", 72, 15],
  ["7 Oct", 74, 13],
  ["12 Oct", 72, 14],
  ["14 Oct", 78, 11],
];

export const RECENTLY_FIXED: [string, string][] = [
  ["Page has no title", "12 Oct"],
  ["Form errors aren’t announced", "12 Oct"],
  ["Text doesn’t have enough contrast: Cart", "7 Oct"],
  ["Links look the same as text", "7 Oct"],
  ["Focus outline removed on buttons", "30 Sep"],
];

export const ISSUES: Issue[] = [
  {
    id: "i1", rule: "image-alt", sev: "critical", title: "Images are missing descriptions", template: "Product pages", occ: 214, pages: 107, status: "regressed",
    assignee: "DM", due: "Due 18 Oct", wcag: "1.1.1 Non-text Content (Level A)", first: "12 Aug, scan #9", last: "14 Oct, scan #23",
    who: "People who use screen readers hear “image” or a file name instead of what the product looks like, so they can’t compare products.",
    why: "Product photos carry details shoppers need: colour, material, size. Without a description that information is simply missing.",
    occs: [
      ["/products/linden-oak-dining-table", ".product__media-item:nth-child(2) img"],
      ["/products/arlo-lounge-chair", ".product__media-item:nth-child(1) img"],
      ["/products/fenn-side-table", ".product__media-item:nth-child(3) img"],
      ["/products/hale-bookcase", ".product__thumb img"],
    ],
    snippet: '<img src="//oakhaus.com/cdn/shop/files/linden-oak-02.jpg" width="1200" height="900" loading="lazy">',
    axe: "The image has no alt attribute, so it has no text alternative. Found on every product page that has more than one image.",
    steps: [
      "In Shopify admin, open Products and choose a product.",
      "Select an image, then choose “Add alt text”.",
      "Describe what matters to a shopper, e.g. “Linden dining table in white oak, seats six”.",
      "If alt text is set but still missing on the page, your theme isn’t outputting it. Update the image tag in sections/main-product.liquid with the code below.",
    ],
    code: "{{ media.preview_image | image_url: width: 1200 | image_tag: alt: media.alt }}",
    gen: '<img src="linden-oak-02.jpg" alt="Linden dining table in white oak, seats six">',
    check: "Run “Recheck” here. Then turn on VoiceOver or NVDA, move to a product image, and listen for your description.",
    ai: "Suggested alt text for linden-oak-02.jpg: “Linden dining table in white oak, shown from the side with six matching chairs.”",
    history: [
      ["found", "First found", "Scan #9 · 12 Aug"],
      ["ok", "Marked fixed", "Daniel Mwangi · 2 Oct"],
      ["reg", "Came back", "Scan #23 · 14 Oct, likely after the theme update on 13 Oct"],
      ["user", "Assigned to Daniel Mwangi, due 18 Oct", "Daniel Mwangi · 14 Oct"],
    ],
  },
  {
    id: "i2", rule: "button-name", sev: "critical", title: "Buttons have no name screen readers can announce", template: "Site header (all pages)", occ: 284, pages: 142, status: "open",
    assignee: "AK", due: "Due 21 Oct", wcag: "4.1.2 Name, Role, Value (Level A)", first: "5 Aug, scan #8", last: "14 Oct, scan #23",
    who: "People who use screen readers hear only “button” on the cart and menu icons, so they can’t find the cart or open navigation.",
    why: "The cart button is on the path to every purchase. If it can’t be identified, some people can’t buy.",
    occs: [["/", "header .header__icon--cart"], ["/", "header .header__icon--menu"], ["/collections/dining", "header .header__icon--cart"]],
    snippet: '<button class="header__icon header__icon--cart"><svg class="icon icon-cart">…</svg><span class="cart-count">2</span></button>',
    axe: "The button contains only an icon and a number, with no text or label that describes it.",
    steps: ["Go to Online Store → Themes → Edit code.", "Open sections/header.liquid and find the cart and menu buttons.", "Add a visually hidden label inside each button (code below).", "Save, then preview the theme."],
    code: '<span class="visually-hidden">Cart, {{ cart.item_count }} items</span>',
    gen: '<button aria-label="Cart, 2 items">…</button>',
    check: "Tab to the cart icon with a screen reader running. You should hear “Cart, 2 items, button”.",
    ai: "Use “Open menu” for the menu button and “Cart, {{ cart.item_count }} items” for the cart button, so the count is announced too.",
  },
  {
    id: "i3", rule: "label", sev: "critical", title: "Form fields have no labels", template: "Newsletter signup (footer)", occ: 142, pages: 142, status: "open",
    wcag: "1.3.1 Info and Relationships (Level A)", first: "5 Aug, scan #8", last: "14 Oct, scan #23",
    who: "People who use screen readers or voice control can’t tell what the email field is for, because it only has placeholder text.",
    why: "Placeholder text disappears once you start typing and isn’t reliably announced.",
    occs: [["/", "footer #NewsletterForm--footer"], ["/pages/about", "footer #NewsletterForm--footer"]],
    snippet: '<input id="NewsletterForm--footer" type="email" name="contact[email]" placeholder="Email">',
    axe: "The input has no label element, aria-label or aria-labelledby.",
    steps: ["Go to Online Store → Themes → Edit code.", "Open sections/footer.liquid and find the newsletter form.", "Add a label connected to the input’s id (code below).", "Keep it visible if your design allows; otherwise use the visually-hidden class."],
    code: '<label for="NewsletterForm--footer">Email address</label>',
    gen: '<label for="email">Email address</label>\n<input id="email" type="email">',
    check: "Click the label text. The field should receive focus. A screen reader should announce “Email address, edit text”.",
    ai: "Use a visible label “Email address” above the field, and keep “Email” as the placeholder only if it adds something.",
  },
  {
    id: "i4", rule: "color-contrast", sev: "serious", title: "Text doesn’t have enough contrast", template: "Collection pages", occ: 96, pages: 24, status: "open",
    assignee: "AK", due: "Due 25 Oct", wcag: "1.4.3 Contrast (Minimum) (Level AA)", first: "5 Aug, scan #8", last: "14 Oct, scan #23",
    who: "People with low vision, and anyone on a phone in sunlight, struggle to read sale prices and product subtitles.",
    why: "Grey #9A9A9A on white is 2.8:1. Body text needs at least 4.5:1.",
    occs: [["/collections/dining", ".price-item--sale"], ["/collections/living", ".card__subtitle"], ["/collections/sale", ".price-item--regular s"]],
    snippet: '<span class="price-item price-item--sale" style="color:#9A9A9A">$1,240.00</span>',
    axe: "Foreground #9A9A9A on background #FFFFFF has a contrast ratio of 2.8:1. Expected 4.5:1.",
    steps: ["Go to Online Store → Themes → Customize → Theme settings → Colors.", "Find the secondary text colour used for prices and subtitles.", "Change it to #6B6B6B or darker (5.3:1 on white).", "Save, then check collection pages."],
    code: ".price-item--sale, .card__subtitle { color: #6B6B6B; }",
    gen: "color: #6B6B6B; /* 5.3:1 on #FFFFFF */",
    check: "Recheck here, or use a contrast checker on the sale price colour.",
  },
  {
    id: "i5", rule: "color-contrast", sev: "serious", title: "Text doesn’t have enough contrast", template: "Product pages", occ: 64, pages: 107, status: "open",
    wcag: "1.4.3 Contrast (Minimum) (Level AA)", first: "19 Aug, scan #10", last: "14 Oct, scan #23",
    who: "People with low vision struggle to read the delivery estimate under the Add to cart button.", why: "Light grey on cream is 3.1:1, below the 4.5:1 minimum.",
    occs: [["/products/linden-oak-dining-table", ".product__delivery-note"]], snippet: '<p class="product__delivery-note">Ships in 3–5 weeks</p>', axe: "Contrast ratio 3.1:1. Expected 4.5:1.",
    steps: ["Go to Online Store → Themes → Customize.", "Open a product page and select the delivery note text block.", "Pick a darker text colour."],
    code: ".product__delivery-note { color: #5C5650; }", gen: "color: #5C5650;", check: "Recheck here after saving.",
  },
  {
    id: "i6", rule: "meta-viewport", sev: "serious", title: "Zooming is turned off on phones", template: "All pages (theme.liquid)", occ: 142, pages: 142, status: "open",
    wcag: "1.4.4 Resize Text (Level AA)", first: "5 Aug, scan #8", last: "14 Oct, scan #23",
    who: "People with low vision can’t pinch to zoom on phones.", why: "Many shoppers rely on zoom to read product details and prices.",
    occs: [["/", 'head meta[name="viewport"]']], snippet: '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">', axe: "maximum-scale=1 prevents zooming.",
    steps: ["Go to Online Store → Themes → Edit code.", "Open layout/theme.liquid.", "Replace the viewport meta tag with the one below."],
    code: '<meta name="viewport" content="width=device-width, initial-scale=1">', gen: '<meta name="viewport" content="width=device-width, initial-scale=1">', check: "On a phone, pinch to zoom on any page.",
  },
  {
    id: "i7", rule: "link-name", sev: "serious", title: "Links have no text", template: "Site footer (social icons)", occ: 568, pages: 142, status: "open",
    wcag: "2.4.4 Link Purpose (Level A)", first: "5 Aug, scan #8", last: "14 Oct, scan #23",
    who: "Screen reader users hear “link” four times with no idea where each goes.", why: "Links need a name that says where they go.",
    occs: [["/", "footer .list-social__link"]], snippet: '<a href="https://instagram.com/oakhaus" class="list-social__link"><svg>…</svg></a>', axe: "The link contains only an SVG with no accessible name.",
    steps: ["In the theme editor, open snippets/social-icons.liquid.", "Add a hidden label inside each link with the platform name."],
    code: '<span class="visually-hidden">Oakhaus on Instagram</span>', gen: '<a href="…" aria-label="Oakhaus on Instagram">', check: "Tab through the footer with a screen reader.",
  },
  {
    id: "i8", rule: "heading-order", sev: "moderate", title: "Heading levels skip", template: "Product pages", occ: 107, pages: 107, status: "open",
    wcag: "1.3.1 Info and Relationships (Level A)", first: "5 Aug, scan #8", last: "14 Oct, scan #23",
    who: "Screen reader users who jump by heading may think content is missing.", why: "The page goes from h1 to h4 for “Details” and “Delivery”.",
    occs: [["/products/linden-oak-dining-table", ".product__accordion h4"]], snippet: '<h4 class="accordion__title">Details</h4>', axe: "Heading levels should only increase by one.",
    steps: ["In sections/main-product.liquid, change accordion titles from h4 to h2.", "Adjust the styling class so they look the same."],
    code: '<h2 class="accordion__title h4">Details</h2>', gen: '<h2 class="h4">Details</h2>', check: "Use a headings list in your screen reader or a browser extension.",
  },
  {
    id: "i9", rule: "region", sev: "moderate", title: "Some content is outside page landmarks", template: "Announcement bar", occ: 142, pages: 142, status: "needsReview",
    wcag: "1.3.1 Info and Relationships (Level A)", first: "5 Aug, scan #8", last: "14 Oct, scan #23",
    who: "Screen reader users navigating by landmark can miss the free-delivery announcement.", why: "Automated tests couldn’t decide whether this is a problem. A person should check.",
    occs: [["/", ".announcement-bar"]], snippet: '<div class="announcement-bar">Free delivery in Nairobi over KSh 50,000</div>', axe: "Content is not contained by a landmark region.",
    steps: ["Decide if the announcement matters for every visitor.", "If it does, move it inside the header element in sections/header.liquid."],
    code: '<header>…<div class="announcement-bar">…</div></header>', gen: 'Wrap in <header> or <aside aria-label="Announcement">', check: "Use landmark navigation in your screen reader.",
  },
  {
    id: "i10", rule: "list", sev: "minor", title: "Lists aren’t marked up correctly", template: "Blog posts", occ: 12, pages: 6, status: "open",
    wcag: "1.3.1 Info and Relationships (Level A)", first: "26 Aug, scan #11", last: "14 Oct, scan #23",
    who: "Screen reader users don’t hear how many items a list has.", why: "Care instructions use line breaks and dashes instead of a real list.",
    occs: [["/blogs/journal/caring-for-oak", ".article__content p"]], snippet: "<p>- Wipe with a damp cloth<br>- Avoid direct sun</p>", axe: "Content looks like a list but isn’t marked up as one.",
    steps: ["Open the blog post in Shopify admin.", "Select the lines and use the bulleted list button in the editor."],
    code: "<ul><li>Wipe with a damp cloth</li><li>Avoid direct sun</li></ul>", gen: "<ul><li>…</li></ul>", check: "View the post; bullets should appear as a real list.",
  },
  {
    id: "i11", rule: "frame-title", sev: "minor", title: "Embedded map has no title", template: "Contact page", occ: 1, pages: 1, status: "open",
    wcag: "4.1.2 Name, Role, Value (Level A)", first: "5 Aug, scan #8", last: "14 Oct, scan #23",
    who: "Screen reader users hear “frame” with no description.", why: "A title tells people what the embedded content is before they enter it.",
    occs: [["/pages/contact", 'iframe[src*="google.com/maps"]']], snippet: '<iframe src="https://www.google.com/maps/embed?pb=…"></iframe>', axe: "The iframe has no title attribute.",
    steps: ["Edit the Contact page in Shopify admin and switch to HTML view.", "Add a title attribute to the iframe."],
    code: '<iframe title="Map of the Oakhaus showroom, Westlands" src="…"></iframe>', gen: '<iframe title="…">', check: "Recheck here.",
  },
];

export const SITE_TABS = ["Overview", "Issues", "Scans", "Pages", "Reports", "Evidence", "Manual checks", "Statement", "Settings"];
export const DRAWER_TABS = ["Overview", "Where it occurs", "How to fix", "History"];
export const IGNORE_REASONS = ["False positive", "Not applicable", "Won’t fix", "Accepted risk"];

/* ---------- Agency overview (S-20) ---------- */

export type SiteRow = {
  id?: string;
  name: string;
  url: string;
  client: string;
  platform: string;
  score: number | null;
  crit: number;
  ser: number;
  regressions?: number;
  delta: string;
  dir: 1 | 0 | -1;
  last: string;
  /** Epoch ms of the latest scan, for sorting. */
  lastScanAt?: number;
  nextScan?: string;
  status: "Active" | "Error" | "Paused";
  verified?: boolean;
  reason: string;
};

export const SITES: SiteRow[] = [
  { name: "Oakhaus Furniture", url: "oakhaus.com", client: "Mark Otieno", platform: "Shopify", score: 78, crit: 3, ser: 4, regressions: 1, delta: "Up 6", dir: 1, last: "14 Oct", nextScan: "Tomorrow 02:00", status: "Active", verified: true, reason: "Regressed: product images" },
  { name: "Sora Skincare", url: "soraskin.co", client: "Grace Wanjiru", platform: "Shopify", score: 58, crit: 7, ser: 11, regressions: 2, delta: "Down 9", dir: -1, last: "14 Oct", nextScan: "Wed 03:00", status: "Active", verified: true, reason: "Score dropped 9 after a new app" },
  { name: "Kito Coffee", url: "kitocoffee.com", client: "Kito Ltd", platform: "WordPress", score: 64, crit: 4, ser: 8, regressions: 1, delta: "Up 2", dir: 1, last: "13 Oct", nextScan: "Thu 02:00", status: "Active", verified: true, reason: "" },
  { name: "Mwanga Solar", url: "mwangasolar.co.ke", client: "Mwanga Energy", platform: "WordPress", score: null, crit: 0, ser: 0, regressions: 0, delta: "-", dir: 0, last: "Failed 13 Oct", nextScan: "Retrying today", status: "Error", verified: false, reason: "Scan failed: site returned 503" },
  { name: "Lumen Opticians", url: "lumenoptics.co.uk", client: "Lumen Group", platform: "WordPress", score: 83, crit: 1, ser: 3, regressions: 0, delta: "No change", dir: 0, last: "14 Oct", nextScan: "Friday 02:00", status: "Active", verified: true, reason: "" },
  { name: "Lumen Careers", url: "careers.lumenoptics.co.uk", client: "Lumen Group", platform: "Other", score: 88, crit: 0, ser: 2, regressions: 0, delta: "Up 4", dir: 1, last: "12 Oct", nextScan: "Friday 02:30", status: "Active", verified: true, reason: "" },
  { name: "Baraka Bikes", url: "barakabikes.com", client: "Baraka Cycles", platform: "Shopify", score: 91, crit: 0, ser: 1, regressions: 0, delta: "Up 1", dir: 1, last: "14 Oct", nextScan: "Sat 04:00", status: "Active", verified: true, reason: "" },
  { name: "Tamu Bakery", url: "tamubakery.com", client: "Tamu Foods", platform: "Shopify", score: 95, crit: 0, ser: 0, regressions: 0, delta: "No change", dir: 0, last: "11 Oct", nextScan: "Paused", status: "Paused", verified: true, reason: "" },
];

export const COMMON_PROBLEMS = [
  { t: "Images are missing descriptions", n: 11 },
  { t: "Text doesn’t have enough contrast", n: 9 },
  { t: "Buttons have no name", n: 7 },
  { t: "Form fields have no labels", n: 6 },
  { t: "Zooming is turned off on phones", n: 4 },
];
