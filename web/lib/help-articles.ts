/**
 * Help centre basics (P6-13): ten articles covering the questions support expects most.
 * Plain language, no promises about legal outcomes (spec 0.2 wording rules).
 */

export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "h"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; text: string }
  | { type: "note"; text: string };

export interface HelpArticle {
  slug: string;
  title: string;
  summary: string;
  category: "Getting started" | "Scans and issues" | "Teams and clients" | "Account and billing";
  body: HelpBlock[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "add-your-first-site",
    title: "Add your first site",
    summary: "Add a store or website and get your first results in a few minutes.",
    category: "Getting started",
    body: [
      { type: "p", text: "EveryVisitor checks the public pages of your site for accessibility problems that automated tools can find, groups them, and tells you what to fix first." },
      { type: "ol", items: [
        "Go to Sites and choose Add site.",
        "Enter your home page address, such as https://yourstore.com. Any public website works: an online store, company site, portfolio, blog or booking site.",
        "Answer “How is your site built?”. We suggest an answer: Shopify, WordPress, WooCommerce, Wix, Webflow, Squarespace, or Custom code for sites built with React, Next.js, Vue, plain HTML, PHP and so on. Change it if we guess wrong, or choose Not sure.",
        "We run a first scan of up to 10 pages straight away so you can see results before verifying.",
        "Verify that you own the site (see “Verify you own your site”) to unlock scheduled scans and full page limits.",
      ] },
      { type: "h", text: "Which pages are scanned" },
      { type: "p", text: "We read your robots.txt and sitemaps, then group pages by template (home, collection, product, blog post and so on) and test a sample of each template. Problems on a shared template usually appear on every page that uses it, so fixing the template fixes them all." },
      { type: "p", text: "You can pin pages that must always be tested, and exclude paths such as /cart or /account, in the site’s Settings tab." },
      { type: "note", text: "Our crawler identifies itself as EveryVisitorBot, makes at most one request a second, and only reads public pages. See /bot for details." },
    ],
  },
  {
    slug: "verify-site-ownership",
    title: "Verify you own your site",
    summary: "Prove you control a site with a meta tag, a DNS record or a file.",
    category: "Getting started",
    body: [
      { type: "p", text: "We only scan a site on a schedule once someone who controls it has verified it. Open the site, go to Verify, and use any one of these methods with the token shown there." },
      { type: "h", text: "Meta tag (easiest on most sites)" },
      { type: "p", text: "Add this tag inside the <head> of your home page:" },
      { type: "code", text: '<meta name="everyvisitor-verify" content="YOUR_TOKEN">' },
      { type: "h", text: "DNS TXT record" },
      { type: "p", text: "Add a TXT record on your domain, or on _everyvisitor.yourdomain.com, with this value:" },
      { type: "code", text: "everyvisitor-verify=YOUR_TOKEN" },
      { type: "h", text: "File" },
      { type: "p", text: "Upload a file at /.well-known/everyvisitor-verify.txt that contains only your token." },
      { type: "note", text: "Built your site with code (React, Next.js, plain HTML, PHP…)? See “Verify a custom-coded site” for where to put the tag or file in your project." },
      { type: "h", text: "If verification stops working" },
      { type: "p", text: "We re-check every week. If the check fails three times in a row, for example after a theme change removed the tag, scheduled scans pause and owners and admins get an email. Add the tag or record back, then choose Check again." },
    ],
  },
  {
    slug: "understanding-your-score",
    title: "Understanding your automated check score",
    summary: "What the 0–100 score measures, and what it does not.",
    category: "Scans and issues",
    body: [
      { type: "p", text: "The score summarises how many automated checks your pages pass, weighted by how much each problem affects people. 90–100 is Good, 70–89 Needs work, and 0–69 Poor." },
      { type: "ul", items: [
        "Each rule has a weight: critical 10, serious 6, moderate 3, minor 1.",
        "A rule that fails on many elements of a page counts more, up to a cap, so one repeated problem cannot sink the whole score.",
        "The site score is the average of the page scores in the latest scan.",
      ] },
      { type: "note", text: "Automated tools find roughly a third of accessibility problems. A high score is a good sign, not proof that a site is accessible or meets any law. Pair it with manual checks such as keyboard-only and screen reader testing, which you can log under Manual checks." },
      { type: "p", text: "The trend chart on the site overview shows the score for your last 12 scans, so you can see whether fixes are landing." },
    ],
  },
  {
    slug: "fixing-an-issue",
    title: "Read an issue and fix it",
    summary: "Find the element, understand who it affects, and follow the fix guide.",
    category: "Scans and issues",
    body: [
      { type: "p", text: "Issues are sorted worst first. Open one to see:" },
      { type: "ul", items: [
        "What is wrong, in plain English, and who it affects (for example, people using screen readers).",
        "The WCAG success criterion it relates to.",
        "The pages and the exact element, with a copy of the HTML.",
        "A written fix guide for your platform, or an AI suggestion when there is no guide. AI suggestions are labelled; check them before applying, and use Report a bad suggestion if one is wrong.",
      ] },
      { type: "h", text: "After you fix it" },
      { type: "p", text: "Choose Recheck to test just that issue’s pages again, or wait for the next scheduled scan. Fixed issues move to Fixed and are recorded in the site’s evidence timeline. If an issue comes back later we mark it as a regression and, if you have alerts on, email you." },
      { type: "p", text: "Assign issues to teammates and set due dates; everything assigned to you is under My tasks." },
    ],
  },
  {
    slug: "ignoring-issues",
    title: "Ignore an issue or mark a false positive",
    summary: "When to ignore an issue, and how it shows in reports.",
    category: "Scans and issues",
    body: [
      { type: "p", text: "Sometimes an automated check is wrong, or an issue does not apply to your site. You can ignore it with a reason: false positive, not applicable, won’t fix, or accepted risk. Add a note so your team and your auditor know why." },
      { type: "p", text: "Ignored issues stop counting toward your score and alerts. They stay visible under the Ignored filter, and the decision, who made it and when are kept in the evidence pack. You can reopen an ignored issue at any time." },
      { type: "note", text: "Some checks are marked Needs review because a tool cannot decide on its own, for example whether a colour pair passes over an image. Check these by eye." },
    ],
  },
  {
    slug: "scans-and-alerts",
    title: "Scheduled scans, rechecks and alerts",
    summary: "How often we scan, how to scan now, and which emails you get.",
    category: "Scans and issues",
    body: [
      { type: "p", text: "Verified sites are scanned weekly, or daily on plans that include it. Pick the day and hour in the site’s Settings tab; times use your organisation’s time zone." },
      { type: "ul", items: [
        "Scan now runs a full scan straight away. Each plan has a daily limit per site.",
        "Recheck tests only the pages where one issue appeared.",
        "Pause a site to stop scheduled scans while you keep its history.",
      ] },
      { type: "h", text: "Emails and notifications" },
      { type: "p", text: "Each person chooses their own emails in Settings → Notifications: a summary after each scan, regression alerts, and a Monday digest. Slack and webhook alerts for the whole organisation are under Settings → Integrations." },
    ],
  },
  {
    slug: "team-and-client-viewers",
    title: "Invite your team and your clients",
    summary: "Roles, invitations, and read-only access for agency clients.",
    category: "Teams and clients",
    body: [
      { type: "p", text: "Invite people from Settings → Team & Members. Invitations last 7 days." },
      { type: "ul", items: [
        "Owner: everything, including billing, API keys and deleting the organisation. There is one owner; they can transfer ownership to an admin.",
        "Admin: manage sites, members, branding, integrations and the audit log.",
        "Member: work on sites and issues, run scans and create reports.",
        "Client viewer (Agency plans): read-only access to the sites you choose, through your branded client portal.",
      ] },
      { type: "p", text: "Client viewers only ever see their own sites, and only notes you mark as visible to the client." },
    ],
  },
  {
    slug: "reports-and-evidence",
    title: "Reports and the evidence pack",
    summary: "Share progress with clients and keep a dated record of your work.",
    category: "Teams and clients",
    body: [
      { type: "p", text: "From a site’s Reports tab you can create a one-page summary or a full report as an accessible PDF, and share it by link or email. Agency plans can schedule a monthly client report and add your own logo and colours." },
      { type: "h", text: "Evidence pack" },
      { type: "p", text: "The evidence pack is a dated record of what you did: scans, fixes, regressions, ignored issues with reasons, manual checks you logged and your published accessibility statement. It shows ongoing effort; it is not a certificate and does not guarantee any legal outcome." },
    ],
  },
  {
    slug: "billing-and-plans",
    title: "Trials, plans and billing",
    summary: "What happens at the end of a trial, and how to change or cancel a plan.",
    category: "Account and billing",
    body: [
      { type: "p", text: "Every organisation starts with a 14-day trial, no card needed. When it ends without a plan, the organisation becomes read-only: you can see everything and export it, but not scan or invite. Data from an unpaid trial is deleted 30 days later, after warning emails 7 days and 1 day before." },
      { type: "ul", items: [
        "Choose or change a plan in Settings → Billing & Plans. Upgrades apply straight away with a prorated charge.",
        "If a downgrade takes you over a limit, you choose which sites to pause first.",
        "Cancelling keeps your plan until the end of the paid period.",
        "If a payment fails you have 7 days to update your card before scanning pauses.",
      ] },
      { type: "p", text: "Payments, invoices and sales tax are handled by Paddle, our reseller. Download invoices from the billing page." },
    ],
  },
  {
    slug: "your-data-and-privacy",
    title: "Your data: export, deletion and privacy",
    summary: "Download your personal data, delete your account, or delete an organisation.",
    category: "Account and billing",
    body: [
      { type: "h", text: "Download your personal data" },
      { type: "p", text: "In Settings → Account, choose Request my data. We email you a link to a zip file with everything we hold about you personally. The link works for 7 days while you are signed in." },
      { type: "h", text: "Delete your account" },
      { type: "p", text: "Also in Settings → Account. If you own an organisation that has other members, transfer ownership first; if it has an active subscription, cancel it first. Organisations you own alone are deleted with your account." },
      { type: "h", text: "Delete an organisation" },
      { type: "p", text: "Owners can delete an organisation in Settings → General by typing its name. The subscription is cancelled at the end of the period, and all data, including files, is permanently erased after 30 days." },
      { type: "p", text: "Agencies can download our Data Processing Agreement at /legal/dpa, and the list of companies that process data for us is at /legal/subprocessors. Questions: info@everyvisitor.app." },
    ],
  },
  {
    slug: "verify-custom-coded-site",
    title: "Verify a custom-coded site",
    summary: "Where to add the verification tag or file in React, Next.js, Vue, plain HTML and server-rendered sites.",
    category: "Getting started",
    body: [
      { type: "p", text: "If your site is built with code rather than a website builder, verification works the same way: add a meta tag, a file or a DNS record. Here is where each goes in common setups. Open the site in EveryVisitor and go to Verify to copy your token." },
      { type: "h", text: "Meta tag" },
      { type: "p", text: "Add this tag inside the <head> of your home page:" },
      { type: "code", text: '<meta name="everyvisitor-verify" content="YOUR_TOKEN">' },
      { type: "ul", items: [
        "Plain HTML: add it to the <head> of index.html.",
        "Next.js (App Router): in app/layout.tsx, add it to the metadata export: export const metadata = { other: { \"everyvisitor-verify\": \"YOUR_TOKEN\" } };",
        "Next.js (Pages Router): add the tag inside <Head> in pages/_app.tsx or pages/_document.tsx.",
        "React with Vite or Create React App: add it to the <head> of index.html (in the project root or public/ folder).",
        "Vue with Vite: add it to index.html. Nuxt: add it under app.head.meta in nuxt.config.ts.",
        "Angular: add it to src/index.html.",
        "PHP, Laravel, Django, Rails or .NET: add it to the layout template that renders the <head> of every page, such as resources/views/layouts/app.blade.php in Laravel.",
      ] },
      { type: "p", text: "Deploy, then choose Check again. The tag must be in the HTML the server sends. If your app only adds tags in the browser with JavaScript, use the file or DNS method instead." },
      { type: "h", text: "File" },
      { type: "p", text: "Upload everyvisitor-verify.txt to /.well-known/ on your web server, or put it in your project’s public/ folder (public/.well-known/everyvisitor-verify.txt) so it is served at https://yoursite.com/.well-known/everyvisitor-verify.txt. The file contains only your token." },
      { type: "note", text: "Some hosts hide folders whose names start with a dot. If the file returns “not found” after deploying, check that your build copies the .well-known folder, or use the meta tag." },
      { type: "h", text: "DNS TXT record" },
      { type: "p", text: "Works the same for every site: add a TXT record on _everyvisitor.yourdomain.com with the value everyvisitor-verify=YOUR_TOKEN." },
    ],
  },
  {
    slug: "react-nextjs-vue-sites",
    title: "Using EveryVisitor with React, Next.js and Vue sites",
    summary: "How checks, fix guides and AI suggestions work for sites built with JavaScript frameworks.",
    category: "Scans and issues",
    body: [
      { type: "p", text: "EveryVisitor checks the pages your visitors actually see, in a real browser, so it works with sites built with React, Next.js, Vue, Nuxt, Angular, Svelte and other frameworks, including pages rendered in the browser." },
      { type: "h", text: "Tell us your framework" },
      { type: "p", text: "When you add a custom-coded site we try to detect the framework. You can set or change it in the site’s Settings tab under “Which technology?”. Choose Other if yours isn’t listed." },
      { type: "h", text: "Fix guides as code" },
      { type: "ul", items: [
        "Each issue’s How to fix tab has a Custom code guide with the corrected HTML, the CSS change where relevant, and examples for React/Next.js (JSX) and Vue.",
        "When your framework is set to React, Next.js, Vue or Nuxt, its example is shown first, then plain HTML.",
        "AI suggestions use your framework’s syntax, such as className and htmlFor in JSX. They are labelled; check them before applying.",
      ] },
      { type: "h", text: "Fix it once, in the component" },
      { type: "p", text: "Issues are grouped by page type. On a framework site, a problem on every product page usually lives in one shared component, so fixing the component fixes every page that uses it. The HTML snippet on the issue helps you find which component rendered it." },
      { type: "h", text: "Things to know" },
      { type: "ul", items: [
        "We check public pages only. Pages behind a login aren’t checked yet.",
        "Client-side routes need real URLs that load directly (for example /products/oak-chair). Pages that only exist after clicking around in the app can’t be found by our crawler; add them to a sitemap or pin them in Settings.",
        "EveryVisitor never adds scripts or widgets to your site. Fixes go in your own code.",
      ] },
    ],
  },
];

export const HELP_CATEGORIES = ["Getting started", "Scans and issues", "Teams and clients", "Account and billing"] as const;

export function findHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((a) => a.slug === slug);
}
