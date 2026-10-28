import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { PgBoss } from 'pg-boss';
import type { Repositories } from '../db/repositories/index.js';
import { asOrgId } from '../db/repositories/org-scope.js';
import { requireOrgRole } from '../middleware/org.js';
import {
  getPlanDefinition,
  getPlanLimits,
  getPriceIdForPlan,
  getPlanForPriceId,
} from '../shared/plans.js';
import {
  dispatchEmail,
  processPaddleEvent,
  verifyPaddleWebhookSignature,
} from '../billing/paddle.js';
import { type PaddleClient, defaultPaddleClient } from '../billing/paddle-api.js';
import { enqueuePaddleProcess } from '../worker/boss.js';
import { logger } from '../lib/logger.js';
import type { EmailSender } from '../emails/sender.js';

const checkoutSchema = z.object({
  plan: z.enum(['store', 'growth', 'agency', 'agency_pro']).optional(),
  interval: z.enum(['month', 'year']).default('month'),
  priceId: z.string().optional(),
});

const cancelSchema = z.object({
  reason: z
    .enum([
      'too_expensive',
      'missing_features',
      'fixed_issues',
      'hard_to_use',
      'switched_tool',
      'other',
    ])
    .or(z.string().max(500))
    .optional(),
  feedback: z.string().max(1000).optional(),
});

const changePlanSchema = z.object({
  plan: z.enum(['store', 'growth', 'agency', 'agency_pro']),
  interval: z.enum(['month', 'year']).default('month'),
  preview: z.boolean().optional(),
  pauseSiteIds: z.array(z.string()).optional(),
  removeMemberIds: z.array(z.string()).optional(),
  effectiveNow: z.boolean().optional(),
});

const PLAN_TIER_RANK: Record<string, number> = {
  trial: 0,
  store: 1,
  growth: 2,
  agency: 3,
  agency_pro: 4,
};

export interface OrgBillingRouterOptions {
  boss?: PgBoss;
  emailSender?: EmailSender;
}

export function orgBillingRouter(
  repos: Repositories,
  paddleClient: PaddleClient = defaultPaddleClient,
  options: OrgBillingRouterOptions = {},
): Router {
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

    let customerPortalUrl: string | null = null;
    if (org.paddleCustomerId) {
      const session = await paddleClient.createCustomerPortalSession(
        org.paddleCustomerId,
        sub ? [sub.paddleSubscriptionId] : undefined,
      );
      customerPortalUrl = session.url;
    }

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

  // POST /v1/orgs/:orgId/billing/sync - Apply a just-completed checkout without waiting for the
  // webhook. Reads the transaction from Paddle itself, so the client is never trusted for the
  // plan; it must belong to this org. The webhook that follows is idempotent.
  router.post('/sync', async (req: Request, res: Response): Promise<void> => {
    const parse = z.object({ transactionId: z.string().min(1) }).safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'transactionId is required' } });
      return;
    }
    if (!paddleClient.isConfigured()) {
      res.status(503).json({ error: { code: 'BILLING_UNAVAILABLE', message: 'Billing is not configured' } });
      return;
    }

    const txn = await paddleClient.getTransaction(parse.data.transactionId);
    const txnOrgId = txn?.custom_data?.orgId ?? txn?.custom_data?.org_id;
    if (!txn || txnOrgId !== req.orgId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction not found' } });
      return;
    }

    const subscriptionId = (txn as { subscription_id?: string | null }).subscription_id;
    if (!subscriptionId || !['completed', 'paid', 'billed'].includes(String(txn.status))) {
      // Paddle has not attached the subscription yet; the client retries shortly.
      res.status(202).json({ data: { synced: false, pending: true } });
      return;
    }

    const sub = await paddleClient.getSubscriptionRaw(subscriptionId);
    if (!sub) {
      res.status(202).json({ data: { synced: false, pending: true } });
      return;
    }

    const processOpts = {
      isReplay: true,
      boss: options.boss,
      emailSender: options.emailSender,
      appUrl: process.env.APP_URL,
    };
    const occurredAt = new Date().toISOString();
    const orgData = { custom_data: { orgId: req.orgId } };
    await processPaddleEvent(
      {
        event_id: `sync_${subscriptionId}`,
        event_type: 'subscription.activated',
        occurred_at: occurredAt,
        data: { ...sub, ...orgData },
      },
      repos,
      processOpts,
    );
    await processPaddleEvent(
      {
        event_id: `sync_${txn.id}`,
        event_type: 'transaction.completed',
        occurred_at: occurredAt,
        data: { ...txn, ...orgData },
      },
      repos,
      processOpts,
    );

    const org = await repos.organizations.findById(req.orgId!);
    res.status(200).json({ data: { synced: true, plan: org?.plan ?? null } });
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

    const {
      plan: targetPlan,
      interval,
      preview,
      pauseSiteIds = [],
      removeMemberIds = [],
      effectiveNow,
    } = parse.data;

    // A staff override changes limits, not what the customer is billed for.
    const currentPlan = req.org?.basePlan ?? req.org?.plan ?? 'trial';
    const sub = await repos.subscriptions.findByOrgId(req.orgId!);
    const currentInterval = (sub?.interval as 'month' | 'year' | undefined) ?? 'month';

    const currentRank = PLAN_TIER_RANK[currentPlan] ?? 0;
    const targetRank = PLAN_TIER_RANK[targetPlan] ?? 0;

    const isUpgrade =
      targetRank > currentRank ||
      (targetRank === currentRank && currentInterval === 'month' && interval === 'year');
    const isDowngrade =
      targetRank < currentRank ||
      (targetRank === currentRank && currentInterval === 'year' && interval === 'month');

    const targetLimits = getPlanLimits(targetPlan);
    const targetDef = getPlanDefinition(targetPlan);
    const targetPrice = interval === 'year' ? targetDef.priceAnnual : targetDef.priceMonthly;
    const newPriceId = getPriceIdForPlan(targetPlan, interval);

    // Check active sites and members
    const allSites = await repos.sites.list(req.orgId!, {});
    const activeSites = allSites.filter((s) => s.status !== 'paused');
    const excessSites = Math.max(0, activeSites.length - targetLimits.maxSites);

    const members = await repos.memberships.list(req.orgId!);
    const excessMembers = Math.max(0, members.length - targetLimits.teamMembers);

    const requiresPause = isDowngrade && (excessSites > 0 || excessMembers > 0);

    // Calculate proration or effective schedule
    let estimatedProratedCents = 0;
    let proration: 'immediate_prorated' | 'next_period' = 'immediate_prorated';
    let effectiveDate: string | null = null;

    if (isUpgrade) {
      proration = 'immediate_prorated';
      if (sub?.currentPeriodEnd && sub.currentPeriodStart) {
        const now = Date.now();
        const end = sub.currentPeriodEnd.getTime();
        const start = sub.currentPeriodStart.getTime();
        const totalDuration = Math.max(1, end - start);
        const remainingRatio = Math.max(0, Math.min(1, (end - now) / totalDuration));

        const currentDef = getPlanDefinition(currentPlan);
        const currentPrice =
          currentInterval === 'year' ? currentDef.priceAnnual : currentDef.priceMonthly;
        const creditCents = Math.round(currentPrice * 100 * remainingRatio);
        const chargeCents = Math.round(targetPrice * 100 * remainingRatio);
        estimatedProratedCents = Math.max(0, chargeCents - creditCents);
      }
    } else if (isDowngrade) {
      proration = 'next_period';
      effectiveDate = sub?.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null;
    }

    if (preview) {
      res.status(200).json({
        data: {
          preview: true,
          isUpgrade,
          isDowngrade,
          currentPlan,
          targetPlan,
          targetInterval: interval,
          priceId: newPriceId,
          price: targetPrice,
          proration,
          estimatedProratedCents,
          effectiveDate,
          requiresPause,
          excessSites,
          excessMembers,
          activeSites: activeSites.map((s) => ({
            id: s.id,
            name: s.name,
            rootUrl: s.rootUrl,
            score: s.score,
          })),
          members: members.map((m) => ({
            userId: m.userId,
            email: m.email,
            role: m.role,
          })),
        },
      });
      return;
    }

    // Apply pause requirement validation for downgrades
    if (requiresPause) {
      if (pauseSiteIds.length < excessSites) {
        res.status(422).json({
          error: {
            code: 'PLAN_LIMIT',
            message: `You must select at least ${excessSites} site(s) to pause before downgrading to ${targetLimits.name}.`,
            details: {
              limit: targetLimits.maxSites,
              current: activeSites.length,
              excessSites,
              excessMembers,
            },
          },
        });
        return;
      }

      // Pause selected sites (retains all data, no data deleted!)
      for (const siteId of pauseSiteIds) {
        await repos.sites.pause(req.orgId!, siteId);
        await repos.auditLog.write(req.orgId!, {
          actorId: req.auth?.user.id,
          actorType: 'user',
          action: 'site.paused',
          targetId: siteId,
          targetType: 'site',
          data: { reason: 'downgrade_overflow' },
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }

      // Remove excess members if specified
      for (const memberId of removeMemberIds) {
        await repos.memberships.remove(req.orgId!, memberId);
        await repos.auditLog.write(req.orgId!, {
          actorId: req.auth?.user.id,
          actorType: 'user',
          action: 'member.removed',
          targetId: memberId,
          targetType: 'membership',
          data: { reason: 'downgrade_overflow' },
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
      }
    }

    // Upgrade or immediate downgrade (e.g. trial or effectiveNow)
    if (isUpgrade || effectiveNow || !sub?.currentPeriodEnd) {
      // Update subscription in Paddle if an active Paddle subscription exists
      if (sub?.paddleSubscriptionId) {
        await paddleClient.updateSubscription(sub.paddleSubscriptionId, {
          priceId: newPriceId,
          prorationBillingMode: isUpgrade ? 'prorated_immediately' : 'full_next_billing_period',
        });
      }

      if (sub) {
        await repos.subscriptions.upsert({
          ...sub,
          orgId: asOrgId(sub.orgId),
          paddlePriceId: newPriceId,
          plan: targetPlan,
          interval,
          cancelAtPeriodEnd: false,
          scheduledChange: null,
        });
      }

      await repos.organizations.update(req.orgId!, {
        plan: targetPlan,
        billingStatus: 'active',
      });

      await repos.auditLog.write(req.orgId!, {
        actorId: req.auth?.user.id,
        actorType: 'user',
        action: isUpgrade ? 'billing.upgraded' : 'billing.plan_changed',
        targetType: 'organization',
        targetId: req.orgId!,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        data: { plan: targetPlan, interval, priceId: newPriceId },
      });

      // Record compliance evidence event for all sites (P5-01)
      const changePlanSites = await repos.sites.list(req.orgId!);
      for (const s of changePlanSites) {
        await repos.evidenceEvents.record(req.orgId!, {
          siteId: s.id,
          type: 'plan_changed',
          actorId: req.auth?.user.id,
          data: { plan: targetPlan, interval, priceId: newPriceId },
        });
      }

      res.status(200).json({
        data: {
          success: true,
          plan: targetPlan,
          interval,
          isUpgrade,
          isDowngrade: false,
          scheduled: false,
          effectiveDate: null,
        },
      });
      return;
    }

    // Scheduled downgrade for next period
    if (sub?.paddleSubscriptionId) {
      await paddleClient.updateSubscription(sub.paddleSubscriptionId, {
        priceId: newPriceId,
        prorationBillingMode: 'full_next_billing_period',
      });
    }

    const scheduledChangeData = {
      action: 'downgrade',
      plan: targetPlan,
      interval,
      effectiveAt: sub.currentPeriodEnd.toISOString(),
      pauseSiteIds,
    };

    await repos.subscriptions.upsert({
      ...sub,
      orgId: asOrgId(sub.orgId),
      scheduledChange: scheduledChangeData,
    });

    await repos.auditLog.write(req.orgId!, {
      actorId: req.auth?.user.id,
      actorType: 'user',
      action: 'billing.downgrade_scheduled',
      targetType: 'organization',
      targetId: req.orgId!,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      data: scheduledChangeData,
    });

    res.status(200).json({
      data: {
        success: true,
        plan: targetPlan,
        interval,
        isUpgrade: false,
        isDowngrade: true,
        scheduled: true,
        effectiveDate: sub.currentPeriodEnd.toISOString(),
      },
    });
  });

  // POST /v1/orgs/:orgId/billing/cancel - Cancel at period end with reason survey
  router.post('/cancel', async (req: Request, res: Response): Promise<void> => {
    const parse = cancelSchema.safeParse(req.body);
    const { reason = 'unspecified', feedback = null } = parse.success ? parse.data : {};

    const sub = await repos.subscriptions.findByOrgId(req.orgId!);
    if (!sub) {
      res.status(400).json({
        error: { code: 'NO_SUBSCRIPTION', message: 'No active subscription found to cancel' },
      });
      return;
    }

    if (sub.paddleSubscriptionId) {
      await paddleClient.cancelSubscription(sub.paddleSubscriptionId, {
        effectiveFrom: 'next_billing_period',
      });
    }

    const scheduledChange = {
      action: 'cancel',
      reason,
      feedback,
      effectiveAt: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    };

    await repos.subscriptions.upsert({
      ...sub,
      orgId: asOrgId(sub.orgId),
      cancelAtPeriodEnd: true,
      scheduledChange,
    });
    await repos.subscriptions.setCancelAtPeriodEnd(req.orgId!, true);

    await repos.auditLog.write(req.orgId!, {
      actorId: req.auth?.user.id,
      actorType: 'user',
      action: 'billing.subscription_cancelled',
      targetType: 'subscription',
      targetId: sub.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      data: scheduledChange,
    });

    // Confirm by email now; the "access ended" email follows when Paddle's cancel takes effect.
    if (sub.currentPeriodEnd) {
      try {
        const owner = await repos.memberships.findOwner(req.orgId!);
        const org = await repos.organizations.findById(req.orgId!);
        if (owner?.email && org) {
          const appUrl = process.env.APP_URL || 'http://localhost:3000';
          await dispatchEmail(options, owner.email, 'E-18', {
            orgName: org.name,
            effectiveDate: sub.currentPeriodEnd,
            reactivateUrl: `${appUrl}/settings/billing`,
            isImmediate: false,
          });
        }
      } catch (err) {
        logger.error({ err }, 'Failed to send cancellation confirmation email');
      }
    }

    res.status(200).json({
      data: {
        success: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: sub.currentPeriodEnd,
        effectiveAt: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
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

    if (sub.paddleSubscriptionId) {
      await paddleClient.resumeSubscription(sub.paddleSubscriptionId);
    }

    await repos.subscriptions.upsert({
      ...sub,
      orgId: asOrgId(sub.orgId),
      cancelAtPeriodEnd: false,
      scheduledChange: null,
    });
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
        message: 'Your subscription cancellation has been reversed and your plan will continue.',
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

    let portalUrl: string;
    if (org.paddleCustomerId) {
      const sub = await repos.subscriptions.findByOrgId(req.orgId!);
      const session = await paddleClient.createCustomerPortalSession(
        org.paddleCustomerId,
        sub ? [sub.paddleSubscriptionId] : undefined,
      );
      portalUrl = session.url;
    } else {
      const isSandbox = (process.env.PADDLE_ENV || 'sandbox') === 'sandbox';
      portalUrl = `https://${isSandbox ? 'sandbox-' : ''}customer-portal.paddle.com`;
    }

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

export interface PaddleWebhookRouterOptions {
  boss?: PgBoss;
  emailSender?: EmailSender;
}

export function paddleWebhookRouter(
  repos: Repositories,
  options?: PaddleWebhookRouterOptions,
): Router {
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

    const eventId = (bodyObj.event_id || bodyObj.eventId) as string | undefined;
    const eventType = (bodyObj.event_type || bodyObj.eventType) as string | undefined;

    if (!eventId || !eventType) {
      res
        .status(400)
        .json({ error: { code: 'INVALID_EVENT', message: 'Missing event_id or event_type' } });
      return;
    }

    // 1. Insert into paddle_events table (event_id PK makes duplicates no-ops per Section 12.2)
    const recorded = await repos.paddleEvents.record(eventId, eventType, bodyObj);
    if (!recorded) {
      // Duplicate event
      res.status(200).json({
        received: true,
        handled: true,
        duplicate: true,
        eventType,
      });
      return;
    }

    // 2. Return 200 immediately and enqueue paddle.process when pg-boss queue is present (Section 12.2)
    if (options?.boss) {
      const data = (bodyObj.data || {}) as Record<string, unknown>;
      const subscriptionId = (data.id || data.subscription_id) as string | undefined;
      await enqueuePaddleProcess(options.boss, eventId, subscriptionId);
      res.status(200).json({
        received: true,
        handled: true,
        queued: true,
        duplicate: false,
        eventType,
      });
      return;
    }

    // Fallback synchronous processing for tests or environments without worker
    const result = await processPaddleEvent(bodyObj, repos, {
      alreadyRecorded: true,
      emailSender: options?.emailSender,
    });

    res.status(200).json({
      received: true,
      handled: result.handled,
      duplicate: result.duplicate ?? false,
      eventType: result.eventType,
    });
  });

  return router;
}
