// Definition of Done: every screen passes axe-core with zero violations.
// Needs the API on API_URL (default http://localhost:4000) and the web app on WEB_URL
// (default http://localhost:3000). Creates a throwaway user, organisation and site,
// then audits each screen. Exits 1 when any violation is found.
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const API = process.env.API_URL ?? "http://localhost:4000";
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

async function api(path, body) {
  return page.evaluate(
    async ([url, payload]) => {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { status: res.status, body: await res.json() };
    },
    [`${API}${path}`, body],
  );
}

await page.goto(`${WEB}/sign-in`);
const email = `a11y-${Date.now()}@example.com`;
const signUp = await api("/v1/auth/sign-up", {
  email,
  password: "Correct-Horse-Battery-9",
  name: "A11y Tester",
});
if (signUp.status >= 400)
  throw new Error(`Sign-up failed: ${JSON.stringify(signUp.body)}`);
const { org } = (await api("/v1/orgs", { name: "A11y Agency", type: "agency" }))
  .body.data;
const { site } = (
  await api(`/v1/orgs/${org.slug}/sites`, {
    name: "Example",
    rootUrl: "https://example.com",
    platform: "shopify",
  })
).body.data;

const siteBase = `/${org.slug}/sites/${site.id}`;
const screens = {
  "S-01 Home": "/",
  "S-02 Pricing": "/pricing",
  "S-03 Free checker": "/check",
  "S-04 Fix guides": "/fix",
  "S-14 Onboarding": "/onboarding",
  "S-20 Overview": `/${org.slug}`,
  "S-21 Sites": `/${org.slug}/sites`,
  "S-23 Verification": `${siteBase}/verify`,
  "S-24 Site overview": siteBase,
  "S-25 Issues": `${siteBase}/issues`,
  "S-27 Scan history": `${siteBase}/scans`,
  "S-29 Pages": `${siteBase}/pages`,
  "S-30 Reports": `${siteBase}/reports`,
  "S-31 Evidence": `${siteBase}/evidence`,
  "S-32 Manual checks": `${siteBase}/manual-checks`,
  "S-34 Site settings": `${siteBase}/settings`,
  "S-41 Members": "/settings/members",
  "S-43 Branding": "/settings/branding",
  "S-44 Billing": "/settings/billing",
  "S-48 Account": "/settings/account",
  "S-60 Portal Home": "/portal",
  "S-61 Portal Site": `/portal/sites/${site.id}`,
};

let failures = 0;
for (const [name, path] of Object.entries(screens)) {
  await page.goto(WEB + path, { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const { violations } = await new AxeBuilder({ page })
    .withTags(TAGS)
    .analyze();
  console.log(`${violations.length ? "FAIL" : "PASS"} ${name} (${path})`);
  for (const v of violations) {
    failures += 1;
    console.log(
      `  ${v.id} [${v.impact}] x${v.nodes.length}: ${v.nodes[0].html.slice(0, 200)}`,
    );
  }
}

// Signed-out screens last, after the session is gone.
await page.evaluate(
  (url) => fetch(url, { method: "POST", credentials: "include" }),
  `${API}/v1/auth/sign-out`,
);
await context.clearCookies();
for (const [name, path] of Object.entries({
  "S-10 Sign up": "/sign-up",
  "S-11 Sign in": "/sign-in",
  "S-12 Forgot password": "/forgot-password",
})) {
  await page.goto(WEB + path, { waitUntil: "load" });
  const { violations } = await new AxeBuilder({ page })
    .withTags(TAGS)
    .analyze();
  console.log(`${violations.length ? "FAIL" : "PASS"} ${name} (${path})`);
  failures += violations.length;
  for (const v of violations)
    console.log(
      `  ${v.id} [${v.impact}] x${v.nodes.length}: ${v.nodes[0].html.slice(0, 200)}`,
    );
}

await browser.close();
console.log(
  failures
    ? `${failures} accessibility violation(s).`
    : "No accessibility violations.",
);
process.exit(failures ? 1 : 0);
