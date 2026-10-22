export interface PlanFeatureRow {
  name: string;
  tooltip?: string;
  store: string | boolean;
  growth: string | boolean;
  agency: string | boolean;
  agencyPro: string | boolean;
}

export interface PlanFeatureCategory {
  category: string;
  features: PlanFeatureRow[];
}

export const COMPARISON_CATEGORIES: PlanFeatureCategory[] = [
  {
    category: "Capacity & Limits",
    features: [
      {
        name: "Monitored sites",
        tooltip: "Total number of active websites monitored in your organization",
        store: "1 site",
        growth: "3 sites",
        agency: "25 sites",
        agencyPro: "75 sites",
      },
      {
        name: "Pages per scan (per site)",
        tooltip: "Number of discovered pages sampled and evaluated during each weekly scan",
        store: "250 pages",
        growth: "500 pages",
        agency: "250 pages",
        agencyPro: "500 pages",
      },
      {
        name: "Scan frequency",
        store: "Weekly",
        growth: "Daily",
        agency: "Weekly (5 daily sites)",
        agencyPro: "Daily",
      },
      {
        name: "Manual 'Scan Now' runs",
        tooltip: "On-demand scans triggered manually per site per day",
        store: "2 / day",
        growth: "5 / day",
        agency: "3 / day",
        agencyPro: "10 / day",
      },
      {
        name: "Team member seats",
        tooltip: "Internal team members with edit and triage permissions",
        store: "2 seats",
        growth: "5 seats",
        agency: "10 seats",
        agencyPro: "Unlimited",
      },
      {
        name: "Client viewer portal seats",
        tooltip: "External clients with read-only access to their specific site dashboard",
        store: false,
        growth: false,
        agency: "Unlimited",
        agencyPro: "Unlimited",
      },
    ],
  },
  {
    category: "Monitoring & Remediation",
    features: [
      {
        name: "WCAG 2.2 AA Automated Engine",
        store: true,
        growth: true,
        agency: true,
        agencyPro: true,
      },
      {
        name: "E-Commerce Template Grouping",
        tooltip: "Automated clustering of product, collection, cart, and policy templates",
        store: true,
        growth: true,
        agency: true,
        agencyPro: true,
      },
      {
        name: "Instant Regression Alerts",
        tooltip: "Immediate email notification when a new critical barrier or regression appears",
        store: false,
        growth: true,
        agency: true,
        agencyPro: true,
      },
      {
        name: "Slack Webhook Notifications",
        store: false,
        growth: true,
        agency: true,
        agencyPro: true,
      },
      {
        name: "Platform Fix Guides (Shopify & WP)",
        store: true,
        growth: true,
        agency: true,
        agencyPro: true,
      },
      {
        name: "CSV Issues Export (RFC 4180)",
        store: true,
        growth: true,
        agency: true,
        agencyPro: true,
      },
      {
        name: "Signed PDF Compliance Reports",
        store: true,
        growth: true,
        agency: true,
        agencyPro: true,
      },
    ],
  },
  {
    category: "Agency & Enterprise",
    features: [
      {
        name: "White-Label Branded Reports",
        tooltip: "Upload your agency logo and custom colors to client executive reports",
        store: false,
        growth: false,
        agency: true,
        agencyPro: true,
      },
      {
        name: "Scheduled Client Delivery",
        tooltip: "Automated monthly delivery of branded PDF reports to clients",
        store: false,
        growth: false,
        agency: true,
        agencyPro: true,
      },
      {
        name: "Worst-First Agency Overview",
        store: false,
        growth: false,
        agency: true,
        agencyPro: true,
      },
      {
        name: "Cross-Site Issue Discovery",
        tooltip: "Aggregate common theme flaws across multiple client storefronts",
        store: false,
        growth: false,
        agency: true,
        agencyPro: true,
      },
      {
        name: "Custom Portal Domain (status.agency.com)",
        store: false,
        growth: false,
        agency: false,
        agencyPro: true,
      },
      {
        name: "Public REST API & API Keys",
        store: false,
        growth: false,
        agency: false,
        agencyPro: true,
      },
      {
        name: "Data Retention Period",
        store: "12 months",
        growth: "12 months",
        agency: "24 months",
        agencyPro: "24 months",
      },
    ],
  },
];

export const PRICING_FAQS = [
  {
    q: "How does the 14-day free trial work?",
    a: "Every new account starts on a 14-day trial with full access to test up to 3 sites and 50 pages per scan. No credit card is required to sign up. When your trial ends, you can choose whichever plan best fits your site count.",
  },
  {
    q: "Can I switch between monthly and annual billing?",
    a: "Yes. You can switch between monthly and annual billing at any time in your Billing settings. When switching to annual billing, you receive 2 months free per year, and any unused portion of your current monthly cycle is automatically credited.",
  },
  {
    q: "Do you charge extra for client viewers?",
    a: "No! On our Agency and Agency Pro plans, you can invite unlimited client viewers to their respective site portals at zero additional charge. We encourage agencies to grant portal access to all their clients.",
  },
  {
    q: "What happens if a client site has more than 250 or 500 pages?",
    a: "Plainsight uses intelligent template discovery. Online stores typically share repeating templates (product pages, collection listings, blog posts). By sampling 250 to 500 representative URLs across each template family, we detect over 95% of unique template-level code defects without overloading your server.",
  },
  {
    q: "What payment methods and currencies do you support?",
    a: "We process payments via Paddle, our Merchant of Record. We accept Visa, Mastercard, American Express, Apple Pay, Google Pay, and PayPal. Invoices include full sales tax/VAT compliance for US, EU, and UK business entities.",
  },
  {
    q: "Can I cancel my subscription at any time?",
    a: "Yes. You can cancel with one click from your account billing dashboard. Your subscription remains active with full access until the end of your current paid billing period, and no further charges will be made.",
  },
];
