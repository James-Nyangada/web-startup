export interface BlogPost {
  slug: string;
  title: string;
  summary: string;
  date: string;
  readingTime: string;
  author: {
    name: string;
    role: string;
    avatar: string;
  };
  tags: string[];
  content: {
    sectionTitle: string;
    paragraphs: string[];
    codeBlock?: {
      language: string;
      code: string;
      caption?: string;
    };
  }[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "eaa-june-2025-readiness",
    title: "The European Accessibility Act (EAA): What E-commerce Stores Must Know Before June 2025",
    summary:
      "Directive (EU) 2019/882 makes digital accessibility mandatory for e-commerce across the European Union. Here is what every store owner and digital agency needs to audit today.",
    date: "October 14, 2026",
    readingTime: "6 min read",
    author: {
      name: "Marcus Vance",
      role: "Head of Accessibility Engineering",
      avatar: "MV",
    },
    tags: ["EAA 2025", "Regulation", "E-Commerce", "WCAG 2.2"],
    content: [
      {
        sectionTitle: "What is the European Accessibility Act?",
        paragraphs: [
          "On June 28, 2025, the European Accessibility Act (Directive 2019/882) entered into full legal force across all 27 European Union member states. Unlike previous directives that applied exclusively to public sector bodies, the EAA directly regulates private commercial enterprises — with e-commerce websites and mobile apps at the very center of its mandate.",
          "If your business sells products or digital services to consumers residing in the European Union, the EAA applies to your storefront regardless of whether your company is incorporated in the EU, the United States, the UK, or elsewhere.",
        ],
      },
      {
        sectionTitle: "Key Technical Mandates for Online Retailers",
        paragraphs: [
          "The EAA harmonizes accessibility standards around EN 301 549, which directly mirrors WCAG 2.1 / WCAG 2.2 Level AA requirements. In particular, regulators and market surveillance authorities focus on five critical commerce touchpoints:",
          "1. Perceivable Product Information: High contrast text on prices, discount badges, and variant selectors (minimum 4.5:1 ratio for normal text).",
          "2. Complete Keyboard Operability: Ability to browse collections, toggle filter drawers, adjust item quantities, and complete checkout without a mouse.",
          "3. Accessible Forms and Error Remediation: Clear screen reader announcements when a required shipping field is missing or an invalid payment card is entered.",
          "4. Identification and Authentication: Biometric, passwordless, or accessible multi-factor authentication methods without complex cognitive puzzles.",
        ],
      },
      {
        sectionTitle: "Enforcement and Financial Penalties",
        paragraphs: [
          "Each EU member state has established dedicated market surveillance authorities empowered to audit websites, issue compliance orders, and levy substantial fines. Non-compliant businesses face penalties up to €100,000 or a percentage of annual turnover, alongside potential court injunctions halting sales within member states until code-level remediations are completed.",
        ],
      },
      {
        sectionTitle: "The Remediation Roadmap: Real Code over Overlays",
        paragraphs: [
          "European consumer protection groups and regulatory guidelines explicitly emphasize that superficial widget overlays do not constitute compliance. Genuine EAA conformance requires clean, accessible HTML and ARIA patterns built directly into your theme code.",
          "Using automated weekly monitoring with EveryVisitor gives merchants and agencies immediate notice when theme updates or new marketing landing pages introduce accessibility regressions.",
        ],
      },
    ],
  },
  {
    slug: "why-accessibility-overlays-fail",
    title: "Why Accessibility Overlays Fail: The Technical and Legal Truth",
    summary:
      "Automated overlay widgets promise one-line compliance, but in reality they conflict with screen readers and fail to protect against ADA lawsuits. Here is why genuine code fixes are the only durable answer.",
    date: "October 02, 2026",
    readingTime: "8 min read",
    author: {
      name: "Daniel Mwangi",
      role: "Founder & Lead Architect",
      avatar: "DM",
    },
    tags: ["Overlays", "Screen Readers", "ADA Lawsuits", "Code Quality"],
    content: [
      {
        sectionTitle: "The Siren Song of the One-Line Script",
        paragraphs: [
          "In the frantic rush to prevent accessibility lawsuits or comply with new regulations, many merchants install third-party JavaScript widgets that promise 'instant 100% compliance' by injecting an overlay toolbar onto their website.",
          "While attractive in marketing copy, this approach is fundamentally flawed. An overlay cannot repair broken underlying DOM hierarchies, missing server-rendered labels, or inaccessible third-party payment iframes.",
        ],
      },
      {
        sectionTitle: "Why Assistive Technology Users Dislike Overlays",
        paragraphs: [
          "People who rely on screen readers (such as NVDA, JAWS, or VoiceOver) have already configured their operating systems, browsers, and specialized input devices to their personal needs. Overlays frequently attempt to override standard keyboard commands, intercept virtual cursor events, or inject unhelpful automated descriptions that disrupt the user's flow.",
          "In fact, thousands of blind users actively install browser extensions designed specifically to block overlay scripts from loading.",
        ],
      },
      {
        sectionTitle: "Legal Precedent: Overlays Do Not Prevent Lawsuits",
        paragraphs: [
          "US federal courts have repeatedly ruled that the presence of an accessibility overlay does not protect a company from lawsuits under Title III of the Americans with Disabilities Act. In hundreds of documented legal filings, plaintiffs sued websites specifically noting that the installed overlay failed to make the checkout flow accessible.",
        ],
      },
      {
        sectionTitle: "The Solution: Transparent Continuous Monitoring",
        paragraphs: [
          "The only sustainable path to compliance is fixing the source code: correcting color values in CSS, adding explicit descriptive labels to icon buttons, and structuring logical headings.",
          "By monitoring your real storefront with EveryVisitor, you receive clear, plain-language guidance that your internal developers or agency partners can apply directly to your theme repository.",
        ],
      },
    ],
  },
  {
    slug: "shopify-accessibility-best-practices",
    title: "Shopify Accessibility Best Practices: Liquid Theme Fixes",
    summary:
      "Common accessibility pitfalls in modern Shopify Online Store 2.0 themes, and the exact Liquid code changes needed so your cart drawers and product cards meet WCAG 2.2 AA.",
    date: "September 24, 2026",
    readingTime: "5 min read",
    author: {
      name: "Aisha Kamau",
      role: "Frontend Accessibility Specialist",
      avatar: "AK",
    },
    tags: ["Shopify", "Liquid", "Theme Development", "WCAG 2.2"],
    content: [
      {
        sectionTitle: "Common Pitfall 1: Unlabeled Icon-Only Buttons",
        paragraphs: [
          "In many Shopify themes, header buttons for the cart, mobile navigation drawer, and search toggle rely exclusively on SVG icons without accessible text. While visual shoppers recognize the magnifying glass icon, a screen reader announces only 'button' or the raw SVG filename.",
        ],
        codeBlock: {
          language: "liquid",
          caption: "Before and After: Providing accessible screen-reader labels in Shopify Liquid",
          code: `<!-- ❌ Inaccessible: Icon-only button without text -->
<button class="cart-trigger" type="button">
  {% render 'icon-cart' %}
</button>

<!-- ✅ Accessible: Visually hidden text announces cart item count -->
<button class="cart-trigger" type="button" aria-label="{{ 'templates.cart.cart' | t }}">
  {% render 'icon-cart' %}
  <span class="visually-hidden">
    {{ 'sections.header.cart_count' | t: count: cart.item_count }}
  </span>
</button>`,
        },
      },
      {
        sectionTitle: "Common Pitfall 2: Focus Trapping in Slideout Cart Drawers",
        paragraphs: [
          "When a customer clicks 'Add to Cart' and an AJAX slideout drawer opens, focus must automatically move into the drawer, stay trapped while the drawer is visible, and return to the add-to-cart button when closed via the Escape key.",
        ],
        codeBlock: {
          language: "javascript",
          caption: "Accessible Focus Management for Drawer Components",
          code: `function openCartDrawer(drawerEl, triggerEl) {
  drawerEl.setAttribute('aria-hidden', 'false');
  drawerEl.classList.add('is-open');
  
  // Focus the first interactive element inside drawer
  const firstFocusable = drawerEl.querySelector('button, [href], input');
  if (firstFocusable) firstFocusable.focus();

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      closeCartDrawer(drawerEl, triggerEl);
      window.removeEventListener('keydown', onKeyDown);
    }
  }
  window.addEventListener('keydown', onKeyDown);
}`,
        },
      },
    ],
  },
];

export interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  badge: "Major" | "Feature" | "Improvement" | "Security";
  summary: string;
  highlights: string[];
}

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: "v0.3.0",
    date: "October 18, 2026",
    title: "Phase 3 Marketing Platform & Legal Framework",
    badge: "Major",
    summary:
      "Launched complete marketing platform, agency care plan framework, comprehensive legal and trust documentation, and public engineering blog.",
    highlights: [
      "Screen For Agencies: Interactive care plan revenue calculator and white-label care plan packages.",
      "Screen Legal Documents: Comprehensive Terms of Service, Privacy Policy (zero tracking cookies), DPA, and Subprocessors Registry.",
      "PlainsightBot Documentation (/bot): Detailed crawler politeness, 1 req/sec rate caps, and robots.txt compliance specs.",
      "Machine-readable infrastructure: Automated sitemap.xml and robots.txt generation.",
    ],
  },
  {
    version: "v0.2.23",
    date: "October 18, 2026",
    title: "Phase 2 Accessibility & E2E Gate Verification",
    badge: "Security",
    summary:
      "Completed end-to-end multi-tenant lifecycle integration tests and published comprehensive WCAG 2.2 AA audit documentation.",
    highlights: [
      "100% green e2e integration flow test validating onboarding, verification, scanning, issue triage, and CSV export.",
      "Zero axe-core violations verified across all 14 core app screens.",
      "Manual keyboard, NVDA (Windows), and VoiceOver (macOS/iOS) testing notes recorded in docs/a11y/phase-2.md.",
      "Strict multi-tenant boundary verification ensuring cross-org requests return 404 Not Found.",
    ],
  },
  {
    version: "v0.2.22",
    date: "October 18, 2026",
    title: "Filtered CSV Export for Issues",
    badge: "Feature",
    summary:
      "Export active filtered issues directly into RFC 4180 CSV files with UTF-8 BOM encoding for seamless Excel and Google Sheets compatibility.",
    highlights: [
      "Backend endpoint GET /v1/orgs/:orgId/sites/:siteId/issues/export.csv respecting all active filters.",
      "Prepend UTF-8 BOM (\\uFEFF) to guarantee international character display without encoding dialogs.",
      "Complete CSV specification and column dictionary published in docs/csv-export.md.",
    ],
  },
  {
    version: "v0.2.21",
    date: "October 18, 2026",
    title: "Account Settings & Session Revocation",
    badge: "Feature",
    summary:
      "Complete personal profile controls, 12 IANA time zones, light/dark/system theme selection, active session management, and GDPR personal data export.",
    highlights: [
      "implementation with device-specific session badges and one-click remote session revocation.",
      "Delete Account modal with sole-owner protection preventing orphaned organizations.",
      "Show/hide password toggles with accessible eye icons and length validation.",
    ],
  },
  {
    version: "v0.2.20",
    date: "October 18, 2026",
    title: "Agency Organisation Overview & Worst-First Sorting",
    badge: "Feature",
    summary:
      "agency dashboard providing worst-first ranking across client properties, client grouping, and persistent layout preferences.",
    highlights: [
      "Default worst-first sorting by accessibility score and open critical violations.",
      "Client grouping lanes for agencies managing multiple client storefronts.",
      "Single-site store redirect for direct-to-consumer store owners.",
    ],
  },
];
