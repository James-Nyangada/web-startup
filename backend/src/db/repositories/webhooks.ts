import crypto from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { auditLog, webhooks, type WebhookKind, type WebhookRow } from '../schema/index.js';
import type { OrgId } from './org-scope.js';
import { encrypt, decrypt } from '../../lib/encryption.js';
import { assertPublicUrl } from '../../scanner/net/guard.js';

export interface CreateWebhookInput {
  kind: WebhookKind;
  url: string;
  events: string[];
  siteIds?: string[];
  secret?: string;
}

export interface UpdateWebhookInput {
  url?: string;
  events?: string[];
  siteIds?: string[];
  active?: boolean;
  secret?: string;
}

export interface WebhookDeliveryRecord {
  id: string;
  webhookId: string;
  event: string;
  status: number | null;
  error: string | null;
  durationMs: number;
  createdAt: Date;
  payload?: Record<string, unknown>;
}

export function maskUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    if (path.length > 8) {
      return `${parsed.origin}${path.slice(0, 4)}...${path.slice(-4)}`;
    }
    return `${parsed.origin}${path}`;
  } catch {
    return 'https://***';
  }
}

function safeDecrypt(encrypted: string, fallback = ''): string {
  try {
    return decrypt(encrypted);
  } catch {
    return fallback;
  }
}

export function webhooksRepository(db: Database) {
  return {
    async create(orgId: OrgId, input: CreateWebhookInput) {
      // Validate SSRF guard (§11.2)
      await assertPublicUrl(input.url);

      const urlEncrypted = encrypt(input.url);
      const secret =
        input.secret ?? (input.kind === 'generic' ? crypto.randomBytes(24).toString('hex') : null);

      const [row] = await db
        .insert(webhooks)
        .values({
          orgId,
          kind: input.kind,
          urlEncrypted,
          events: input.events,
          siteIds: input.siteIds ?? [],
          active: true,
          secret,
        })
        .returning();

      if (!row) {
        throw new Error('Failed to create webhook');
      }

      return {
        ...row,
        url: input.url,
        urlMasked: maskUrl(input.url),
      };
    },

    async listByOrg(orgId: OrgId) {
      const rows = await db
        .select()
        .from(webhooks)
        .where(eq(webhooks.orgId, orgId))
        .orderBy(desc(webhooks.createdAt));

      return rows.map((r) => {
        const url = safeDecrypt(r.urlEncrypted, 'https://***');
        return {
          ...r,
          url,
          urlMasked: maskUrl(url),
        };
      });
    },

    async findById(orgId: OrgId, id: string) {
      const [row] = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.orgId, orgId), eq(webhooks.id, id)))
        .limit(1);

      if (!row) return null;

      const url = safeDecrypt(row.urlEncrypted, 'https://***');

      return {
        ...row,
        url,
        urlMasked: maskUrl(url),
      };
    },

    async findRawById(id: string): Promise<(WebhookRow & { url: string }) | null> {
      const [row] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
      if (!row) return null;
      const url = safeDecrypt(row.urlEncrypted, '');
      return {
        ...row,
        url,
      };
    },

    async update(orgId: OrgId, id: string, patch: UpdateWebhookInput) {
      const updateData: Partial<typeof webhooks.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (patch.url !== undefined) {
        await assertPublicUrl(patch.url);
        updateData.urlEncrypted = encrypt(patch.url);
      }
      if (patch.events !== undefined) {
        updateData.events = patch.events;
      }
      if (patch.siteIds !== undefined) {
        updateData.siteIds = patch.siteIds;
      }
      if (patch.active !== undefined) {
        updateData.active = patch.active;
        if (patch.active) {
          // If re-enabling, reset failure count
          updateData.failureCount = 0;
          updateData.lastError = null;
        }
      }
      if (patch.secret !== undefined) {
        updateData.secret = patch.secret;
      }

      const [row] = await db
        .update(webhooks)
        .set(updateData)
        .where(and(eq(webhooks.orgId, orgId), eq(webhooks.id, id)))
        .returning();

      if (!row) return null;

      const url = safeDecrypt(row.urlEncrypted, 'https://***');

      return {
        ...row,
        url,
        urlMasked: maskUrl(url),
      };
    },

    async delete(orgId: OrgId, id: string): Promise<boolean> {
      const [row] = await db
        .delete(webhooks)
        .where(and(eq(webhooks.orgId, orgId), eq(webhooks.id, id)))
        .returning();

      return Boolean(row);
    },

    async recordDeliveryResult(
      id: string,
      status: number | null,
      error: string | null,
      success: boolean,
    ): Promise<{ webhook: WebhookRow; autoDisabled: boolean }> {
      const [existing] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
      if (!existing) {
        throw new Error(`Webhook ${id} not found`);
      }

      const newFailureCount = success ? 0 : existing.failureCount + 1;
      const autoDisabled = !success && newFailureCount >= 10;
      const active = autoDisabled ? false : existing.active;

      const [updated] = await db
        .update(webhooks)
        .set({
          lastStatus: status,
          lastError: error,
          failureCount: newFailureCount,
          active,
          updatedAt: new Date(),
        })
        .where(eq(webhooks.id, id))
        .returning();

      return { webhook: updated!, autoDisabled };
    },

    async findActiveByEvent(
      orgId: OrgId,
      event: string,
      siteId?: string,
    ): Promise<Array<WebhookRow & { url: string }>> {
      const rows = await db
        .select()
        .from(webhooks)
        .where(
          and(
            eq(webhooks.orgId, orgId),
            eq(webhooks.active, true),
            sql`${event} = ANY(${webhooks.events})`,
          ),
        );

      const filtered = rows.filter((r) => {
        if (!r.siteIds || r.siteIds.length === 0) return true;
        if (!siteId) return true;
        return r.siteIds.includes(siteId);
      });

      return filtered.map((r) => ({
        ...r,
        url: decrypt(r.urlEncrypted),
      }));
    },

    async logDelivery(
      orgId: OrgId,
      webhookId: string,
      delivery: {
        event: string;
        status: number | null;
        error: string | null;
        durationMs: number;
        payload?: Record<string, unknown>;
      },
    ) {
      await db.insert(auditLog).values({
        orgId,
        actorType: 'system',
        action: 'webhook.delivery',
        targetType: 'webhook',
        targetId: webhookId,
        data: delivery,
      });
    },

    async listDeliveries(
      orgId: OrgId,
      webhookId: string,
      limit = 20,
    ): Promise<WebhookDeliveryRecord[]> {
      const rows = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.orgId, orgId),
            eq(auditLog.targetType, 'webhook'),
            eq(auditLog.targetId, webhookId),
            eq(auditLog.action, 'webhook.delivery'),
          ),
        )
        .orderBy(desc(auditLog.createdAt))
        .limit(limit);

      return rows.map((r) => {
        const data = r.data ?? {};
        return {
          id: r.id,
          webhookId,
          event: typeof data['event'] === 'string' ? data['event'] : 'unknown',
          status: typeof data['status'] === 'number' ? data['status'] : null,
          error: typeof data['error'] === 'string' ? data['error'] : null,
          durationMs: typeof data['durationMs'] === 'number' ? data['durationMs'] : 0,
          createdAt: r.createdAt,
          payload:
            typeof data['payload'] === 'object' && data['payload'] !== null
              ? (data['payload'] as Record<string, unknown>)
              : undefined,
        };
      });
    },
  };
}

export type WebhooksRepository = ReturnType<typeof webhooksRepository>;
