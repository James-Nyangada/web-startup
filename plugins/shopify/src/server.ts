import express, { type Express, type Request, type Response } from 'express';
import { type AppConfig, loadConfig } from './config.js';
import { createAuthRouter } from './auth.js';
import { createWebhooksRouter } from './webhooks.js';
import { createBillingRouter } from './billing.js';
import path from 'node:path';
import { createDashboardRouter } from './dashboard.js';
import { sessionStore, verifyAppBridgeToken } from './shopify.js';

export function requireAppBridgeToken(config: AppConfig) {
  return (req: Request, res: Response, next: () => void): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid App Bridge session token.' });
      return;
    }

    const token = authHeader.slice(7).trim();
    const verified = verifyAppBridgeToken(token, config.apiSecret, config.apiKey);
    if (!verified.valid || !verified.shop) {
      res.status(401).json({ error: 'Invalid or expired App Bridge session token.' });
      return;
    }

    (req as any).shopifyShop = verified.shop;
    (req as any).shopifyClaims = verified.claims;
    next();
  };
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const cookie of header.split(';')) {
    const [rawKey, ...rawValue] = cookie.trim().split('=');
    if (rawKey) {
      cookies[rawKey] = decodeURIComponent(rawValue.join('='));
    }
  }
  return cookies;
}

export function createServer(config: AppConfig = loadConfig()): Express {
  const app = express();

  // Capture raw body for Shopify Webhook HMAC verification
  app.use(
    express.json({
      verify: (req: Request, _res: Response, buf: Buffer) => {
        (req as any).rawBody = buf;
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use((req: Request, _res: Response, next: () => void) => {
    (req as any).cookies = parseCookies(req.headers.cookie);
    next();
  });

  // Serve static assets (Polaris CSS, App Bridge JS)
  app.use(express.static(path.join(process.cwd(), 'plugins/shopify/public')));
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', service: 'everyvisitor-shopify-app' });
  });

  const appBridgeAuth = requireAppBridgeToken(config);

  // On-demand scan trigger from Shopify Admin - strictly requires App Bridge token
  app.post('/api/scan', appBridgeAuth, async (req: Request, res: Response): Promise<void> => {
    const shop = (req as any).shopifyShop;
    const session = shop ? await sessionStore.findInDb(shop) : undefined;
    const siteId = session?.siteId;
    const apiKey = session?.apiKey;

    if (!siteId || !apiKey) {
      res.status(409).json({
        error: 'This store is not linked to an EveryVisitor account yet. Connect your account first.',
        code: 'not_connected',
      });
      return;
    }

    try {
      const scanRes = await fetch(`${config.everyvisitorApiUrl}/v1/sites/${siteId}/scans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ trigger: 'plugin' }),
      });

      if (!scanRes.ok) {
        res.status(502).json({ error: 'Failed to queue scan on EveryVisitor server.' });
        return;
      }

      const scanData = await scanRes.json();
      res.status(200).json({ success: true, data: scanData });
    } catch (err: unknown) {
      console.error('Scan trigger error:', err);
      res.status(500).json({ error: 'Internal error triggering scan.' });
    }
  });

  // Mount routers
  app.use('/api/connect-manual', appBridgeAuth);
  app.use('/api/billing/subscribe', appBridgeAuth);
  app.use('/api', createAuthRouter(config));
  app.use('/api', createWebhooksRouter(config));
  app.use('/api', createBillingRouter(config));
  app.use('/', createDashboardRouter(config));

  return app;
}
