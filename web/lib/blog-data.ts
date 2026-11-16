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
    title: "What the EAA means for online stores now",
    summary:
      "Directive (EU) 2019/882 makes digital accessibility mandatory for e-commerce across the European Union. Here is what every store owner and digital agency needs to audit today.",
    date: "October 14, 2026",
    readingTime: "6 min read",
    author: {
      name: "James Nyangada",
      role: "Founder",
      avatar: "JN",
    },
    tags: ["EAA 2025", "Regulation", "E-Commerce", "WCAG 2.2"],
    content: [
      {
        sectionTitle: "What is the European Accessibility Act?",
        paragraphs: [
          "On June 28, 2025, the European Accessibility Act (Directive 2019/882) entered into full legal force across all 27 European Union member states. Unlike previous directives that applied exclusively to public sector bodies, the EAA directly regulates private commercial enterprises, with e-commerce websites and mobile apps at the very center of its mandate.",
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
          "Each EU member state has established dedicated market surveillance authorities empowered to audit websites, issue compliance orders, and levy substantial fines. Penalties vary by country: the Directive leaves it to each member state to set \"effective, proportionate and dissuasive\" penalties (Article 30 of Directive (EU) 2019/882), so fines and enforcement powers differ from one national law to the next. Non-compliant businesses may also face potential court injunctions halting sales within member states until code-level remediations are completed.",
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
      name: "James Nyangada",
      role: "Founder",
      avatar: "JN",
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
      name: "James Nyangada",
      role: "Founder",
      avatar: "JN",
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
  {
    slug: "check-custom-coded-website-accessibility",
    title: "How to check a custom-coded website for accessibility",
    summary:
      "Built with React, Next.js, Vue, plain HTML or a back-end framework? Here is a practical routine for finding accessibility problems in your own code, and fixing them where they start.",
    date: "November 16, 2026",
    readingTime: "6 min read",
    author: {
      name: "James Nyangada",
      role: "Founder",
      avatar: "JN",
    },
    tags: ["Custom code", "React", "Vue", "WCAG 2.2"],
    content: [
      {
        sectionTitle: "Custom code means you own every fix",
        paragraphs: [
          "On Shopify or WordPress, many accessibility problems come from the theme, and the fix is often a setting. On a site you built yourself, every button, form and image comes from your own components. That is good news: there is no theme vendor to wait for, and one fix in a shared component reaches every page that uses it.",
          "It also means nobody else is checking. The routine below takes about an hour for a typical site, and most of it can then run on its own every week.",
        ],
      },
      {
        sectionTitle: "Step 1: Run an automated check on real pages",
        paragraphs: [
          "Automated tools find roughly a third of accessibility problems, but they find them fast and they never get bored. Check the pages people actually use: home, a listing page, a detail page, a form, and anything with a checkout or booking flow.",
          "Check the rendered page in a browser, not your source files. A React component can look fine in code and still render a button with no name once the icon library replaces the text. EveryVisitor's free check tests one page in a real browser in about 30 seconds; weekly monitoring covers hundreds of pages and groups them by page type, so a problem in one template shows up once, not 400 times.",
        ],
      },
      {
        sectionTitle: "Step 2: Put your mouse away",
        paragraphs: [
          "Press Tab from the top of the page to the bottom. You should be able to see where focus is at every moment, reach every link, button and field, open and close every menu and dialog, and never get stuck. Custom dropdowns, modals and carousels are where custom-coded sites most often fail this test.",
          "If an element only works with a click handler on a div, replace it with a real button. You get keyboard support, focus and the right screen reader announcement for free.",
        ],
        codeBlock: {
          language: "jsx",
          caption: "A div with onClick isn't reachable by keyboard. A button is.",
          code: `// Before: no keyboard access, announced as plain text
<div className="add-to-cart" onClick={addToCart}>Add to cart</div>

// After
<button type="button" className="add-to-cart" onClick={addToCart}>
  Add to cart
</button>`,
        },
      },
      {
        sectionTitle: "Step 3: Listen to one page with a screen reader",
        paragraphs: [
          "Turn on VoiceOver (Cmd+F5 on a Mac) or NVDA (free, on Windows) and move through one important page. Listen for buttons announced only as \"button\", images read as file names, form fields with no label, and headings that skip levels. Ten minutes is enough to find the patterns, and patterns are what you fix in components.",
        ],
      },
      {
        sectionTitle: "Step 4: Fix it in the component, not the page",
        paragraphs: [
          "Most problems on a custom-coded site repeat because a component repeats. Make the accessible version the only version: require an alt prop on your image component, require a label on your icon button, generate unique ids for form fields with useId in React or Vue.",
          "EveryVisitor's Custom code fix guides show each fix as plain HTML, with CSS where it matters and examples for React/Next.js and Vue. If you tell us your framework, its example is shown first.",
        ],
        codeBlock: {
          language: "jsx",
          caption: "An icon button that can't be used without a label",
          code: `export function IconButton({ label, icon: Icon, ...props }) {
  return (
    <button type="button" aria-label={label} {...props}>
      <Icon aria-hidden="true" focusable="false" />
    </button>
  );
}`,
        },
      },
      {
        sectionTitle: "Step 5: Keep it fixed",
        paragraphs: [
          "Code changes every week, and accessibility regressions arrive with them: a new icon library, a redesigned header, a refactored form. Add an automated check to your CI pipeline for the components you control, and run a weekly check of the live site to catch what CI can't see, such as content and third-party scripts.",
          "Automated checks are a floor, not a finish line. Pair them with the keyboard and screen reader checks above every few months, and keep a dated record of what you found and fixed.",
        ],
      },
    ],
  },
  {
    slug: "accessibility-company-websites",
    title: "Accessibility for company websites, not just stores",
    summary:
      "Online stores get most of the attention, but company sites, portfolios, booking pages and non-profit sites have the same problems and the same visitors. Here is where to start.",
    date: "November 16, 2026",
    readingTime: "4 min read",
    author: {
      name: "James Nyangada",
      role: "Founder",
      avatar: "JN",
    },
    tags: ["Company websites", "Accessibility basics", "WCAG 2.2"],
    content: [
      {
        sectionTitle: "Why stores get the attention",
        paragraphs: [
          "Most US accessibility lawsuits are filed against online stores, and the European Accessibility Act names e-commerce directly. So most accessibility advice is written for stores. That's why EveryVisitor is built especially for them.",
          "But the people who can't use an inaccessible store can't use an inaccessible company website either. A recruitment page that a screen reader user can't apply through, a booking form that doesn't work with a keyboard, a contact page with grey-on-white text: each one turns away a customer, a client or a candidate.",
        ],
      },
      {
        sectionTitle: "The same five problems, everywhere",
        paragraphs: [
          "Whatever the site, automated checks keep finding the same things: images with no description, buttons and links with no name, text with too little contrast, form fields with no label, and pages that stop people from zooming on a phone.",
          "None of these is hard to fix. Each has a step-by-step guide for Shopify, WordPress and custom code in our fix guide library.",
        ],
      },
      {
        sectionTitle: "Where to start on a company site",
        paragraphs: [
          "Start with the pages that lead to action: contact, booking, careers and any sign-up form. Then the home page and main navigation, because every visitor passes through them. Check each with the keyboard (Tab through the page) and run an automated check.",
          "Then keep checking. Company sites change less often than stores, but a new campaign page or a redesigned header can undo months of work in one release. A weekly check catches that the week it happens, and a dated record shows the work you've done.",
        ],
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
      "EveryVisitorBot Documentation (/bot): Detailed crawler politeness, 1 req/sec rate caps, and robots.txt compliance specs.",
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
