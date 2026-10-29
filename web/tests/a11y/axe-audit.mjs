// Definition of Done: every screen passes axe-core with zero violations.
// Needs the API on API_URL (default http://localhost:4000) and the web app on WEB_URL
// (default http://localhost:3000). Creates a throwaway user, organisation and site,
// then audits each screen. Exits 1 when any violation is found.
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";

/** RFC 6238 code for the staff second factor (P6-01). */
function totp(secret) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "")) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)));
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac("sha1", key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, "0");
}

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
  "S-33 Statement": `${siteBase}/statement`,
  "S-34 Site settings": `${siteBase}/settings`,
  "S-41 Members": "/settings/members",
  "S-45 Notification preferences": "/settings/notifications",
  "S-46 Integrations": "/settings/integrations",
  "S-49 My tasks": "/tasks",
  "S-43 Branding": "/settings/branding",
  "S-44 Billing": "/settings/billing",
  "S-48 Account": "/settings/account",
  "S-40 General": "/settings/general",
  "S-47 API keys": "/settings/api-keys",
  "S-51 Audit log": "/settings/audit-log",
  "Help centre": "/help",
  "Help article": "/help/verify-site-ownership",
  "API reference": "/developers/api",
  "S-80 Not found": "/this-page-does-not-exist",
  "S-80 Maintenance": "/maintenance",
  "S-60 Portal Home": "/portal",
  "S-61 Portal Site": `/portal/sites/${site.id}`,
  "Public Statement": `/s/${site.id}/accessibility-statement`,
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

// S-50: the notification panel only exists once opened from the bell.
await page.goto(WEB + `/${org.slug}`, { waitUntil: "load" });
await page.waitForTimeout(1000);
await page.locator("button[aria-expanded][aria-label*='otification']").first().click();
await page.waitForSelector('[role="dialog"][aria-label="Notification Centre"]');
{
  const { violations } = await new AxeBuilder({ page })
    .include('[role="dialog"][aria-label="Notification Centre"]')
    .withTags(TAGS)
    .analyze();
  console.log(`${violations.length ? "FAIL" : "PASS"} S-50 Notification panel`);
  for (const v of violations) {
    failures += 1;
    console.log(
      `  ${v.id} [${v.impact}] x${v.nodes.length}: ${v.nodes[0].html.slice(0, 200)}`,
    );
  }
}

// S-70 – S-75 staff screens and the impersonation banner (P6-01 – P6-05). Needs psql to mark
// the throwaway user as staff; skipped (not failed) where it is not available.
let staffReady = false;
try {
  execFileSync("psql", [process.env.DATABASE_URL, "-c", `update users set is_staff = true where email = '${email}'`], {
    stdio: "ignore",
  });
  staffReady = true;
} catch {
  console.log("SKIP staff screens: psql or DATABASE_URL not available");
}
if (staffReady) {
  const enrol = await api("/v1/staff/totp/enroll", {});
  const confirmed = await api("/v1/staff/totp/confirm", { code: totp(enrol.body.data.secret) });
  if (confirmed.status >= 400) throw new Error(`Staff TOTP failed: ${JSON.stringify(confirmed.body)}`);
  const staffScreens = {
    "S-70 Staff orgs": "/staff/orgs",
    "S-71 Staff org detail": `/staff/orgs/${org.id}`,
    "S-72 Staff queues": "/staff/queues",
    "S-73 Staff leads": "/staff/leads",
    "S-74 Staff content": "/staff/content",
    "S-75 Staff flags": "/staff/flags",
    // Phase 8 (staff-spec.md): dashboards, analytics, CMS, system
    "S-90 Staff dashboard": "/staff",
    "S-91 Staff business": "/staff/analytics/business",
    "S-92 Staff traffic": "/staff/analytics/traffic",
    "S-93 Staff product usage": "/staff/analytics/product",
    "S-94 Staff funnel": "/staff/analytics/funnel",
    "S-95 Staff blog posts": "/staff/content/posts",
    "S-95 Staff fix guides": "/staff/content/guides",
    "S-97 Staff changelog": "/staff/content/changelog",
    "S-98 Staff site pages": "/staff/content/pages",
    "S-98 Staff page editor": "/staff/content/pages/home.hero",
    "S-99 Staff media": "/staff/media",
    "S-100 Staff banners": "/staff/banners",
    "S-101 Staff settings": "/staff/settings",
    "S-102 Staff members": "/staff/members",
    "S-51 Staff audit": "/staff/audit",
  };
  for (const [name, path] of Object.entries(staffScreens)) {
    await page.goto(WEB + path, { waitUntil: "load" });
    await page.waitForTimeout(2000);
    const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
    console.log(`${violations.length ? "FAIL" : "PASS"} ${name} (${path})`);
    failures += violations.length;
    for (const v of violations)
      console.log(`  ${v.id} [${v.impact}] x${v.nodes.length}: ${v.nodes[0].html.slice(0, 200)}`);
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
