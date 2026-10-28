import crypto from 'node:crypto';
import type { PgBoss } from 'pg-boss';
import type { Repositories } from '../db/repositories/index.js';
import { asOrgId, type OrgId } from '../db/repositories/org-scope.js';
import { getPlanDefinition, getPlanForPriceId, type PlanType } from '../shared/plans.js';
import { logger } from '../lib/logger.js';
import { enqueueEmailSend } from '../worker/boss.js';
import type { EmailSender } from '../emails/sender.js';
import type { EmailTemplateId, TemplateDataMap } from '../emails/types.js';

export interface VerifySignatureOptions {
  rawBody: string | Buffer;
  signatureHeader?: string;
  secret?: string;
  isProduction?: boolean;
}

/**
 * Verifies Paddle Billing webhook signature header `ts=...;h1=...`.
 * Spec 12.2: Verify Paddle-Signature with PADDLE_WEBHOOK_SECRET (reject > 5 min old).
 */
export function verifyPaddleWebhookSignature({
  rawBody,
  signatureHeader,
  secret,
  isProduction = process.env.NODE_ENV === 'production',
}: VerifySignatureOptions): boolean {
  if (!signatureHeader) {
    return false;
  }

  // Parse header into key-value pairs (e.g. ts=1671552777;h1=eb3b...)
  const parts = signatureHeader.split(';').map((part) => part.trim());
  let tsStr = '';
  let h1 = '';

  for (const part of parts) {
    const [k, v] = part.split('=');
    if (k === 'ts' && v) tsStr = v;
    if (k === 'h1' && v) h1 = v;
  }

  if (!tsStr || !h1) {
    return false;
  }

  // Reject events older or in the future by more than 5 minutes (300 seconds)
  const tsSeconds = parseInt(tsStr, 10);
  if (isNaN(tsSeconds)) {
    return false;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > 300) {
    return false;
  }

  if (!secret) {
    // In development/test mode without a secret configured, allow signature verification to pass
    if (!isProduction) {
      return true;
    }
    return false;
  }

  const bodyStr = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');
  const signedPayload = `${tsStr}:${bodyStr}`;
  const computedHmac = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(computedHmac, 'utf8'), Buffer.from(h1, 'utf8'));
  } catch {
    return false;
  }
}

export interface PaddleEventData {
  id?: string;
  customer_id?: string;
  status?: string;
  custom_data?: { orgId?: string; org_id?: string; [key: string]: unknown };
  customData?: { orgId?: string; [key: string]: unknown };
  current_billing_period?: {
    starts_at?: string;
    ends_at?: string;
  };
  items?: Array<{
    price?: {
      id?: string;
    };
  }>;
  scheduled_change?: {
    action?: string;
    [key: string]: unknown;
  } | null;
  details?: {
    totals?: {
      total?: number | string;
      currency_code?: string;
    };
  };
  billed_at?: string;
  invoice_pdf_url?: string;
  invoiceUrl?: string;
  [key: string]: unknown;
}

export interface PaddleEventPayload {
  event_id?: string;
  eventId?: string;
  event_type?: string;
  eventType?: string;
  occurred_at?: string;
  data?: PaddleEventData;
  [key: string]: unknown;
}

export interface ProcessEventResult {
  handled: boolean;
  duplicate?: boolean;
  eventType: string;
  orgId?: string | null;
  error?: string;
}

export interface ProcessPaddleEventOptions {
  isReplay?: boolean;
  /** The webhook route already inserted the event into paddle_events; skip the idempotency insert. */
  alreadyRecorded?: boolean;
  boss?: PgBoss;
  emailSender?: EmailSender;
  appUrl?: string;
}

/** In-app mirror of E-17 for the owner (P5-05); never fails webhook processing. */
async function notifyPaymentFailedInApp(
  repos: Repositories,
  orgId: OrgId,
  ownerUserId: string,
  orgName: string,
): Promise<void> {
  await repos.notifications
    ?.createInApp(orgId, ownerUserId, {
      type: 'payment_failed',
      title: 'Payment failed',
      body: `We couldn't take the latest payment for ${orgName}. Update your billing details to keep monitoring running.`,
      link: '/settings/billing',
    })
    .catch((err: unknown) => {
      console.error('[paddle] Failed to create payment-failed notification:', err);
    });
}

export async function dispatchEmail<T extends EmailTemplateId>(
  options: ProcessPaddleEventOptions | undefined,
  to: string,
  templateId: T,
  data: TemplateDataMap[T],
): Promise<void> {
  if (options?.boss) {
    await enqueueEmailSend(options.boss, {
      to,
      templateId,
      data: data as unknown as Record<string, unknown>,
    });
  } else if (options?.emailSender) {
    await options.emailSender.send({
      to,
      templateId,
      data,
    });
  }
}

/**
 * Processes incoming Paddle webhook event idempotently according to Section 12.2.
 */
export async function processPaddleEvent(
  payload: PaddleEventPayload,
  repos: Repositories,
  options?: ProcessPaddleEventOptions,
): Promise<ProcessEventResult> {
  const eventId = payload.event_id || payload.eventId;
  const eventType = payload.event_type || payload.eventType;
  const occurredAt = payload.occurred_at ? new Date(payload.occurred_at) : new Date();
  const data: PaddleEventData = payload.data ?? {};

  if (!eventId || !eventType) {
    return { handled: false, eventType: 'unknown', error: 'Missing event_id or event_type' };
  }

  // 1. Idempotent recording in paddle_events table
  if (options?.isReplay) {
    logger.info({ eventId, eventType }, 'Replaying Paddle webhook event');
  } else if (!options?.alreadyRecorded) {
    const recorded = await repos.paddleEvents.record(eventId, eventType, payload);
    if (!recorded) {
      // Duplicate event already processed
      return { handled: true, duplicate: true, eventType };
    }
  }

  try {
    // 2. Resolve organization ID from payload custom_data or customer lookup
    let targetOrgId =
      data.custom_data?.orgId || data.customData?.orgId || data.custom_data?.org_id || null;

    if (!targetOrgId && data.customer_id) {
      const org = await repos.organizations.findByPaddleCustomerId(data.customer_id);
      if (org) {
        targetOrgId = org.id;
      }
    }

    if (!targetOrgId && data.id) {
      const existingSub = await repos.subscriptions.findByPaddleSubscriptionId(data.id);
      if (existingSub) {
        targetOrgId = existingSub.orgId;
      }
    }

    switch (eventType) {
      case 'customer.created':
      case 'customer.updated': {
        if (targetOrgId && data.id) {
          await repos.organizations.update(asOrgId(targetOrgId), {
            paddleCustomerId: data.id,
          });
        }
        break;
      }

      case 'subscription.created':
      case 'subscription.activated': {
        const priceId = data.items?.[0]?.price?.id;
        const subId = data.id;
        if (!priceId || !subId) {
          logger.warn({ eventId }, 'Missing price ID or subscription ID in subscription event');
          return { handled: false, eventType, error: 'Missing price ID or subscription ID' };
        }
        const planInfo = getPlanForPriceId(priceId);

        if (!planInfo) {
          logger.warn({ priceId, eventId }, 'Unknown Paddle price ID in subscription event');
          // Section 12.2: unknown price ID -> error to Sentry, no state change
          await repos.paddleEvents.markProcessed(eventId, `Unknown price ID: ${priceId}`);
          return { handled: true, eventType, error: `Unknown price ID: ${priceId}` };
        }

        if (targetOrgId) {
          const orgIdScoped = asOrgId(targetOrgId);
          const priorSub = await repos.subscriptions.findByPaddleSubscriptionId(subId);
          await repos.subscriptions.upsert({
            orgId: orgIdScoped,
            paddleSubscriptionId: subId,
            paddlePriceId: priceId,
            plan: planInfo.plan,
            interval: planInfo.interval,
            status: data.status || 'active',
            currentPeriodStart: data.current_billing_period?.starts_at
              ? new Date(data.current_billing_period.starts_at)
              : occurredAt,
            currentPeriodEnd: data.current_billing_period?.ends_at
              ? new Date(data.current_billing_period.ends_at)
              : null,
            cancelAtPeriodEnd: data.scheduled_change?.action === 'cancel',
            scheduledChange: data.scheduled_change ?? null,
          });

          await repos.organizations.update(orgIdScoped, {
            plan: planInfo.plan,
            billingStatus: 'active',
            pastDueSince: null,
            ...(data.customer_id ? { paddleCustomerId: data.customer_id } : {}),
          });

          await repos.auditLog.write(orgIdScoped, {
            actorType: 'system',
            action: 'plan_changed',
            targetType: 'organization',
            targetId: orgIdScoped,
            data: {
              plan: planInfo.plan,
              interval: planInfo.interval,
              paddleSubscriptionId: subId,
              isReplay: options?.isReplay ?? false,
            },
          });

          // Confirm the purchase by email once. The in-app sync and the webhook both land here,
          // so only the first one to see this subscription/plan sends it.
          if (!priorSub || priorSub.plan !== planInfo.plan) {
            try {
              const owner = await repos.memberships.findOwner(orgIdScoped);
              const org = await repos.organizations.findById(orgIdScoped);
              if (owner?.email && org) {
                const appUrl = options?.appUrl || process.env.APP_URL || 'http://localhost:3000';
                await dispatchEmail(options, owner.email, 'E-19', {
                  orgName: org.name,
                  oldPlanName: priorSub?.plan
                    ? getPlanDefinition(priorSub.plan as PlanType).name
                    : undefined,
                  newPlanName: getPlanDefinition(planInfo.plan).name,
                  interval: planInfo.interval as 'month' | 'year',
                  billingUrl: `${appUrl}/settings/billing`,
                });
              }
            } catch (err) {
              logger.error({ err, eventId }, 'Failed to send plan activation email');
            }
          }

          // First payment only: the welcome email with the 3 most useful next steps.
          if (!priorSub) {
            try {
              const owner = await repos.memberships.findOwner(orgIdScoped);
              const org = await repos.organizations.findById(orgIdScoped);
              if (owner?.email && org) {
                const appUrl = options?.appUrl || process.env.APP_URL || 'http://localhost:3000';
                await dispatchEmail(options, owner.email, 'E-24', {
                  name: owner.name,
                  orgName: org.name,
                  planName: getPlanDefinition(planInfo.plan).name,
                  interval: planInfo.interval as 'month' | 'year',
                  dashboardUrl: `${appUrl}/overview`,
                  addSiteUrl: `${appUrl}/sites`,
                  issuesUrl: `${appUrl}/tasks`,
                  settingsUrl: `${appUrl}/settings`,
                });
                await repos.auditLog.write(orgIdScoped, {
                  actorType: 'system',
                  action: 'billing.welcome_email_sent',
                  targetType: 'organization',
                  targetId: orgIdScoped,
                  data: { to: owner.email, plan: planInfo.plan },
                });
              }
            } catch (err) {
              logger.error({ err, eventId }, 'Failed to send paid welcome email');
            }
          }

          // Record compliance evidence event for all sites (P5-01)
          if (repos.evidenceEvents?.record) {
            const createdOrgSites = await repos.sites.list(orgIdScoped);
            for (const s of createdOrgSites) {
              await repos.evidenceEvents.record(orgIdScoped, {
                siteId: s.id,
                type: 'plan_changed',
                actorId: null,
                data: {
                  plan: planInfo.plan,
                  interval: planInfo.interval,
                  paddleSubscriptionId: subId,
                },
              });
            }
          }
        }
        break;
      }

      case 'subscription.updated': {
        const subId = data.id;
        if (!subId) {
          logger.warn({ eventId }, 'Missing subscription ID in subscription.updated event');
          break;
        }

        // Out-of-order protection: check if existing subscription is newer
        const existingSub = await repos.subscriptions.findByPaddleSubscriptionId(subId);

        if (!options?.isReplay && existingSub && existingSub.updatedAt > occurredAt) {
          logger.info(
            { eventId, occurredAt, updatedAt: existingSub.updatedAt },
            'Ignoring out-of-order subscription.updated event',
          );
          return {
            handled: true,
            eventType,
            orgId: targetOrgId,
            error: 'Out-of-order event ignored',
          };
        }

        const priceId = data.items?.[0]?.price?.id;
        const planInfo = priceId ? getPlanForPriceId(priceId) : null;

        if (priceId && !planInfo) {
          logger.warn({ priceId, eventId }, 'Unknown Paddle price ID in subscription.updated');
          await repos.paddleEvents.markProcessed(eventId, `Unknown price ID: ${priceId}`);
          return { handled: true, eventType, error: `Unknown price ID: ${priceId}` };
        }

        if (targetOrgId) {
          const orgIdScoped = asOrgId(targetOrgId);

          // A retried payment that succeeds arrives as subscription.updated with status active.
          if (data.status === 'active') {
            const org = await repos.organizations.findById(orgIdScoped);
            if (org && (org.billingStatus === 'past_due' || org.billingStatus === 'paused')) {
              await repos.organizations.update(orgIdScoped, {
                billingStatus: 'active',
                pastDueSince: null,
              });
            }
          }

          // A downgrade is sent to Paddle straight away (full_next_billing_period bills the new
          // price from the next renewal), but the org keeps its current plan until the period
          // ends. trial.lifecycle applies the plan once effectiveAt has passed.
          const pendingDowngrade = existingSub?.scheduledChange as
            { action?: string; plan?: string; effectiveAt?: string } | null | undefined;
          const holdForDowngrade =
            pendingDowngrade?.action === 'downgrade' &&
            planInfo?.plan === pendingDowngrade.plan &&
            !!pendingDowngrade.effectiveAt &&
            new Date(pendingDowngrade.effectiveAt) > new Date();

          if (holdForDowngrade && existingSub) {
            await repos.subscriptions.upsert({
              orgId: orgIdScoped,
              paddleSubscriptionId: subId,
              paddlePriceId: existingSub.paddlePriceId,
              plan: existingSub.plan,
              interval: existingSub.interval,
              status: data.status || existingSub.status,
              currentPeriodStart: existingSub.currentPeriodStart,
              currentPeriodEnd: existingSub.currentPeriodEnd,
              cancelAtPeriodEnd: data.scheduled_change?.action === 'cancel',
              scheduledChange: data.scheduled_change ?? existingSub.scheduledChange,
            });
            break;
          }

          const currentPlan = planInfo?.plan ?? existingSub?.plan ?? 'store';
          const currentInterval = planInfo?.interval ?? existingSub?.interval ?? 'month';

          await repos.subscriptions.upsert({
            orgId: orgIdScoped,
            paddleSubscriptionId: subId,
            paddlePriceId: priceId ?? existingSub?.paddlePriceId ?? '',
            plan: currentPlan,
            interval: currentInterval,
            status: data.status || existingSub?.status || 'active',
            currentPeriodStart: data.current_billing_period?.starts_at
              ? new Date(data.current_billing_period.starts_at)
              : (existingSub?.currentPeriodStart ?? null),
            currentPeriodEnd: data.current_billing_period?.ends_at
              ? new Date(data.current_billing_period.ends_at)
              : (existingSub?.currentPeriodEnd ?? null),
            cancelAtPeriodEnd: data.scheduled_change?.action === 'cancel',
            scheduledChange: data.scheduled_change ?? null,
          });

          if (planInfo?.plan) {
            const isPlanChanged = !existingSub || existingSub.plan !== planInfo.plan;
            await repos.organizations.update(orgIdScoped, {
              plan: planInfo.plan,
            });
            await repos.auditLog.write(orgIdScoped, {
              actorType: 'system',
              action: 'plan_changed',
              targetType: 'organization',
              targetId: orgIdScoped,
              data: {
                plan: planInfo.plan,
                interval: currentInterval,
                paddleSubscriptionId: subId,
                isReplay: options?.isReplay ?? false,
              },
            });

            // Record compliance evidence event for all sites (P5-01)
            if (repos.evidenceEvents?.record) {
              const updatedOrgSites = await repos.sites.list(orgIdScoped);
              for (const s of updatedOrgSites) {
                await repos.evidenceEvents.record(orgIdScoped, {
                  siteId: s.id,
                  type: 'plan_changed',
                  actorId: null,
                  data: {
                    plan: planInfo.plan,
                    interval: currentInterval,
                    paddleSubscriptionId: subId,
                  },
                });
              }
            }

            // Spec 12.2: E-19 sent on plan change (not sent on first activation)
            if (isPlanChanged) {
              const owner = await repos.memberships.findOwner(orgIdScoped);
              const org = await repos.organizations.findById(orgIdScoped);
              if (owner?.email && org) {
                const appUrl = options?.appUrl || process.env.APP_URL || 'http://localhost:3000';
                const newPlanDef = getPlanDefinition(planInfo.plan);
                await dispatchEmail(options, owner.email, 'E-19', {
                  orgName: org.name,
                  oldPlanName: existingSub?.plan
                    ? getPlanDefinition(existingSub.plan as PlanType).name
                    : undefined,
                  newPlanName: newPlanDef.name,
                  interval: currentInterval as 'month' | 'year',
                  billingUrl: `${appUrl}/settings/billing`,
                });
              }
            }
          }
        }
        break;
      }

      case 'subscription.past_due': {
        if (targetOrgId) {
          const orgIdScoped = asOrgId(targetOrgId);
          const orgBefore = await repos.organizations.findById(orgIdScoped);
          // A repeated past_due event must not restart the grace period.
          const alreadyPastDue = orgBefore?.billingStatus === 'past_due' && orgBefore.pastDueSince;
          await repos.organizations.update(orgIdScoped, {
            billingStatus: 'past_due',
            ...(alreadyPastDue ? {} : { pastDueSince: occurredAt }),
          });
          const existingSub = await repos.subscriptions.findByOrgId(orgIdScoped);
          if (existingSub) {
            await repos.subscriptions.upsert({
              ...existingSub,
              orgId: orgIdScoped,
              status: 'past_due',
            });
          }

          await repos.auditLog.write(orgIdScoped, {
            actorType: 'system',
            action: 'subscription.past_due',
            targetType: 'organization',
            targetId: orgIdScoped,
            data: { paddleSubscriptionId: data.id },
          });

          // Spec 12.2: E-17 if not already sent this period
          const alreadySent = await repos.auditLog.findRecentAction(
            orgIdScoped,
            'payment.warning_e17',
          );
          if (!alreadySent) {
            const owner = await repos.memberships.findOwner(orgIdScoped);
            const org = await repos.organizations.findById(orgIdScoped);
            if (owner?.email && org) {
              const appUrl = options?.appUrl || process.env.APP_URL || 'http://localhost:3000';
              await dispatchEmail(options, owner.email, 'E-17', {
                orgName: org.name,
                updateBillingUrl: `${appUrl}/settings/billing`,
                daysRemaining: 7,
              });
              await notifyPaymentFailedInApp(repos, orgIdScoped, owner.userId, org.name);
              await repos.auditLog.write(orgIdScoped, {
                actorType: 'system',
                action: 'payment.warning_e17',
                targetType: 'organization',
                targetId: orgIdScoped,
                data: { eventType },
              });
            }
          }
        }
        break;
      }

      case 'subscription.paused': {
        if (targetOrgId) {
          const orgIdScoped = asOrgId(targetOrgId);
          await repos.organizations.update(orgIdScoped, {
            billingStatus: 'paused',
          });
          const existingSub = await repos.subscriptions.findByOrgId(orgIdScoped);
          if (existingSub) {
            await repos.subscriptions.upsert({
              ...existingSub,
              orgId: orgIdScoped,
              status: 'paused',
            });
          }
        }
        break;
      }

      case 'subscription.canceled': {
        if (targetOrgId) {
          const orgIdScoped = asOrgId(targetOrgId);
          await repos.organizations.update(orgIdScoped, {
            billingStatus: 'canceled',
          });
          const existingSub = await repos.subscriptions.findByOrgId(orgIdScoped);
          if (existingSub) {
            await repos.subscriptions.upsert({
              ...existingSub,
              orgId: orgIdScoped,
              status: 'canceled',
              cancelAtPeriodEnd: false,
            });
          }

          await repos.auditLog.write(orgIdScoped, {
            actorType: 'system',
            action: 'subscription.canceled',
            targetType: 'organization',
            targetId: orgIdScoped,
            data: { paddleSubscriptionId: data.id },
          });

          // Spec 12.2: E-18 sent to Owner; data retention countdown 30 days
          const owner = await repos.memberships.findOwner(orgIdScoped);
          const org = await repos.organizations.findById(orgIdScoped);
          if (owner?.email && org) {
            const appUrl = options?.appUrl || process.env.APP_URL || 'http://localhost:3000';
            await dispatchEmail(options, owner.email, 'E-18', {
              orgName: org.name,
              effectiveDate: data.current_billing_period?.ends_at
                ? new Date(data.current_billing_period.ends_at)
                : occurredAt,
              reactivateUrl: `${appUrl}/settings/billing`,
              isImmediate: true,
            });
          }
        }
        break;
      }

      case 'transaction.completed': {
        if (targetOrgId && data.id) {
          const amountCents =
            typeof data.details?.totals?.total === 'number'
              ? data.details.totals.total
              : typeof data.details?.totals?.total === 'string'
                ? parseInt(data.details.totals.total, 10)
                : 0;

          await repos.invoices.upsert({
            orgId: asOrgId(targetOrgId),
            paddleTransactionId: data.id,
            amountCents: isNaN(amountCents) ? 0 : amountCents,
            currency: data.details?.totals?.currency_code || 'USD',
            status: data.status || 'paid',
            billedAt: data.billed_at ? new Date(data.billed_at) : occurredAt,
            invoiceUrl: data.invoice_pdf_url || data.invoiceUrl || null,
          });
        }
        break;
      }

      case 'transaction.payment_failed': {
        logger.warn({ data, eventId }, 'Paddle payment failed event received');
        if (targetOrgId) {
          const orgIdScoped = asOrgId(targetOrgId);
          await repos.auditLog.write(orgIdScoped, {
            actorType: 'system',
            action: 'payment_failed',
            targetType: 'organization',
            targetId: orgIdScoped,
            data: {
              paddleTransactionId: data.id,
              amount: data.details?.totals?.total,
            },
          });

          // Spec 12.2: E-17 if not already sent this period
          const alreadySent = await repos.auditLog.findRecentAction(
            orgIdScoped,
            'payment.warning_e17',
          );
          if (!alreadySent) {
            const owner = await repos.memberships.findOwner(orgIdScoped);
            const org = await repos.organizations.findById(orgIdScoped);
            if (owner?.email && org) {
              const appUrl = options?.appUrl || process.env.APP_URL || 'http://localhost:3000';
              const rawTotal = data.details?.totals?.total;
              const formattedAmount =
                typeof rawTotal === 'number'
                  ? `$${(rawTotal / 100).toFixed(2)}`
                  : typeof rawTotal === 'string'
                    ? rawTotal
                    : undefined;

              await dispatchEmail(options, owner.email, 'E-17', {
                orgName: org.name,
                updateBillingUrl: `${appUrl}/settings/billing`,
                daysRemaining: 7,
                amountFormatted: formattedAmount,
              });
              await notifyPaymentFailedInApp(repos, orgIdScoped, owner.userId, org.name);
              await repos.auditLog.write(orgIdScoped, {
                actorType: 'system',
                action: 'payment.warning_e17',
                targetType: 'organization',
                targetId: orgIdScoped,
                data: { eventType },
              });
            }
          }
        }
        break;
      }

      default: {
        logger.info({ eventType, eventId }, 'Unhandled Paddle event type');
        break;
      }
    }

    await repos.paddleEvents.markProcessed(eventId);
    return { handled: true, eventType, orgId: targetOrgId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ err, eventId, eventType }, 'Error processing Paddle event');
    await repos.paddleEvents.markProcessed(eventId, errorMsg);
    return { handled: false, eventType, error: errorMsg };
  }
}

/**
 * Replays a stored Paddle webhook event by its event ID.
 */
export async function replayPaddleEventById(
  repos: Repositories,
  eventId: string,
): Promise<ProcessEventResult> {
  const event = await repos.paddleEvents.findById(eventId);
  if (!event) {
    throw new Error(`Paddle event with ID "${eventId}" not found.`);
  }
  const payload = event.payload as PaddleEventPayload;
  return processPaddleEvent(payload, repos, { isReplay: true });
}

/**
 * Replays all failed Paddle webhook events.
 */
export async function replayFailedPaddleEvents(repos: Repositories): Promise<{
  total: number;
  succeeded: number;
  failed: number;
  results: ProcessEventResult[];
}> {
  const failedEvents = await repos.paddleEvents.listFailed();
  const results: ProcessEventResult[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const event of failedEvents) {
    try {
      const payload = event.payload as PaddleEventPayload;
      const res = await processPaddleEvent(payload, repos, { isReplay: true });
      results.push(res);
      if (res.handled && !res.error) {
        succeeded++;
      } else {
        failed++;
      }
    } catch (err) {
      failed++;
      results.push({
        handled: false,
        eventType: event.eventType,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    total: failedEvents.length,
    succeeded,
    failed,
    results,
  };
}

/**
 * Replays a Paddle webhook event payload directly (e.g. from local file or test).
 */
export async function replayPaddlePayload(
  repos: Repositories,
  payload: PaddleEventPayload,
): Promise<ProcessEventResult> {
  return processPaddleEvent(payload, repos, { isReplay: true });
}
