import { Router, type Request, type Response } from 'express';
import type { AppConfig } from './config.js';
import { verifyWebhookHmac, sessionStore } from './shopify.js';
import { syncPlanWithEveryVisitor } from './billing.js';

export function createWebhooksRouter(config: AppConfig): Router {
  const router = Router();

  // Middleware to verify Shopify Webhook HMAC
  const verifyHmacMiddleware = (req: Request, res: Response, next: () => void): void => {
    const hmacHeader = req.get('x-shopify-hmac-sha256');
    const rawBody = (req as any).rawBody;

    if (!verifyWebhookHmac(rawBody, hmacHeader, config.apiSecret)) {
      res.status(401).json({ error: 'HMAC verification failed' });
      return;
    }
    next();
  };

  /**
   * Mandatory Privacy Webhook 1: Customer Data Request
   * Customers can request their data from store owners. When requested, Shopify contacts EveryVisitor.
   * EveryVisitor only scans public storefront HTML and stores no shopper/customer personal data.
   */
  router.post(
    '/webhooks/customers/data_request',
    verifyHmacMiddleware,
    (req: Request, res: Response): void => {
      const payload = req.body;
      console.log(`[Shopify Webhook] customers/data_request for shop ${payload?.shop_domain}`);

      // Respond 200 acknowledging request. No customer data is stored in EveryVisitor.
      res.status(200).json({
        message: 'EveryVisitor does not collect or retain end-customer personal data.',
        customer_data: null,
      });
    },
  );

  /**
   * Mandatory Privacy Webhook 2: Customer Redact
   * Store owners request erasure of customer data.
   */
  router.post(
    '/webhooks/customers/redact',
    verifyHmacMiddleware,
    (req: Request, res: Response): void => {
      const payload = req.body;
      console.log(`[Shopify Webhook] customers/redact for shop ${payload?.shop_domain}`);

      // Respond 200. No customer records to redact.
      res.status(200).json({
        message: 'Acknowledged. EveryVisitor holds no customer personal records.',
      });
    },
  );

  /**
   * Mandatory Privacy Webhook 3: Shop Redact
   * 48 hours after an app is uninstalled, Shopify sends shop/redact to wipe stored store data.
   */
  router.post(
    '/webhooks/shop/redact',
    verifyHmacMiddleware,
    (req: Request, res: Response): void => {
      const payload = req.body;
      const shop = String(payload?.shop_domain || '');
      console.log(`[Shopify Webhook] shop/redact for shop ${shop}`);

      if (shop) {
        sessionStore.delete(shop);
      }

      res.status(200).json({
        message: 'Shop session and local records cleared.',
      });
    },
  );

  /**
   * App Uninstalled Webhook
   * Sent immediately when a merchant removes the app from their store.
   */
  router.post(
    '/webhooks/app/uninstalled',
    verifyHmacMiddleware,
    (req: Request, res: Response): void => {
      const payload = req.body;
      const shop = String(payload?.myshopify_domain || payload?.shop_domain || '');
      console.log(`[Shopify Webhook] app/uninstalled for shop ${shop}`);

      if (shop) {
        sessionStore.delete(shop);
      }

      res.status(200).json({ message: 'App uninstall acknowledged.' });
    },
  );

  /**
   * App Subscriptions Update Webhook
   * Sent whenever a merchant accepts, updates, or cancels their app subscription.
   */
  router.post(
    '/webhooks/app_subscriptions/update',
    verifyHmacMiddleware,
    async (req: Request, res: Response): Promise<void> => {
      const payload = req.body;
      const shopDomain =
        req.get('x-shopify-shop-domain') ||
        payload?.shop_domain ||
        payload?.myshopify_domain ||
        '';

      const subscription = payload?.app_subscription;
      console.log(
        `[Shopify Webhook] app_subscriptions/update for shop ${shopDomain}: status=${subscription?.status}, name=${subscription?.name}`,
      );

      if (shopDomain && subscription) {
        const status = String(subscription.status || '').toUpperCase();
        const subName = String(subscription.name || '').toLowerCase();
        let planId = 'trial';

        if (status === 'ACTIVE') {
          if (subName.includes('growth') || subName.includes('pro')) {
            planId = 'growth';
          } else if (subName.includes('store') || subName.includes('starter')) {
            planId = 'store';
          }
        }

        const session = await sessionStore.findInDb(shopDomain);
        if (session) {
          session.plan = planId;
          session.subscriptionId = subscription.admin_graphql_api_id || session.subscriptionId;
          sessionStore.set(shopDomain, session);
        }

        await syncPlanWithEveryVisitor(config, shopDomain, planId);
      }

      res.status(200).json({ received: true });
    },
  );

  return router;
}
