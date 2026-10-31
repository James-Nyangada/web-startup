import { Router, type Request, type Response } from 'express';
import type { AppConfig } from './config.js';
import { sessionStore, verifyAppBridgeToken, verifyOAuthHmac, isValidShopDomain } from './shopify.js';
import { SHOPIFY_PLANS, syncPlanWithEveryVisitor } from './billing.js';
import { escapeHtml, shopifyThemeLinks } from './deep-links.js';

// EveryVisitor lockup (mark + wordmark), same artwork as the website logo.
const LOGO_MARK_PATH = "M6 0H18A6 6 0 0 1 24 6V18A6 6 0 0 1 18 24H17V15A5 5 0 0 0 7 15V24H6A6 6 0 0 1 0 18V6A6 6 0 0 1 6 0Z";
const LOGO_WORDMARK_PATH =
  "M178.49 80L130.91 80L130.91 7.27L178.21 7.27L178.21 18.32L144.08 18.32L144.08 38.06L175.76 38.06L175.76 49.11L144.08 49.11L144.08 68.96L178.49 68.96L178.49 80ZM225.15 25.45L238.82 25.45L219.40 80L205.19 80L185.77 25.45L199.48 25.45L212.01 65.97L212.58 65.97L225.15 25.45ZM270.85 81.07L270.85 81.07Q262.64 81.07 256.70 77.64Q250.75 74.21 247.55 67.91Q244.36 61.61 244.36 53.05L244.36 53.05Q244.36 44.63 247.57 38.26Q250.78 31.88 256.57 28.31Q262.36 24.74 270.17 24.74L270.17 24.74Q275.22 24.74 279.71 26.36Q284.20 27.98 287.66 31.35Q291.13 34.72 293.11 39.93Q295.10 45.13 295.10 52.30L295.10 52.30L295.10 56.24L257.11 56.24Q257.18 60.79 258.85 64.06L258.85 64.06Q260.59 67.46 263.71 69.26Q266.84 71.05 271.03 71.05L271.03 71.05Q273.83 71.05 276.10 70.25Q278.38 69.45 280.05 67.89Q281.71 66.33 282.57 64.02L282.57 64.02L294.57 65.37Q293.43 70.13 290.25 73.66Q287.08 77.19 282.14 79.13Q277.20 81.07 270.85 81.07ZM257.14 47.58L257.14 47.58L282.78 47.58Q282.74 43.88 281.18 40.99Q279.62 38.10 276.83 36.43Q274.04 34.76 270.35 34.76L270.35 34.76Q266.41 34.76 263.43 36.66Q260.44 38.56 258.81 41.61L258.81 41.61Q257.32 44.38 257.14 47.58ZM317.82 80L304.97 80L304.97 25.45L317.43 25.45L317.43 34.55L318.00 34.55Q319.49 29.82 323.13 27.25Q326.77 24.67 331.46 24.67L331.46 24.67Q332.53 24.67 333.86 24.76Q335.19 24.85 336.08 25.03L336.08 25.03L336.08 36.85Q335.26 36.57 333.50 36.34Q331.74 36.11 330.11 36.11L330.11 36.11Q326.60 36.11 323.81 37.62Q321.02 39.13 319.42 41.79Q317.82 44.45 317.82 47.93L317.82 47.93L317.82 80ZM351.63 100.45L351.63 100.45Q349.00 100.45 346.78 100.05Q344.56 99.64 343.24 99.11L343.24 99.11L346.23 89.09Q349.03 89.91 351.23 89.87Q353.44 89.84 355.12 88.50Q356.81 87.17 357.98 84.08L357.98 84.08L359.08 81.14L339.30 25.45L352.94 25.45L365.51 66.65L366.08 66.65L378.68 25.45L392.36 25.45L370.52 86.61Q368.99 90.94 366.47 94.04Q363.95 97.15 360.31 98.80Q356.67 100.45 351.63 100.45ZM396.08 7.27L410.53 7.27L429.46 64.52L430.21 64.52L449.10 7.27L463.59 7.27L437.95 80L421.68 80L396.08 7.27ZM484.46 80L471.61 80L471.61 25.45L484.46 25.45L484.46 80ZM478.07 17.71L478.07 17.71Q475.02 17.71 472.81 15.67Q470.61 13.63 470.61 10.75L470.61 10.75Q470.61 7.84 472.81 5.80Q475.02 3.76 478.07 3.76L478.07 3.76Q481.16 3.76 483.34 5.80Q485.53 7.84 485.53 10.75L485.53 10.75Q485.53 13.63 483.34 15.67Q481.16 17.71 478.07 17.71ZM539.78 39.87L539.78 39.87L528.06 41.15Q527.57 39.37 526.34 37.81Q525.12 36.25 523.06 35.29Q521.00 34.33 518.01 34.33L518.01 34.33Q514.00 34.33 511.28 36.07Q508.57 37.81 508.60 40.58L508.60 40.58Q508.57 42.96 510.36 44.45Q512.15 45.94 516.31 46.90L516.31 46.90L525.61 48.89Q533.36 50.56 537.14 54.18Q540.92 57.81 540.95 63.66L540.95 63.66Q540.92 68.81 537.95 72.74Q534.99 76.66 529.73 78.86Q524.48 81.07 517.66 81.07L517.66 81.07Q507.64 81.07 501.54 76.86Q495.43 72.65 494.26 65.12L494.26 65.12L506.79 63.91Q507.64 67.61 510.41 69.49Q513.18 71.37 517.62 71.37L517.62 71.37Q522.20 71.37 524.99 69.49Q527.78 67.61 527.78 64.84L527.78 64.84Q527.78 62.49 525.99 60.97Q524.19 59.44 520.43 58.62L520.43 58.62L511.13 56.67Q503.28 55.04 499.51 51.15Q495.75 47.26 495.78 41.29L495.78 41.29Q495.75 36.25 498.54 32.54Q501.32 28.83 506.31 26.79Q511.30 24.74 517.84 24.74L517.84 24.74Q527.42 24.74 532.95 28.83Q538.47 32.91 539.78 39.87ZM563.43 80L550.57 80L550.57 25.45L563.43 25.45L563.43 80ZM557.04 17.71L557.04 17.71Q553.98 17.71 551.78 15.67Q549.58 13.63 549.58 10.75L549.58 10.75Q549.58 7.84 551.78 5.80Q553.98 3.76 557.04 3.76L557.04 3.76Q560.13 3.76 562.31 5.80Q564.49 7.84 564.49 10.75L564.49 10.75Q564.49 13.63 562.31 15.67Q560.13 17.71 557.04 17.71ZM592.12 25.45L602.88 25.45L602.88 35.40L592.12 35.40L592.12 63.59Q592.12 66.19 592.91 67.55Q593.71 68.92 595.03 69.42Q596.34 69.91 597.94 69.91L597.94 69.91Q599.15 69.91 600.16 69.74Q601.17 69.56 601.70 69.42L601.70 69.42L603.87 79.47Q602.84 79.82 600.94 80.25Q599.04 80.67 596.31 80.75L596.31 80.75Q591.48 80.89 587.61 79.27Q583.73 77.66 581.48 74.25Q579.22 70.84 579.26 65.72L579.26 65.72L579.26 35.40L571.52 35.40L571.52 25.45L579.26 25.45L579.26 12.39L592.12 12.39L592.12 25.45ZM636.43 81.07L636.43 81.07Q628.44 81.07 622.58 77.55Q616.72 74.03 613.50 67.71Q610.29 61.39 610.29 52.94L610.29 52.94Q610.29 44.49 613.50 38.13Q616.72 31.78 622.58 28.26Q628.44 24.74 636.43 24.74L636.43 24.74Q644.42 24.74 650.28 28.26Q656.14 31.78 659.35 38.13Q662.56 44.49 662.56 52.94L662.56 52.94Q662.56 61.39 659.35 67.71Q656.14 74.03 650.28 77.55Q644.42 81.07 636.43 81.07ZM636.50 70.77L636.50 70.77Q640.83 70.77 643.74 68.37Q646.65 65.97 648.09 61.92Q649.53 57.88 649.53 52.90L649.53 52.90Q649.53 47.90 648.09 43.83Q646.65 39.77 643.74 37.35Q640.83 34.94 636.50 34.94L636.50 34.94Q632.06 34.94 629.13 37.35Q626.20 39.77 624.76 43.83Q623.32 47.90 623.32 52.90L623.32 52.90Q623.32 57.88 624.76 61.92Q626.20 65.97 629.13 68.37Q632.06 70.77 636.50 70.77ZM685.29 80L672.43 80L672.43 25.45L684.89 25.45L684.89 34.55L685.46 34.55Q686.95 29.82 690.59 27.25Q694.23 24.67 698.92 24.67L698.92 24.67Q699.99 24.67 701.32 24.76Q702.65 24.85 703.54 25.03L703.54 25.03L703.54 36.85Q702.72 36.57 700.96 36.34Q699.21 36.11 697.57 36.11L697.57 36.11Q694.06 36.11 691.27 37.62Q688.48 39.13 686.88 41.79Q685.29 44.45 685.29 47.93L685.29 47.93L685.29 80Z";
const LOGO_SVG = `<svg viewBox="0 0 703.54 100.45" role="img" aria-label="EveryVisitor Accessibility" focusable="false" style="height: 26px; width: auto; display: block;"><g transform="scale(3.64)" fill="#2D45C8"><path d="${LOGO_MARK_PATH}"/><circle cx="13" cy="20" r="2.2"/></g><path d="${LOGO_WORDMARK_PATH}" fill="#1a1a1a"/></svg>`;

export function createDashboardRouter(config: AppConfig): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, string>;
    let shop = '';
    let tokenVerified = false;

    // Verify via App Bridge id_token
    if (query.id_token) {
      const verified = verifyAppBridgeToken(query.id_token, config.apiSecret, config.apiKey);
      if (verified.valid && verified.shop) {
        shop = verified.shop;
        tokenVerified = true;
      }
    }

    // Verify via Shopify OAuth signed parameters
    if (!shop && query.hmac) {
      if (verifyOAuthHmac(query, config.apiSecret) && isValidShopDomain(query.shop || '')) {
        shop = query.shop!;
      }
    }

    if (!shop) {
      res.status(401).send('Unauthorized: Shopify Admin authentication required.');
      return;
    }
    let session = await sessionStore.findInDb(shop);

    // Managed installation never calls /api/auth/callback, so exchange the App Bridge
    // session token for an offline access token the first time the app loads.
    if (!session && tokenVerified) {
      try {
        const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            client_id: config.apiKey,
            client_secret: config.apiSecret,
            grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
            subject_token: query.id_token,
            subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
            requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
          }),
        });
        if (tokenRes.ok) {
          const tokenData = (await tokenRes.json()) as { access_token: string; scope: string };
          session = {
            shop,
            accessToken: tokenData.access_token,
            scope: tokenData.scope,
            plan: 'free',
            installedAt: new Date().toISOString(),
          };
          sessionStore.set(shop, session);
        } else {
          console.error(`Token exchange failed for ${shop}: HTTP ${tokenRes.status}`);
        }
      } catch (err) {
        console.error('Token exchange error:', err);
      }
    }

    // Opened with only signed OAuth params and no session: use classic OAuth.
    if (!session && !tokenVerified) {
      res.redirect(`/api/auth?shop=${encodeURIComponent(shop)}`);
      return;
    }

    const shopName = shop ? shop.replace('.myshopify.com', '') : 'My Store';
    const siteId = session?.siteId;
    // A connected store still on the trial may have been upgraded elsewhere (e.g. an agency
    // account): ask the backend, which is the source of truth for the plan.
    if (session && session.apiKey && session.siteId && (!session.plan || session.plan === 'free' || session.plan === 'trial')) {
      const synced = await syncPlanWithEveryVisitor(config, shop, session.plan || 'trial');
      if (synced && synced !== session.plan) {
        session.plan = synced;
        sessionStore.set(shop, session);
      }
    }
    let planId = session?.plan || 'free';
    let activePlan = SHOPIFY_PLANS[planId] || SHOPIFY_PLANS.free!;

    let score: number | null = null;
    let criticalCount = 0;
    let seriousCount = 0;
    let lastScanAt: string | null = null;
    let topIssues: Array<{ title?: string; ruleId?: string; impact?: string; templateKey?: string | null }> = [];
    let loadError = false;
    let billing: { plan?: string | null; billingStatus?: string | null; trialEndsAt?: string | null } | null = null;

    const apiKey = session?.apiKey;
    const connected = Boolean(siteId && apiKey);

    if (connected) {
      try {
        const siteRes = await fetch(`${config.everyvisitorApiUrl}/v1/sites/${siteId}`, {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (siteRes.ok) {
          const data = ((await siteRes.json()) as any)?.data ?? {};
          score = data.score ?? data.site?.score ?? null;
          criticalCount = data.severityCounts?.critical ?? 0;
          seriousCount = data.severityCounts?.serious ?? 0;
          billing = data.billing ?? null;
          const finished = data.latestScanSummary?.finishedAt ?? data.site?.lastScanAt;
          if (finished) lastScanAt = new Date(finished).toLocaleString();
          topIssues = Array.isArray(data.topIssues) ? data.topIssues.slice(0, 5) : [];
        } else {
          loadError = true;
        }
      } catch {
        loadError = true;
      }
    }

    // The organisation's own plan (returned by EveryVisitor) is the source of truth; the saved
    // session plan can be stale, e.g. for an agency account connected from Shopify.
    if (billing?.plan && SHOPIFY_PLANS[billing.plan]) {
      planId = billing.plan;
      activePlan = SHOPIFY_PLANS[planId]!;
    }

    const BILLING_STATUS_LABELS: Record<string, { label: string; tone: 'good' | 'warn' | 'bad'; hint: string }> = {
      trialing: { label: 'Free trial', tone: 'good', hint: 'Your trial is running.' },
      active: { label: 'Active', tone: 'good', hint: 'Your subscription is in good standing.' },
      past_due: { label: 'Payment overdue', tone: 'bad', hint: 'The last payment failed. Update your payment method to avoid interruption.' },
      paused: { label: 'Paused', tone: 'warn', hint: 'Your subscription is paused. Scans are not running.' },
      canceled: { label: 'Canceled', tone: 'bad', hint: 'Your subscription was canceled.' },
      read_only: { label: 'Read-only', tone: 'bad', hint: 'Your account is read-only. Renew to run new scans.' },
    };
    const billingInfo = billing?.billingStatus ? BILLING_STATUS_LABELS[billing.billingStatus] : undefined;
    const trialEndsText =
      billing?.billingStatus === 'trialing' && billing.trialEndsAt
        ? new Date(billing.trialEndsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;
    const billingBadgeColor =
      billingInfo?.tone === 'bad' ? '#8e1f0b' : billingInfo?.tone === 'warn' ? '#6a4b00' : '#0b5d3a';
    const billingBadgeBg =
      billingInfo?.tone === 'bad' ? '#fde8e4' : billingInfo?.tone === 'warn' ? '#fff3cd' : '#e3f6ec';
    const billingStatusHtml =
      connected && billingInfo
        ? `<p style="margin: 6px 0 0 0; font-size: 13px; color: #6d7175;">
            Account billing status:
            <span style="display:inline-block; padding: 2px 10px; border-radius: 999px; font-weight: 600; background: ${billingBadgeBg}; color: ${billingBadgeColor};">${escapeHtml(billingInfo.label)}</span>
            ${trialEndsText ? ` &middot; trial ends ${escapeHtml(trialEndsText)}` : ''}
          </p>
          ${billingInfo.tone === 'good' ? '' : `<p role="alert" style="margin: 6px 0 0 0; font-size: 13px; color: ${billingBadgeColor};">${escapeHtml(billingInfo.hint)}</p>`}`
        : '';

    const fullAppUrl = siteId
      ? `${config.appUrl}/sites/${siteId}`
      : config.appUrl;

    const connectUrl = `/api/connect-start?shop=${encodeURIComponent(shop)}`;
    const issueRows = topIssues
      .map((issue) => {
        const links = shopifyThemeLinks(shop, issue.templateKey);
        const impact = String(issue.impact || 'moderate').toLowerCase();
        const badge = impact === 'critical' ? 'badge-critical' : impact === 'serious' ? 'badge-serious' : 'badge-moderate';
        return `<tr>
          <td><span class="badge ${badge}">${escapeHtml(impact.charAt(0).toUpperCase() + impact.slice(1))}</span></td>
          <td><strong>${escapeHtml(issue.title || issue.ruleId || 'Accessibility issue')}</strong></td>
          <td><code>${escapeHtml(links.likelyFile)}</code></td>
          <td>
            <a href="${escapeHtml(links.editorUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px;">Customizer</a>
            <a href="${escapeHtml(links.codeEditorUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" style="padding: 4px 10px; font-size: 12px;">Code</a>
          </td>
        </tr>`;
      })
      .join('');

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EveryVisitor Accessibility - Shopify Admin</title>
  <link rel="stylesheet" href="/css/polaris.css" />
  <script src="/js/app-bridge.js"></script>
  <style>
    body {
      background-color: #f1f2f4;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 24px;
      color: #202223;
    }
    .container {
      max-width: 980px;
      margin: 0 auto;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
      margin-bottom: 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15);
      padding: 20px;
    }
    .stat-number {
      font-size: 32px;
      font-weight: 700;
      margin-top: 8px;
    }
    .score-good { color: #108043; }
    .score-warning { color: #b95000; }
    .score-critical { color: #d72c0d; }
    .table-container {
      overflow-x: auto;
      margin-top: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }
    th, td {
      padding: 12px 14px;
      border-bottom: 1px solid #e1e3e5;
    }
    th {
      background-color: #f7f9fa;
      font-weight: 600;
      color: #5c5f62;
    }
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .badge-critical { background: #fed3d1; color: #8e1f0b; }
    .badge-serious { background: #ffe9b8; color: #723b00; }
    .badge-moderate { background: #e4e5e7; color: #44474a; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid transparent;
      transition: background-color 0.15s ease;
    }
    .btn-primary { background: #008060; color: #ffffff; }
    .btn-primary:hover { background: #006e52; }
    .btn-secondary { background: #ffffff; border-color: #c9cccf; color: #202223; }
    .btn-secondary:hover { background: #f6f6f7; }
    .banner {
      background: #e3f1df;
      border: 1px solid #94c987;
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <div>
        <h1 style="margin: 0; line-height: 1;">${LOGO_SVG}</h1>
        <p style="margin: 4px 0 0 0; color: #6d7175; font-size: 13px;">
          Store: <strong>${shopName}.myshopify.com</strong> &bull; Plan: <strong>${activePlan.name}</strong>
        </p>
      </div>
      <div style="display: flex; gap: 10px;">
        ${connected ? `<button id="scan-btn" class="btn btn-secondary" onclick="triggerScan()">
          Scan Store Now
        </button>` : ''}
        <a href="${fullAppUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">
          Open in EveryVisitor &rarr;
        </a>
      </div>
    </div>

    <!-- Connection / Verification Banner -->
    ${
      connected
        ? `<div class="banner">
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 18px;">✓</span>
        <div>
          <strong style="color: #108043;">Store ownership verified via Shopify</strong>
          <div style="font-size: 12px; color: #2e622c;">${
            loadError
              ? 'We could not load your latest results. Try again shortly.'
              : 'Continuous automated WCAG 2.2 AA monitoring is active.'
          }</div>
        </div>
      </div>
      <span style="font-size: 12px; color: #557850;">Last scanned: ${escapeHtml(lastScanAt ?? 'No scan yet')}</span>
    </div>`
        : `<div class="card" style="margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
      <div>
        <strong>Connect your EveryVisitor account</strong>
        <div style="font-size: 13px; color: #6d7175;">Sign in or create an account to start monitoring this store. No code changes needed.</div>
      </div>
      <a href="${connectUrl}" target="_blank" rel="noopener" class="btn btn-primary">Connect account &rarr;</a>
    </div>`
    }

    <!-- Metric Cards -->
    <div class="grid-3">
      <div class="card">
        <div style="font-size: 12px; font-weight: 600; color: #6d7175; text-transform: uppercase;">WCAG 2.2 Score</div>
        <div class="stat-number ${score === null ? '' : score >= 90 ? 'score-good' : score >= 70 ? 'score-warning' : 'score-critical'}">
          ${score === null ? '&mdash;' : score} <span style="font-size: 16px; font-weight: 400; color: #8c9196;">/100</span>
        </div>
        <div style="font-size: 12px; margin-top: 6px; color: #6d7175;">
          ${score === null ? 'Run your first scan to see your score' : score >= 90 ? 'High standard compliance' : 'Fix serious issues to reach 90+'}
        </div>
      </div>

      <div class="card">
        <div style="font-size: 12px; font-weight: 600; color: #6d7175; text-transform: uppercase;">Critical Issues</div>
        <div class="stat-number ${!connected ? '' : criticalCount > 0 ? 'score-critical' : 'score-good'}">
          ${connected ? criticalCount : '&mdash;'}
        </div>
        <div style="font-size: 12px; margin-top: 6px; color: #6d7175;">Blocks screen reader navigation</div>
      </div>

      <div class="card">
        <div style="font-size: 12px; font-weight: 600; color: #6d7175; text-transform: uppercase;">Serious Issues</div>
        <div class="stat-number ${!connected ? '' : seriousCount > 0 ? 'score-warning' : 'score-good'}">
          ${connected ? seriousCount : '&mdash;'}
        </div>
        <div style="font-size: 12px; margin-top: 6px; color: #6d7175;">Color contrast & missing labels</div>
      </div>
    </div>

    <!-- Top Issues Section -->
    <div class="card" style="margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <h2 style="font-size: 16px; font-weight: 600; margin: 0;">Top Theme Accessibility Issues</h2>
        <span style="font-size: 12px; color: #6d7175;">Direct links to your theme customizer and code editor</span>
      </div>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Severity</th>
              <th>WCAG Issue</th>
              <th>Likely Liquid Section</th>
              <th>Fix Location</th>
            </tr>
          </thead>
          <tbody>
            ${issueRows || `<tr><td colspan="4" style="color:#6d7175;">${connected ? 'No open issues found. Nice work.' : 'Connect your account to see issues.'}</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Billing Plan Section -->
    <div class="card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="font-size: 16px; font-weight: 600; margin: 0;">Shopify App Subscription</h2>
          <p style="margin: 4px 0 0 0; color: #6d7175; font-size: 13px;">
            Current plan: <strong>${activePlan.name}</strong> ${planId === 'agency' || planId === 'agency_pro' ? '(no Shopify charge)' : `($${activePlan.price}/month billed via Shopify)`}
          </p>
          ${billingStatusHtml}
        </div>
        ${
          !connected
            ? `<span style="font-size: 13px; color: #6d7175;">Connect your account to choose a plan.</span>`
            : planId === 'agency' || planId === 'agency_pro'
            ? `<span class="badge badge-good" style="padding: 6px 12px; font-size: 13px;">Included in your EveryVisitor plan</span>`
            : planId === 'trial' || planId === 'free'
            ? `<button class="btn btn-primary" onclick="subscribePlan('store')">Upgrade to Store ($29/mo)</button>`
            : planId === 'store' || planId === 'starter'
              ? `<button class="btn btn-secondary" onclick="subscribePlan('growth')">Upgrade to Growth ($79/mo)</button>`
              : `<span class="badge badge-good" style="padding: 6px 12px; font-size: 13px;">Active Growth Plan</span>`
        }
      </div>
    </div>
  </div>

  <script>
    async function getSessionToken() {
      if (window.shopify && typeof window.shopify.idToken === 'function') {
        try {
          return await window.shopify.idToken();
        } catch (e) {
          console.warn('App bridge idToken error:', e);
        }
      }
      return null;
    }

    async function triggerScan() {
      const btn = document.getElementById('scan-btn');
      btn.disabled = true;
      btn.innerText = 'Scan Queued...';
      try {
        const token = await getSessionToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
          headers['Authorization'] = 'Bearer ' + token;
        }
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers,
          body: JSON.stringify({ shop: '${shop}' })
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          btn.innerText = 'Scan queued';
          alert('Scan queued. Results will refresh within a few minutes.');
        } else {
          alert(data.error || 'The scan could not be started.');
        }
      } catch (e) {
        alert('Network error while starting the scan.');
      } finally {
        setTimeout(() => {
          btn.disabled = false;
          btn.innerText = 'Scan Store Now';
        }, 5000);
      }
    }

    async function subscribePlan(planId) {
      try {
        const token = await getSessionToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
          headers['Authorization'] = 'Bearer ' + token;
        }
        const res = await fetch('/api/billing/subscribe', {
          method: 'POST',
          headers,
          body: JSON.stringify({ shop: '${shop}', planId })
        });
        const data = await res.json();
        if (data.confirmationUrl) {
          window.top.location.href = data.confirmationUrl;
        } else if (data.success) {
          location.reload();
        } else {
          alert(data.error || 'Subscription could not be initiated.');
        }
      } catch (err) {
        alert('Network error while creating subscription.');
      }
    }
  </script>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  });

  return router;
}
