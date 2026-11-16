/** FAQ shown on /agencies. Also feeds its FAQPage structured data. */
export const AGENCY_FAQS: { q: string; a: string }[] = [
  {
    q: "Can our clients see our other clients' sites or data?",
    a: "Never. Multitenant isolation is enforced at the database and API levels with strict tenant scoping. When you invite a client viewer, they only see the specific site or sites you explicitly assign, with zero access to your other clients, org settings, or billing details.",
  },
  {
    q: "Can we add our own agency logo and brand colors to reports?",
    a: "Yes. In your Organization Settings, you can upload your agency logo, specify your primary brand color, and configure custom report headers. All generated PDFs and client-facing summaries will be fully white-labeled.",
  },
  {
    q: "What is the difference between a team member and a client viewer?",
    a: "Team members are your internal agency staff (designers, developers, project managers) who have full or admin access to all client sites. Client viewers are external contacts with read-only access to their specific client portal view.",
  },
  {
    q: "Does EveryVisitor replace our manual audit services?",
    a: "No, and we are completely transparent about that. Automated scans catch 30% to 50% of WCAG violations (contrast, missing labels, missing alt text, duplicate IDs). EveryVisitor handles continuous weekly regression monitoring, freeing your agency to sell high-value manual assistive tech audits on top.",
  },
  {
    q: "How does EveryVisitor detect theme-wide issues across multiple sites?",
    a: "Our Cross-Site View groups rule failures across all client sites. If 8 of your clients share the same Shopify theme or the same React component library with an unlabelled mobile menu button, you can fix it once in that shared code and confirm the fix across all 8 sites together.",
  },
];
