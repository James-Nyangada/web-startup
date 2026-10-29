import { Router, type Request, type Response } from 'express';
import type { AppConfig } from './config.js';
import { sessionStore, verifyAppBridgeToken, verifyOAuthHmac, isValidShopDomain } from './shopify.js';
import { SHOPIFY_PLANS } from './billing.js';
import { escapeHtml, shopifyThemeLinks } from './deep-links.js';

export function createDashboardRouter(config: AppConfig): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, string>;
    let shop = '';

    // Verify via App Bridge id_token
    if (query.id_token) {
      const verified = verifyAppBridgeToken(query.id_token, config.apiSecret, config.apiKey);
      if (verified.valid && verified.shop) {
        shop = verified.shop;
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
    const session = shop ? await sessionStore.findInDb(shop) : undefined;

    const shopName = shop ? shop.replace('.myshopify.com', '') : 'My Store';
    const siteId = session?.siteId;
    const planId = session?.plan || 'free';
    const activePlan = SHOPIFY_PLANS[planId] || SHOPIFY_PLANS.free!;

    let score: number | null = null;
    let criticalCount = 0;
    let seriousCount = 0;
    let lastScanAt: string | null = null;
    let topIssues: Array<{ title?: string; ruleId?: string; impact?: string; templateKey?: string | null }> = [];
    let loadError = false;

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
        <h1 style="font-size: 22px; font-weight: 700; margin: 0;">EveryVisitor Accessibility</h1>
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
      <a href="${connectUrl}" target="_top" class="btn btn-primary">Connect account &rarr;</a>
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
            Current plan: <strong>${activePlan.name}</strong> ($${activePlan.price}/month billed via Shopify)
          </p>
        </div>
        ${
          !connected
            ? `<span style="font-size: 13px; color: #6d7175;">Connect your account to choose a plan.</span>`
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
