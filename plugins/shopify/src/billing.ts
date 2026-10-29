import { Router, type Request, type Response } from 'express';
import type { AppConfig } from './config.js';
import { sessionStore, isValidShopDomain } from './shopify.js';

export interface BillingPlan {
  id: string;
  name: string;
  price: number;
  interval: 'EVERY_30_DAYS' | 'ANNUAL';
  features: string[];
}

export const SHOPIFY_PLANS: Record<string, BillingPlan> = {
  trial: {
    id: 'trial',
    name: '14-Day Free Trial',
    price: 0,
    interval: 'EVERY_30_DAYS',
    features: [
      '50 pages per scan',
      'Weekly automated WCAG scans',
      '2 manual scans per day',
      'Top issue previews',
      'Automated WCAG 2.2 scoring',
    ],
  },
  store: {
    id: 'store',
    name: 'Store Plan',
    price: 29.0,
    interval: 'EVERY_30_DAYS',
    features: [
      'Up to 250 pages per scan',
      'Weekly automated scans',
      '2 manual scans per day',
      'Liquid theme fix guides',
      'Evidence pack export',
    ],
  },
  growth: {
    id: 'growth',
    name: 'Growth Plan',
    price: 79.0,
    interval: 'EVERY_30_DAYS',
    features: [
      'Up to 500 pages per scan',
      'Daily automated scans',
      '5 manual scans per day',
      'Email regression alerts',
      'Slack webhook integration',
      'Priority Liquid theme fix guides',
      'Evidence pack export',
    ],
  },
};

// Aliases for backwards compatibility
SHOPIFY_PLANS.free = SHOPIFY_PLANS.trial;
SHOPIFY_PLANS.starter = SHOPIFY_PLANS.store;
SHOPIFY_PLANS.pro = SHOPIFY_PLANS.growth;

/**
 * Asks EveryVisitor to apply this shop's plan. The backend confirms the subscription with Shopify
 * itself and ignores the plan we send, so the returned plan is the source of truth (null if it
 * could not be confirmed).
 */
export async function syncPlanWithEveryVisitor(
  config: AppConfig,
  shop: string,
  planId: string,
): Promise<string | null> {
  const session = await sessionStore.findInDb(shop);
  const apiKey = session?.apiKey;
  if (!apiKey) return null;

  try {
    const res = await fetch(`${config.everyvisitorApiUrl}/v1/sites/shopify-plan-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ shop, plan: planId }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { plan?: string } };
    return body.data?.plan ?? null;
  } catch (err) {
    console.error('Plan sync error:', err);
    return null;
  }
}

const APP_SUBSCRIPTION_CREATE_MUTATION = `
  mutation AppSubscriptionCreate(
    $name: String!,
    $lineItems: [AppSubscriptionLineItemInput!]!,
    $returnUrl: URL!,
    $test: Boolean
  ) {
    appSubscriptionCreate(
      name: $name,
      lineItems: $lineItems,
      returnUrl: $returnUrl,
      test: $test
    ) {
      appSubscription {
        id
        status
      }
      confirmationUrl
      userErrors {
        field
        message
      }
    }
  }
`;

export function createBillingRouter(config: AppConfig): Router {
  const router = Router();

  // POST /api/billing/subscribe - Initiates recurring Shopify subscription
  router.post('/billing/subscribe', async (req: Request, res: Response): Promise<void> => {
    const body = (req.body || {}) as { shop?: string; planId?: string };
    const shop = (req as any).shopifyShop as string | undefined;
    const planId = body.planId;

    if (!shop || !planId || !SHOPIFY_PLANS[planId]) {
      res.status(400).json({ error: 'Valid shop and planId (trial, store, growth) are required.' });
      return;
    }

    const plan = SHOPIFY_PLANS[planId]!;
    const linked = await sessionStore.findInDb(shop);
    if (!linked?.apiKey) {
      res.status(409).json({
        error: 'Connect your EveryVisitor account before choosing a plan.',
        code: 'not_connected',
      });
      return;
    }
    if (plan.price === 0) {
      const session = await sessionStore.findInDb(shop);
      if (session) {
        session.plan = plan.id;
        sessionStore.set(shop, session);
        await syncPlanWithEveryVisitor(config, shop, plan.id);
      }
      res.status(200).json({ success: true, plan: plan.id });
      return;
    }

    const session = await sessionStore.findInDb(shop);
    if (!session || !session.accessToken) {
      res.status(401).json({ error: 'Store not authenticated or access token missing.' });
      return;
    }

    const returnUrl = `${config.host}/api/billing/confirm?shop=${encodeURIComponent(shop)}&planId=${encodeURIComponent(planId)}`;
    const isDev = process.env.NODE_ENV !== 'production';

    try {
      const response = await fetch(`https://${shop}/admin/api/2024-10/graphql.json`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': session.accessToken,
        },
        body: JSON.stringify({
          query: APP_SUBSCRIPTION_CREATE_MUTATION,
          variables: {
            name: `EveryVisitor ${plan.name}`,
            returnUrl,
            test: isDev,
            lineItems: [
              {
                plan: {
                  appRecurringPricingDetails: {
                    price: { amount: plan.price, currencyCode: 'USD' },
                    interval: plan.interval,
                  },
                },
              },
            ],
          },
        }),
      });

      const data = (await response.json()) as any;
      const result = data?.data?.appSubscriptionCreate;

      if (result?.userErrors?.length) {
        res.status(400).json({ error: result.userErrors[0].message });
        return;
      }

      const confirmationUrl = result?.confirmationUrl;
      res.status(200).json({ confirmationUrl });
    } catch (err: unknown) {
      console.error('Shopify billing subscription error:', err);
      res.status(500).json({ error: 'Failed to create Shopify subscription.' });
    }
  });

  // GET /api/billing/confirm - Shopify redirects back after merchant approves charge
  router.get('/billing/confirm', async (req: Request, res: Response): Promise<void> => {
    const { shop, planId } = req.query as Record<string, string>;

    if (shop && isValidShopDomain(shop)) {
      const session = await sessionStore.findInDb(shop);
      if (session) {
        // The plan in the query string is untrusted; only the verified result is stored.
        const verified = await syncPlanWithEveryVisitor(config, shop, planId || 'trial');
        if (verified) {
          session.plan = verified;
          sessionStore.set(shop, session);
        }
      }
    }

    const cleanShop = (shop || '').replace('.myshopify.com', '');
    const embeddedUrl = `https://admin.shopify.com/store/${cleanShop}/apps/${encodeURIComponent(
      config.apiKey,
    )}?shop=${encodeURIComponent(shop || '')}&billing_success=true`;

    res.redirect(embeddedUrl);
  });

  return router;
}
