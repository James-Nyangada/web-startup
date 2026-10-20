import { Router } from 'express';
import { z } from 'zod';
import type { Repositories, OrgId } from '../db/repositories/index.js';
import { requireOrgRole } from '../middleware/org.js';
import { ErrorCode } from '../shared/errors.js';
import { assertWithinPlan } from '../shared/plans.js';
import { BlockedUrlError } from '../scanner/net/guard.js';
import { handleWebhookDeliver } from '../worker/jobs/webhook-deliver.js';
import type { PgBoss } from 'pg-boss';
import type { EmailSender } from '../emails/sender.js';

export interface WebhookRouterOptions {
  boss?: PgBoss;
  emailSender?: EmailSender;
}

const createWebhookSchema = z.object({
  kind: z.enum(['slack', 'generic']),
  url: z.string().url(),
  events: z
    .array(
      z.enum([
        'scan.completed',
        'issue.regressed',
        'issues.new_critical',
        'site.verification_failed',
      ]),
    )
    .min(1, 'Select at least one event'),
  siteIds: z.array(z.string().uuid()).optional(),
  secret: z.string().optional(),
});

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z
    .array(
      z.enum([
        'scan.completed',
        'issue.regressed',
        'issues.new_critical',
        'site.verification_failed',
      ]),
    )
    .min(1)
    .optional(),
  siteIds: z.array(z.string().uuid()).optional(),
  active: z.boolean().optional(),
  secret: z.string().optional(),
});

export function orgWebhooksRouter(repos: Repositories, options: WebhookRouterOptions = {}) {
  const router = Router({ mergeParams: true });

  // List webhooks
  router.get('/', requireOrgRole('member'), async (req, res, next) => {
    try {
      const orgId = req.orgId as OrgId;
      const webhooks = await repos.webhooks.listByOrg(orgId);
      res.json({ webhooks });
    } catch (err) {
      next(err);
    }
  });

  // Create webhook
  router.post('/', requireOrgRole('admin'), async (req, res, next) => {
    try {
      const orgId = req.orgId as OrgId;
      const org = await repos.organizations.findById(orgId);
      if (!org) {
        res
          .status(404)
          .json({ error: { code: ErrorCode.NOT_FOUND, message: 'Organisation not found' } });
        return;
      }

      // Check plan permissions (§1.4: slackWebhook feature on Growth, Agency, Agency Pro)
      assertWithinPlan(org, 'slack_webhook');

      const parsed = createWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid webhook parameters',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const webhook = await repos.webhooks.create(orgId, parsed.data);

        await repos.auditLog.write(orgId, {
          actorId: req.auth?.user.id ?? null,
          actorType: 'user',
          action: 'webhook.created',
          targetType: 'webhook',
          targetId: webhook.id,
          data: {
            kind: webhook.kind,
            events: webhook.events,
            urlMasked: webhook.urlMasked,
          },
        });

        res.status(201).json({ webhook });
      } catch (err) {
        if (err instanceof BlockedUrlError) {
          res.status(400).json({
            error: {
              code: ErrorCode.VALIDATION_ERROR,
              message: `Webhook endpoint blocked by SSRF security guard: ${err.reason}`,
            },
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  // Get webhook
  router.get('/:id', requireOrgRole('member'), async (req, res, next) => {
    try {
      const orgId = req.orgId as OrgId;
      const id = String(req.params.id);
      const webhook = await repos.webhooks.findById(orgId, id);
      if (!webhook) {
        res
          .status(404)
          .json({ error: { code: ErrorCode.NOT_FOUND, message: 'Webhook not found' } });
        return;
      }
      res.json({ webhook });
    } catch (err) {
      next(err);
    }
  });

  // Update webhook
  router.patch('/:id', requireOrgRole('admin'), async (req, res, next) => {
    try {
      const orgId = req.orgId as OrgId;
      const id = String(req.params.id);

      const parsed = updateWebhookSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid webhook update parameters',
            details: parsed.error.flatten(),
          },
        });
        return;
      }

      try {
        const updated = await repos.webhooks.update(orgId, id, parsed.data);
        if (!updated) {
          res
            .status(404)
            .json({ error: { code: ErrorCode.NOT_FOUND, message: 'Webhook not found' } });
          return;
        }

        await repos.auditLog.write(orgId, {
          actorId: req.auth?.user.id ?? null,
          actorType: 'user',
          action: 'webhook.updated',
          targetType: 'webhook',
          targetId: id,
          data: {
            changes: parsed.data,
          },
        });

        res.json({ webhook: updated });
      } catch (err) {
        if (err instanceof BlockedUrlError) {
          res.status(400).json({
            error: {
              code: ErrorCode.VALIDATION_ERROR,
              message: `Webhook endpoint blocked by SSRF security guard: ${err.reason}`,
            },
          });
          return;
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  // Delete webhook
  router.delete('/:id', requireOrgRole('admin'), async (req, res, next) => {
    try {
      const orgId = req.orgId as OrgId;
      const id = String(req.params.id);

      const deleted = await repos.webhooks.delete(orgId, id);
      if (!deleted) {
        res
          .status(404)
          .json({ error: { code: ErrorCode.NOT_FOUND, message: 'Webhook not found' } });
        return;
      }

      await repos.auditLog.write(orgId, {
        actorId: req.auth?.user.id ?? null,
        actorType: 'user',
        action: 'webhook.deleted',
        targetType: 'webhook',
        targetId: id,
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // Test webhook (POST /orgs/:orgId/webhooks/:id/test)
  router.post('/:id/test', requireOrgRole('admin'), async (req, res, next) => {
    try {
      const orgId = req.orgId as OrgId;
      const id = String(req.params.id);

      const webhook = await repos.webhooks.findById(orgId, id);
      if (!webhook) {
        res
          .status(404)
          .json({ error: { code: ErrorCode.NOT_FOUND, message: 'Webhook not found' } });
        return;
      }

      const start = Date.now();
      try {
        const result = await handleWebhookDeliver(
          {
            webhookId: webhook.id,
            event: 'test',
            payload: {
              test: true,
              message: 'Test event delivered from Plainsight',
              timestamp: new Date().toISOString(),
            },
          },
          {
            repos,
            storage: {} as never,
            boss: options.boss,
            emailSender: options.emailSender,
          },
        );

        res.json({
          ok: result.ok,
          status: result.status,
          durationMs: Date.now() - start,
        });
      } catch (err) {
        const durationMs = Date.now() - start;
        const message = err instanceof Error ? err.message : String(err);
        res.status(502).json({
          ok: false,
          status: null,
          durationMs,
          error: message,
        });
      }
    } catch (err) {
      next(err);
    }
  });

  // Deliveries log (GET /orgs/:orgId/webhooks/:id/deliveries)
  router.get('/:id/deliveries', requireOrgRole('member'), async (req, res, next) => {
    try {
      const orgId = req.orgId as OrgId;
      const id = String(req.params.id);

      const webhook = await repos.webhooks.findById(orgId, id);
      if (!webhook) {
        res
          .status(404)
          .json({ error: { code: ErrorCode.NOT_FOUND, message: 'Webhook not found' } });
        return;
      }

      const deliveries = await repos.webhooks.listDeliveries(orgId, id, 20);
      res.json({ deliveries });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
