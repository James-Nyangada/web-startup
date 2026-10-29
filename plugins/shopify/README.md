# EveryVisitor Accessibility — Shopify Embedded App

EveryVisitor Accessibility is an embedded Shopify app built to provide Shopify merchants with automated WCAG 2.1 & 2.2 AA accessibility monitoring, theme issue detection, and actionable Liquid fix instructions.

---

## Features

* **One-Click Installation**: Merchants install directly from the Shopify App Store. OAuth proves store ownership automatically (`shopify` verification method).
* **Embedded Shopify Admin Dashboard**: Built with Shopify Polaris and App Bridge, showing live WCAG compliance scores, open critical/serious problems, and score breakdown.
* **Direct Theme Editor Deep Links**: "Fix in Theme" buttons take merchants directly to the exact Liquid template or section (`sections/header.liquid`, `sections/footer.liquid`, `sections/main-product.liquid`) where accessibility fixes are needed.
* **Shopify App Store Billing API**: Integrates with Shopify's GraphQL Billing API (`appSubscriptionCreate`) for recurring charges (Free tier, Starter $29/mo, Pro $79/mo).
* **GDPR & Mandatory Privacy Webhooks**: Fully compliant with mandatory Shopify App Store privacy requirements:
  - `customers/data_request`
  - `customers/redact`
  - `shop/redact`

---

## Local Development & Testing

### Prerequisites
* Node.js 20+
* Free Shopify Partners Account & Development Store
* Shopify CLI (`npm install -g @shopify/cli`)

### Setup
1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Fill in your Partner credentials:
   ```env
   SHOPIFY_API_KEY=your_client_id
   SHOPIFY_API_SECRET=your_client_secret
   HOST=https://your-tunnel-url.ngrok.app
   EVERYVISITOR_API_URL=https://api.everyvisitor.app
   EVERYVISITOR_API_KEY=psk_...
   ```
   For account linking, the EveryVisitor web app must also allow this app's host as a handshake
   return URL. Set it in the web app's environment (comma-separated hosts):
   ```env
   NEXT_PUBLIC_SHOPIFY_APP_HOSTS=your-tunnel-url.ngrok.app
   ```
   Run the backend migration `0023_distribution_shopify_sessions.sql` and set `DATABASE_URL` for
   the app so sessions are stored in Postgres.
3. Run test suite:
   ```bash
   npm test
   ```
4. Start development server:
   ```bash
   npm run dev
   ```

---

## Shopify App Store Review Checklist

Before submitting to the Shopify App Store:
- [x] Embedded in Shopify admin with App Bridge and Polaris components.
- [x] Mandatory privacy webhooks implemented (`customers/data_request`, `customers/redact`, `shop/redact`).
- [x] Webhook requests verified with `X-Shopify-Hmac-Sha256` header.
- [x] Subscriptions charged via Shopify Billing API (`appSubscriptionCreate`), not external payment links.
- [x] Free tier accessible without mandatory card entry.
- [x] Automated ownership verification without merchant having to copy tags.
- [x] App uninstalls cleanly without leaving orphan data.
