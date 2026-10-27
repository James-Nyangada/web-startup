// Core app flow (spec 13.2) against a running stack: API + worker + web.
// Signs up, onboards a real site (one public page, so the scan is light), triages an issue
// (assign, ignore, reopen, recheck), visits the overview and sites list, uses the command
// palette and signs out. Not run in CI because it needs internet access for the scan.
//
//   WEB_URL=http://localhost:3000 SCAN_URL=https://example.com node tests/e2e/core-flow.mjs
import { chromium } from 'playwright';

const WEB = process.env.WEB_URL ?? 'http://localhost:3000';
const SCAN_URL = process.env.SCAN_URL ?? 'https://example.com';
const problems = [];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().endsWith('/v1/me')) {
    problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
  }
});
const step = (s) => console.log(`✓ ${s}`);

try {
  await page.goto(`${WEB}/sign-up`);
  await page.fill('#name', 'E2E Tester');
  await page.fill('#email', `e2e-${Date.now()}@example.com`);
  await page.fill('#password', 'Correct-Horse-Battery-9');
  await page.click('button[type=submit]');
  await page.waitForTimeout(2500);
  step('signed up');

  await page.goto(`${WEB}/onboarding`);
  await page.fill('#org-name', 'E2E Agency');
  await page.click('button[type=submit]');
  await page.waitForSelector('#site-url', { timeout: 15000 });
  await page.fill('#site-url', SCAN_URL);
  await page.locator('#site-url').blur();
  await page.waitForTimeout(2000);
  await page.click('button[type=submit]');
  await page.waitForSelector('[role=progressbar]', { timeout: 20000 });
  step('organisation and site created, onboarding scan started');

  await page.waitForSelector('text=Go to Site Workspace', { timeout: 240000 });
  step('onboarding scan finished');
  await page.click('text=Go to Site Workspace');
  await page.waitForSelector('#h-score', { timeout: 20000 });
  step('site overview loaded');

  await page.click('#stab-1');
  const firstIssue = page.locator('[data-issue-row] button').first();
  await firstIssue.waitFor({ timeout: 15000 });
  await firstIssue.click();
  await page.waitForSelector('#drawer-title');
  await page.selectOption('select[aria-label="Assignee"]', { index: 1 });
  await page.waitForTimeout(1500);
  step('issue assigned');
  await page.click('[data-ignore-btn]');
  await page.click('button:has-text("Ignore issue")');
  await page.locator('aside button:has-text("Reopen")').first().click({ timeout: 10000 });
  step('issue ignored and reopened');
  await page.locator('aside button:has-text("Recheck")').first().click({ timeout: 10000 });
  await page.waitForFunction(
    () => /Fixed\.|Still there|couldn’t load|longer than expected/.test(document.body.innerText),
    null,
    { timeout: 170000 },
  );
  step('recheck finished');
  await page.keyboard.press('Escape');

  await page.goto(`${WEB}/overview`);
  await page.waitForURL((url) => url.pathname.split('/').length === 2 && url.pathname !== '/overview');
  const org = new URL(page.url()).pathname.split('/')[1];
  step(`overview redirected to /${org}`);
  await page.goto(`${WEB}/${org}/sites`);
  await page.waitForSelector('table');
  step('sites list loaded');

  await page.keyboard.press('Control+k');
  await page.keyboard.type('Example');
  await page.getByRole('option', { name: /Example/ }).first().waitFor({ timeout: 10000 });
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/sites\/[0-9a-f-]{36}/, { timeout: 10000 });
  step('command palette jumped to the site');

  await page.click('button:has(span.sr-only:text-matches("^Account menu for"))');
  await page.click('text=Sign out');
  await page.waitForURL(/sign-in/);
  step('signed out');
} catch (err) {
  problems.push(`FAILED: ${err.message.split('\n')[0]}`);
}

await browser.close();
if (problems.length) {
  console.log(`\nProblems:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('\nCore flow passed.');
