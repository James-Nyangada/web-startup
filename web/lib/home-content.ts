import { getPage } from "@/lib/cms";
import { COMPARE, FACTS, FAQ, HOW, PLATFORM_FAQ } from "@/lib/home-data";

/** What the home page shows: CMS sections where published, the built-in text elsewhere. */
export interface HomeContent {
  hero: { headline: string; subheadline: string; ctaLabel: string; trustLine: string } | null;
  facts: { fact: string; source: string; url?: string }[];
  how: { n: string; t: string; d: string; imageLight: string; imageDark: string; alt: string }[];
  agency: { headline: string; subtext: string; bullets: string[]; imageUrl: string | null; imageAlt: string } | null;
  compare: { q: string; a: string; b: string }[];
  faq: { q: string; a: string; markdown: boolean }[];
}

interface HeroData { headline: string; subheadline: string; ctaButtonLabel: string; trustLine: string }
interface FactsData { items: { statement: string; sourceName: string; sourceUrl: string }[] }
interface HowData { steps: { stepNumber: number; title: string; description: string; screenshotUrl?: string; screenshotAlt: string }[] }
interface AgencyData { headline: string; subtext: string; bullets: string[]; imageUrl?: string; imageAlt: string }
interface CompareData { rows: { label: string; overlayValue: string; everyVisitorValue: string }[] }
interface FaqData { items: { question: string; answerMd: string; order: number; pages: ("home" | "pricing")[] }[] }

/** Published FAQ items for one page, in the order set in the staff area; null = use the built-in list. */
export async function loadFaq(page: "home" | "pricing"): Promise<{ q: string; a: string }[] | null> {
  const faq = await getPage<FaqData>("home.faq");
  if (!faq) return null;
  const items = [...faq.data.items]
    .filter((i) => i.pages.includes(page))
    .sort((a, b) => a.order - b.order)
    .map((i) => ({ q: i.question, a: i.answerMd }));
  // The "works on any website" questions (spec 3.4) appear on both pages even when the CMS
  // list predates them. Once staff add them to the CMS list, the CMS wording is used instead.
  const asked = new Set(items.map((i) => i.q.trim().toLowerCase()));
  return [...items, ...PLATFORM_FAQ.filter((f) => !asked.has(f.q.toLowerCase()))];
}

export async function loadHomeContent(): Promise<HomeContent> {
  const [hero, facts, how, agency, compare, faq] = await Promise.all([
    getPage<HeroData>("home.hero"),
    getPage<FactsData>("home.facts"),
    getPage<HowData>("home.howItWorks"),
    getPage<AgencyData>("home.agency"),
    getPage<CompareData>("home.overlayComparison"),
    loadFaq("home"),
  ]);

  return {
    hero: hero
      ? {
          headline: hero.data.headline,
          subheadline: hero.data.subheadline,
          ctaLabel: hero.data.ctaButtonLabel,
          trustLine: hero.data.trustLine,
        }
      : null,
    facts: facts
      ? facts.data.items.map((i) => ({ fact: i.statement, source: `Source: ${i.sourceName}`, url: i.sourceUrl }))
      : FACTS,
    how: how
      ? [...how.data.steps]
          .sort((a, b) => a.stepNumber - b.stepNumber)
          .map((s, i) => {
            const fallback = HOW[i];
            const src = s.screenshotUrl;
            return {
              n: `Step ${s.stepNumber}`,
              t: s.title,
              d: s.description,
              imageLight: src ?? fallback?.imageLight ?? "",
              imageDark: src ?? fallback?.imageDark ?? "",
              alt: s.screenshotAlt,
            };
          })
      : HOW,
    agency: agency
      ? {
          headline: agency.data.headline,
          subtext: agency.data.subtext,
          bullets: agency.data.bullets,
          imageUrl: agency.data.imageUrl ?? null,
          imageAlt: agency.data.imageAlt,
        }
      : null,
    compare: compare
      ? compare.data.rows.map((r) => ({ q: r.label, a: r.overlayValue, b: r.everyVisitorValue }))
      : COMPARE,
    faq: faq ? faq.map((f) => ({ ...f, markdown: true })) : FAQ.map((f) => ({ q: f.q, a: f.a, markdown: false })),
  };
}
