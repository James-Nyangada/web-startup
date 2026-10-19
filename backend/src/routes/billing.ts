import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { asOrgId } from '../db/repositories/org-scope.js';
import { requireOrgRole } from '../middleware/org.js';
import {
  getPlanDefinition,
  getPlanLimits,
  getPriceIdForPlan,
  getPlanForPriceId,
} from '../shared/plans.js';
import { processPaddleEvent, verifyPaddleWebhookSignature } from '../billing/paddle.js';
import { logger } from '../lib/logger.js';

const checkoutSchema = z.object({
  plan: z.enum(['store', 'growth', 'agency', 'agency_pro']).optional(),
  interval: z.enum(['month', 'year']).default('month'),
  priceId: z.string().optional(),
});

const cancelSchema = z.object({
  reason: z.string().max(500).optional(),
});

const changePlanSchema = z.object({
  plan: z.enum(['store', 'growth', 'agency', 'agency_pro']),
  interval: z.enum(['month', 'year']).default('month'),
  preview: z.boolean().optional(),
});

export function orgBillingRouter(repos: Repositories): Router {
  const router = Router({ mergeParams: true });
  // All billing routes are owner-only per Spec Section 7.9
  router.use(requireOrgRole('owner'));

  // GET /v1/orgs/:orgId/billing - Current plan, period, usage, and subscription details
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const org = await repos.organizations.findById(req.orgId!);
    if (!org) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Organisation not found' } });
      return;
    }

    const plan = org.plan ?? 'trial';
    const limits = getPlanLimits(plan);
    const def = getPlanDefinition(plan);
    const sub = await repos.subscriptions.findByOrgId(req.orgId!);

    // Real usage meters
    const [sitesActive, teamMembersCount, aiUsageCount] = await Promise.all([
      repos.sites.countActive(req.orgId!),
      repos.memberships.count(req.orgId!),
      repos.aiSuggestions.getMonthlyUsage(req.orgId!, new Date().toISOString().slice(0, 7)),
    ]);

    const invoicesList = await repos.invoices.listByOrgId(req.orgId!, 10);

    const isSandbox = (process.env.PADDLE_ENV || 'sandbox') === 'sandbox';
    const customerPortalUrl = org.paddleCustomerId
      ? `https://${isSandbox ? 'sandbox-' : ''}customer-portal.paddle.com`
      : null;

    res.status(200).json({
      data: {
        plan,
        planName: def.name,
        billingStatus: org.billingStatus || 'trialing',
        trialEndsAt: org.trialEndsAt,
        paddleCustomerId: org.paddleCustomerId,
        subscription: sub
          ? {
              id: sub.paddleSubscriptionId,
              priceId: sub.paddlePriceId,
              plan: sub.plan,
              interval: sub.interval,
              status: sub.status,
              currentPeriodStart: sub.currentPeriodStart,
              currentPeriodEnd: sub.currentPeriodEnd,
              cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
              scheduledChange: sub.scheduledChange,
            }
          : null,
        period: {
          currentPeriodStart: sub?.currentPeriodStart ?? org.createdAt,
          currentPeriodEnd: sub?.currentPeriodEnd ?? org.trialEndsAt ?? null,
        },
        cancelAtPeriodEnd: sub?.cancelAtPeriodEnd ?? false,
        usage: {
          sites: {
            current: sitesActive,
            limit: limits.maxSites,
          },
          teamMembers: {
            current: teamMembersCount,
            limit: limits.teamMembers,
          },
          aiSuggestions: {
            current: aiUsageCount,
            limit: limits.aiSuggestionsMonthly,
          },
        },
        customerPortalUrl,
        invoices: invoicesList,
      },
    });
  });

  // POST /v1/orgs/:orgId/billing/checkout - Return Paddle checkout settings
  router.post('/checkout', async (req: Request, res: Response): Promise<void> => {
    const parse = checkoutSchema.safeParse(req.body);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message } });
      return;
    }

    let priceId = parse.data.priceId;
    let selectedPlan = parse.data.plan;
    const interval = parse.data.interval;

    if (!priceId && selectedPlan) {
      priceId = getPriceIdForPlan(selectedPlan, interval);
    } else if (priceId && !selectedPlan) {
      const resolved = getPlanForPriceId(priceId);
      if (resolved && resolved.plan !== 'trial') {
        selectedPlan = resolved.plan;
      }
    }

    if (!priceId) {
      res.status(400).json({
        error: { code: 'INVALID_PRICE', message: 'Valid plan or priceId is required' },
      });
      return;
    }

    const org = await repos.organizations.findById(req.orgId!);
    if (!org) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Organisation not found' } });
      return;
    }

    const customerEmail = req.auth?.user.email;
    const paddleEnv = process.env.PADDLE_ENV || 'sandbox';
    const clientToken = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN || 'test_token';

    res.status(200).json({
      data: {
        priceId,
        plan: selectedPlan,
        interval,
        customerEmail,
        customData: {
          orgId: req.orgId,
        },
        paddleEnvironment: paddleEnv,
        clientToken,
      },
    });
  });

  // POST /v1/orgs/:orgId/billing/change-plan - Upgrade or Downgrade plan
  router.post('/change-plan', async (req: Request, res: Response): Promise<void> => {
    const parse = changePlanSchema.safeParse(req.body);
    if (!parse.success) {
      res
        .status(400)
        .json({ error: { code: 'VALIDATION_ERROR', message: parse.error.issues[0]?.message } });
      return;
    }

    const { plan: targetPlan, interval, preview } = parse.data;
    const newPriceId = getPriceIdForPlan(targetPlan, interval);
    const sub = await repos.subscriptions.findByOrgId(req.orgId!);

    if (preview) {
      const def = getPlanDefinition(targetPlan);
      const limits = getPlanLimits(targetPlan);
      res.status(200).json({
        data: {
          preview: true,
          plan: targetPlan,
          interval,
          priceId: newPriceId,
          price: interval === 'year' ? def.priceAnnual : def.priceMonthly,
          limits,
          proration: 'prorated_immediately',
        },
      });
      return;
    }

    // Apply plan change
    if (sub) {
      await repos.subscriptions.upsert({
        ...sub,
        orgId: asOrgId(sub.orgId),
        paddlePriceId: newPriceId,
        plan: targetPlan,
        interval,
        cancelAtPeriodEnd: false,
      });
    }

    await repos.organizations.update(req.orgId!, {
      plan: targetPlan,
      billingStatus: 'active',
    });

    await repos.auditLog.write(req.orgId!, {
      actorId: req.auth?.user.id,
      actorType: 'user',
      action: 'billing.plan_changed',
      targetType: 'organization',
      targetId: req.orgId!,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      data: { plan: targetPlan, interval, priceId: newPriceId },
    });

    res.status(200).json({
      data: {
        success: true,
        plan: targetPlan,
        interval,
      },
    });
  });

  // POST /v1/orgs/:orgId/billing/cancel - Cancel at period end
  router.post('/cancel', async (req: Request, res: Response): Promise<void> => {
    const parse = cancelSchema.safeParse(req.body);
    const reason = parse.success ? parse.data.reason : undefined;

    const sub = await repos.subscriptions.findByOrgId(req.orgId!);
    if (!sub) {
      res.status(400).json({
        error: { code: 'NO_SUBSCRIPTION', message: 'No active subscription found to cancel' },
      });
      return;
    }

    await repos.subscriptions.setCancelAtPeriodEnd(req.orgId!, true);

    await repos.auditLog.write(req.orgId!, {
      actorId: req.auth?.user.id,
      actorType: 'user',
      action: 'billing.subscription_cancelled',
      targetType: 'subscription',
      targetId: sub.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      data: { reason: reason ?? null },
    });

    res.status(200).json({
      data: {
        success: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: sub.currentPeriodEnd,
        message:
          'Your subscription will remain active until the end of the current billing period.',
      },
    });
  });

  // POST /v1/orgs/:orgId/billing/resume - Undo scheduled cancel
  router.post('/resume', async (req: Request, res: Response): Promise<void> => {
    const sub = await repos.subscriptions.findByOrgId(req.orgId!);
    if (!sub) {
      res.status(400).json({
        error: { code: 'NO_SUBSCRIPTION', message: 'No subscription found to resume' },
      });
      return;
    }

    await repos.subscriptions.setCancelAtPeriodEnd(req.orgId!, false);

    await repos.auditLog.write(req.orgId!, {
      actorId: req.auth?.user.id,
      actorType: 'user',
      action: 'billing.subscription_resumed',
      targetType: 'subscription',
      targetId: sub.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      data: {},
    });

    res.status(200).json({
      data: {
        success: true,
        cancelAtPeriodEnd: false,
        message: 'Subscription renewal has been resumed.',
      },
    });
  });

  // GET /v1/orgs/:orgId/billing/portal - Return customer portal URL
  router.get('/portal', async (req: Request, res: Response): Promise<void> => {
    const org = await repos.organizations.findById(req.orgId!);
    if (!org) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Organisation not found' } });
      return;
    }

    const isSandbox = (process.env.PADDLE_ENV || 'sandbox') === 'sandbox';
    const portalUrl = `https://${isSandbox ? 'sandbox-' : ''}customer-portal.paddle.com`;

    res.status(200).json({
      data: {
        url: portalUrl,
      },
    });
  });

  return router;
}

export function orgInvoicesRouter(repos: Repositories): Router {
  const router = Router({ mergeParams: true });
  router.use(requireOrgRole('owner'));

  // GET /v1/orgs/:orgId/invoices - Invoice list
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const invoices = await repos.invoices.listByOrgId(req.orgId!, limit);
    res.status(200).json({ data: { invoices } });
  });

  return router;
}

export function paddleWebhookRouter(repos: Repositories): Router {
  const router = Router();

  // POST /webhooks/paddle
  router.post('/', async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['paddle-signature'] as string | undefined;
    const bodyObj = req.body as Record<string, unknown>;
    const rawBody: Buffer | string =
      (req as Request & { rawBody?: Buffer }).rawBody ?? JSON.stringify(bodyObj);
    const secret = process.env.PADDLE_WEBHOOK_SECRET;

    const isValid = verifyPaddleWebhookSignature({
      rawBody,
      signatureHeader: signature,
      secret,
    });

    if (!isValid) {
      logger.warn({ ip: req.ip }, 'Paddle webhook signature verification failed');
      res
        .status(401)
        .json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid Paddle signature' } });
      return;
    }

    // Process event asynchronously/idempotently per Section 12.2
    const result = await processPaddleEvent(bodyObj, repos);

    res.status(200).json({
      received: true,
      handled: result.handled,
      duplicate: result.duplicate ?? false,
      eventType: result.eventType,
    });
  });

  return router;
}
