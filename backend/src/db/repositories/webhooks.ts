import crypto from 'node:crypto';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { webhookDeliveries, webhooks, type WebhookKind, type WebhookRow } from '../schema/index.js';
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

/** What the API returns: never the full URL (a Slack URL is a credential) or the secret. */
export type PublicWebhook = Omit<WebhookRow, 'urlEncrypted' | 'secret'> & {
  urlMasked: string;
  hasSecret: boolean;
};

export function toPublicWebhook(row: WebhookRow & { url?: string }): PublicWebhook {
  const { urlEncrypted, secret, ...rest } = row;
  delete rest.url;
  const url = row.url ?? safeDecrypt(urlEncrypted, 'https://***');
  return { ...rest, urlMasked: maskUrl(url), hasSecret: Boolean(secret) };
}

const ENCRYPTED_FORMAT = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/;

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
          secret: secret ? encrypt(secret) : null,
        })
        .returning();

      if (!row) {
        throw new Error('Failed to create webhook');
      }

      // The signing secret is returned this once so the user can copy it.
      return { ...toPublicWebhook({ ...row, url: input.url }), secret };
    },

    async listByOrg(orgId: OrgId) {
      const rows = await db
        .select()
        .from(webhooks)
        .where(eq(webhooks.orgId, orgId))
        .orderBy(desc(webhooks.createdAt));

      return rows.map((r) => toPublicWebhook(r));
    },

    async findById(orgId: OrgId, id: string) {
      const [row] = await db
        .select()
        .from(webhooks)
        .where(and(eq(webhooks.orgId, orgId), eq(webhooks.id, id)))
        .limit(1);

      return row ? toPublicWebhook(row) : null;
    },

    /** Internal (delivery job): decrypted URL and secret. */
    async findRawById(id: string): Promise<(WebhookRow & { url: string }) | null> {
      const [row] = await db.select().from(webhooks).where(eq(webhooks.id, id)).limit(1);
      if (!row) return null;
      const url = safeDecrypt(row.urlEncrypted, '');
      let secret = row.secret;
      if (secret && ENCRYPTED_FORMAT.test(secret)) {
        secret = safeDecrypt(secret, '') || null;
      } else if (secret) {
        // Stored before secrets were encrypted: encrypt it now, keep using the value.
        await db
          .update(webhooks)
          .set({ secret: encrypt(secret) })
          .where(eq(webhooks.id, id));
      }
      return { ...row, url, secret };
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
        updateData.secret = patch.secret ? encrypt(patch.secret) : null;
      }

      const [row] = await db
        .update(webhooks)
        .set(updateData)
        .where(and(eq(webhooks.orgId, orgId), eq(webhooks.id, id)))
        .returning();

      return row ? toPublicWebhook(row) : null;
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
      // The payload is not stored: it can hold site data and is rebuilt from the event.
      await db.insert(webhookDeliveries).values({
        orgId,
        webhookId,
        event: delivery.event,
        status: delivery.status,
        error: delivery.error?.slice(0, 1000) ?? null,
        durationMs: Math.round(delivery.durationMs),
      });
    },

    async listDeliveries(
      orgId: OrgId,
      webhookId: string,
      limit = 20,
    ): Promise<WebhookDeliveryRecord[]> {
      return db
        .select({
          id: webhookDeliveries.id,
          webhookId: webhookDeliveries.webhookId,
          event: webhookDeliveries.event,
          status: webhookDeliveries.status,
          error: webhookDeliveries.error,
          durationMs: webhookDeliveries.durationMs,
          createdAt: webhookDeliveries.createdAt,
        })
        .from(webhookDeliveries)
        .where(and(eq(webhookDeliveries.orgId, orgId), eq(webhookDeliveries.webhookId, webhookId)))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(limit);
    },

    /** retention.prune: delivery log entries older than `cutoff`. */
    async pruneDeliveries(cutoff: Date): Promise<number> {
      const rows = await db
        .delete(webhookDeliveries)
        .where(lt(webhookDeliveries.createdAt, cutoff))
        .returning({ id: webhookDeliveries.id });
      return rows.length;
    },
  };
}

export type WebhooksRepository = ReturnType<typeof webhooksRepository>;
