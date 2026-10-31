import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import type { AppConfig } from './config.js';
import { isValidShopDomain, verifyOAuthHmac, sessionStore } from './shopify.js';
import { syncPlanWithEveryVisitor } from './billing.js';

export function createAuthRouter(config: AppConfig): Router {
  const router = Router();

  // GET /api/auth - Initiates Shopify OAuth install
  router.get('/auth', (req: Request, res: Response): void => {
    const shop = String(req.query.shop || '');

    if (!isValidShopDomain(shop)) {
      res.status(400).send('Invalid shop domain. Must be in the format store-name.myshopify.com.');
      return;
    }

    const state = crypto.randomBytes(16).toString('hex');
    const redirectUri = `${config.host}/api/auth/callback`;
    const scopes = config.scopes.join(',');

    res.cookie('everyvisitor_shopify_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.host.startsWith('https'),
      maxAge: 10 * 60 * 1000, // 10 minutes
    });

    const installUrl =
      `https://${shop}/admin/oauth/authorize?` +
      `client_id=${encodeURIComponent(config.apiKey)}&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${encodeURIComponent(state)}`;

    res.redirect(installUrl);
  });

  // GET /api/auth/callback - Handles Shopify OAuth callback
  router.get('/auth/callback', async (req: Request, res: Response): Promise<void> => {
    const { shop, code, state, hmac } = req.query as Record<string, string>;

    if (!shop || !code || !hmac) {
      res.status(400).send('Missing required OAuth callback parameters.');
      return;
    }

    if (!isValidShopDomain(shop)) {
      res.status(400).send('Invalid shop domain.');
      return;
    }

    // Verify HMAC
    if (!verifyOAuthHmac(req.query, config.apiSecret)) {
      res.status(400).send('HMAC validation failed.');
      return;
    }

    // Verify state cookie
    const savedState = req.cookies?.everyvisitor_shopify_state;
    if (!savedState || savedState !== state) {
      res.status(400).send('State verification failed. Please try installing again.');
      return;
    }

    res.clearCookie('everyvisitor_shopify_state');

    try {
      // Exchange code for access token
      const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: config.apiKey,
          client_secret: config.apiSecret,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        res.status(502).send('Failed to exchange authorization code for access token.');
        return;
      }

      const tokenData = (await tokenResponse.json()) as { access_token: string; scope: string };
      const accessToken = tokenData.access_token;

      // Check if this shop already has an existing session
      const existing = await sessionStore.findInDb(shop);

      sessionStore.set(shop, {
        shop,
        accessToken,
        scope: tokenData.scope,
        siteId: existing?.siteId,
        apiKey: existing?.apiKey,
        orgId: existing?.orgId,
        plan: existing?.plan || 'free',
        installedAt: existing?.installedAt || new Date().toISOString(),
      });

      // Redirect into Shopify admin embedded app
      const hostParam = req.query.host ? `&host=${encodeURIComponent(String(req.query.host))}` : '';
      const cleanShop = shop.replace('.myshopify.com', '');
      const embeddedUrl = `https://admin.shopify.com/store/${cleanShop}/apps/${encodeURIComponent(
        config.apiKey,
      )}?shop=${encodeURIComponent(shop)}${hostParam}`;

      res.redirect(embeddedUrl);
    } catch (err: unknown) {
      console.error('OAuth token exchange error:', err);
      res.status(500).send('Internal server error during OAuth callback.');
    }
  });

  // GET /api/connect-start - Initiates merchant EveryVisitor account linking handshake
  router.get('/connect-start', (req: Request, res: Response): void => {
    const shop = String(req.query.shop || '');
    if (!isValidShopDomain(shop)) {
      res.status(400).send('Invalid shop domain.');
      return;
    }

    const state = crypto.randomBytes(16).toString('hex');
    // One cookie per attempt, so a second click or tab cannot invalidate the first.
    res.cookie(`ev_link_${state}`, '1', {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.host.startsWith('https'),
      maxAge: 15 * 60 * 1000,
    });

    const returnUrl = `${config.host}/api/connect-callback?shop=${encodeURIComponent(shop)}`;
    const handshakeUrl = `${config.appUrl}/connect/start?url=${encodeURIComponent(
      `https://${shop}`,
    )}&name=${encodeURIComponent(shop.replace('.myshopify.com', ''))}&platform=shopify&return_url=${encodeURIComponent(
      returnUrl,
    )}&state=${encodeURIComponent(state)}`;

    res.redirect(handshakeUrl);
  });

  // GET /api/connect-callback - Receives the single-use connect code from the EveryVisitor handshake
  // and redeems it server-side for this shop's site-scoped API key.
  router.get('/connect-callback', async (req: Request, res: Response): Promise<void> => {
    const { shop, code, site_id, state } = req.query as Record<string, string>;

    if (!shop || !isValidShopDomain(shop) || !code) {
      res.status(400).send('Missing or invalid handshake parameters.');
      return;
    }

    if (!state || !/^[A-Za-z0-9_-]{1,64}$/.test(state) || req.cookies?.[`ev_link_${state}`] !== '1') {
      res.status(400).send('Invalid handshake state. Please start the connection again.');
      return;
    }
    res.clearCookie(`ev_link_${state}`);

    const session = await sessionStore.findInDb(shop);
    if (!session) {
      res.status(404).send('This store has not installed the app. Install it first, then connect.');
      return;
    }

    try {
      const exchangeRes = await fetch(`${config.everyvisitorApiUrl}/v1/sites/connect/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!exchangeRes.ok) {
        res.status(502).send('The connection code is invalid or expired. Please connect again.');
        return;
      }
      const exchanged = (await exchangeRes.json()) as {
        data?: { siteId?: string; orgId?: string; apiKey?: { secret?: string } };
      };
      const secret = exchanged.data?.apiKey?.secret;
      if (!secret) {
        res.status(502).send('No API key was returned by EveryVisitor.');
        return;
      }

      session.apiKey = secret;
      session.siteId = exchanged.data?.siteId || site_id || session.siteId;
      if (exchanged.data?.orgId) session.orgId = exchanged.data.orgId;
      sessionStore.set(shop, session);

      // A subscription taken before linking is applied now (the backend re-checks it with Shopify).
      const verified = await syncPlanWithEveryVisitor(config, shop, session.plan || 'trial');
      if (verified) {
        session.plan = verified;
        sessionStore.set(shop, session);
      }
    } catch (err) {
      console.error('EveryVisitor connect exchange failed:', err);
      res.status(502).send('Could not reach EveryVisitor. Please try again.');
      return;
    }

    const cleanShop = shop.replace('.myshopify.com', '');
    res.redirect(
      `https://admin.shopify.com/store/${cleanShop}/apps/${encodeURIComponent(
        config.apiKey,
      )}?shop=${encodeURIComponent(shop)}&account_connected=1`,
    );
  });

  // POST /api/connect-manual - Save a per-shop site-scoped API key. Requires an App Bridge session
  // token (mounted in server.ts); the shop always comes from the verified token, never the body.
  router.post('/connect-manual', async (req: Request, res: Response): Promise<void> => {
    const shop = (req as any).shopifyShop as string | undefined;
    const { apiKey, siteId } = req.body as { apiKey?: string; siteId?: string };
    if (!shop || !apiKey) {
      res.status(400).json({ error: 'An App Bridge session and apiKey are required.' });
      return;
    }

    const session = await sessionStore.findInDb(shop);
    if (!session) {
      res.status(404).json({ error: 'Shop session not found.' });
      return;
    }

    session.apiKey = apiKey.trim();
    if (siteId) {
      session.siteId = siteId.trim();
    }
    sessionStore.set(shop, session);
    res.status(200).json({ success: true, message: 'API key linked to store.' });
  });

  return router;
}
