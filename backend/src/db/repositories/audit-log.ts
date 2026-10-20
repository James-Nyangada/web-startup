import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { auditLog, type ActorType } from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export interface AuditEntry {
  actorId?: string | null;
  actorType: ActorType;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  userAgent?: string | null;
  data?: Record<string, unknown>;
}

export function auditLogRepository(db: Database) {
  return {
    /** `orgId` is null only for platform-level events (e.g. staff sign-in). */
    async write(orgId: OrgId | null, entry: AuditEntry) {
      await db.insert(auditLog).values({ orgId, ...entry });
    },

    async list(orgId: OrgId, limit = 50) {
      return db
        .select()
        .from(auditLog)
        .where(eq(auditLog.orgId, orgId))
        .orderBy(desc(auditLog.createdAt))
        .limit(limit);
    },

    async findRecentAction(orgId: OrgId, action: string) {
      const [row] = await db
        .select()
        .from(auditLog)
        .where(and(eq(auditLog.orgId, orgId), eq(auditLog.action, action)))
        .orderBy(desc(auditLog.createdAt))
        .limit(1);
      return row ?? null;
    },

    async hasActionWithKey(orgId: OrgId, action: string, idempotencyKey: string): Promise<boolean> {
      const [row] = await db
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.orgId, orgId),
            eq(auditLog.action, action),
            sql`${auditLog.data}->>'idempotencyKey' = ${idempotencyKey}`,
          ),
        )
        .limit(1);
      return Boolean(row);
    },
  };
}
