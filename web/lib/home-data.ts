import type { Severity } from "./severity";

export const CHECK_STEPS = ["Loading page", "Running 92 automated checks", "Preparing results"];

export const RESULT_COUNTS: [Severity, number][] = [
  ["critical", 2],
  ["serious", 2],
  ["moderate", 1],
  ["minor", 1],
];

export const TOP_PROBLEMS: { sev: Severity; title: string; n: number; who: string }[] = [
  { sev: "critical", title: "Images are missing descriptions", n: 14, who: "People who use screen readers can’t tell what products look like." },
  { sev: "critical", title: "Buttons have no name screen readers can announce", n: 3, who: "Screen reader users can’t find the cart or menu." },
  { sev: "serious", title: "Text doesn’t have enough contrast", n: 22, who: "People with low vision struggle to read prices." },
  { sev: "serious", title: "Zooming is turned off on phones", n: 1, who: "People who need to zoom can’t enlarge the page." },
  { sev: "moderate", title: "Heading levels skip", n: 4, who: "Screen reader users may think content is missing." },
  { sev: "minor", title: "Embedded video has no title", n: 1, who: "Screen reader users hear only “frame”." },
];

export const FACTS = [
  { fact: "Online stores are the most common target of US accessibility lawsuits.", source: "Source: UsableNet, 2025 Year-End Digital Accessibility Lawsuit Report (about 70% e-commerce)" },
  { fact: "The European Accessibility Act has applied to e-commerce since 28 June 2025.", source: "Source: Directive (EU) 2019/882" },
  { fact: "Overlays don't fix the underlying code, and can make things worse.", source: "Source: US FTC, accessiBe final order, April 2025" },
];

export const HOW = [
  {
    n: "Step 1",
    t: "Scan",
    d: "We check 250 to 500 pages per scan, depending on your plan, and group them by template.",
    shot: "screenshot: scan progress",
    image: "/screenshots/scan-progress.png",
    imageLight: "/screenshots/scan-progress-light.png",
    imageDark: "/screenshots/scan-progress-dark.png",
    alt: "EveryVisitor scanning a store: 87 of 150 pages checked.",
  },
  {
    n: "Step 2",
    t: "Understand",
    d: "Problems in plain words, ranked by who they block.",
    shot: "screenshot: fix these first",
    image: "/screenshots/fix-these-first.png",
    imageLight: "/screenshots/fix-these-first-light.png",
    imageDark: "/screenshots/fix-these-first-dark.png",
    alt: "Site score of 72 with the top problems listed in plain language.",
  },
  {
    n: "Step 3",
    t: "Fix",
    d: "Step-by-step guides for Shopify and WordPress, with code.",
    shot: "screenshot: fix guide",
    image: "/screenshots/fix-guide.png",
    imageLight: "/screenshots/fix-guide-light.png",
    imageDark: "/screenshots/fix-guide-dark.png",
    alt: "Step-by-step Shopify fix guide with the code to copy.",
  },
  {
    n: "Step 4",
    t: "Prove",
    d: "A dated record of scans, fixes and manual checks.",
    shot: "screenshot: evidence timeline",
    image: "/screenshots/evidence-timeline.png",
    imageLight: "/screenshots/evidence-timeline-light.png",
    imageDark: "/screenshots/evidence-timeline-dark.png",
    alt: "Dated record of fixes, scans and manual checks, with an evidence pack download.",
  },
];

export const COMPARE = [
  { q: "Changes your code", a: "No, adds a script on top", b: "Shows you exactly what to change" },
  { q: "Works with screen readers", a: "Often conflicts with them", b: "Fixes are in your real HTML" },
  { q: "Proof of effort", a: "None", b: "Evidence pack with dates" },
  { q: "Claims compliance", a: "Often", b: "Never, we’re honest about limits" },
];

export const PLANS = [
  { name: "Store", price: "$29", who: "One store owner, 1 site", tag: "" },
  { name: "Growth", price: "$59", who: "Growing brands, 3 sites", tag: "" },
  { name: "Agency", price: "$149", who: "Up to 25 client sites", tag: "Most popular for agencies" },
  { name: "Agency Pro", price: "$299", who: "Up to 75 sites, custom domain", tag: "" },
];

export const FAQ = [
  {
    q: "Will this make my site compliant?",
    a: "No tool can make a site compliant on its own. Automated checks find part of the problems; the rest needs people to test. We help you find, fix and record your work, which is what reduces risk.",
  },
  { q: "Do I need to install anything?", a: "No. We check your site from the outside, like a visitor. Nothing is added to your pages." },
  {
    q: "Which platforms do you support?",
    a: "Any public website. Fix guides are written for Shopify and WordPress first, with generic code for everything else.",
  },
];
