import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { evidenceEvents, type EvidenceEventRow, type EvidenceEventType } from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export interface EvidenceEventFilter {
  type?: EvidenceEventType;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export function evidenceEventsRepository(db: Database) {
  return {
    async record(
      orgId: OrgId,
      entry: {
        siteId: string;
        type: EvidenceEventType;
        actorId?: string | null;
        occurredAt?: Date;
        data?: Record<string, unknown>;
      },
    ): Promise<EvidenceEventRow> {
      const [row] = await db
        .insert(evidenceEvents)
        .values({
          orgId,
          siteId: entry.siteId,
          type: entry.type,
          actorId: entry.actorId ?? null,
          occurredAt: entry.occurredAt ?? new Date(),
          data: entry.data ?? {},
        })
        .returning();
      return row!;
    },

    async list(
      orgId: OrgId,
      siteId: string,
      filter: EvidenceEventFilter = {},
    ): Promise<EvidenceEventRow[]> {
      const conditions = [eq(evidenceEvents.orgId, orgId), eq(evidenceEvents.siteId, siteId)];

      if (filter.type) {
        conditions.push(eq(evidenceEvents.type, filter.type));
      }
      if (filter.from) {
        conditions.push(gte(evidenceEvents.occurredAt, filter.from));
      }
      if (filter.to) {
        conditions.push(lte(evidenceEvents.occurredAt, filter.to));
      }

      const limit = Math.min(filter.limit ?? 50, 200);
      const offset = filter.offset ?? 0;

      return db
        .select()
        .from(evidenceEvents)
        .where(and(...conditions))
        .orderBy(desc(evidenceEvents.occurredAt))
        .limit(limit)
        .offset(offset);
    },

    async count(
      orgId: OrgId,
      siteId: string,
      filter: Omit<EvidenceEventFilter, 'limit' | 'offset'> = {},
    ): Promise<number> {
      const conditions = [eq(evidenceEvents.orgId, orgId), eq(evidenceEvents.siteId, siteId)];

      if (filter.type) {
        conditions.push(eq(evidenceEvents.type, filter.type));
      }
      if (filter.from) {
        conditions.push(gte(evidenceEvents.occurredAt, filter.from));
      }
      if (filter.to) {
        conditions.push(lte(evidenceEvents.occurredAt, filter.to));
      }

      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(evidenceEvents)
        .where(and(...conditions));

      return row?.count ?? 0;
    },
  };
}

export type EvidenceEventsRepository = ReturnType<typeof evidenceEventsRepository>;
