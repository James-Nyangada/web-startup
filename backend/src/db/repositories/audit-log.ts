import { and, desc, eq, gte, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client.js';
import { auditLog, users, type ActorType } from '../schema/index.js';
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

export interface AuditLogFilters {
  /** Exact action (`member.removed`) or a prefix ending in `.` (`billing.`). */
  action?: string;
  actorType?: ActorType;
  actorId?: string;
  from?: Date;
  to?: Date;
  /** Free text over action, target and the actor's name or email. */
  q?: string;
}

export interface AuditCursor {
  createdAt: Date;
  id: string;
}

export function encodeAuditCursor(c: AuditCursor): string {
  return Buffer.from(`${c.createdAt.toISOString()}|${c.id}`).toString('base64url');
}

export function decodeAuditCursor(raw: string | undefined): AuditCursor | null {
  if (!raw) return null;
  const [iso, id] = Buffer.from(raw, 'base64url').toString('utf8').split('|');
  const createdAt = iso ? new Date(iso) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}

const like = (value: string) => `%${value.replace(/[%_\\]/g, '\\$&')}%`;

export function auditLogRepository(db: Database) {
  const conditionsFor = (orgId: OrgId, f: AuditLogFilters): SQL[] => {
    const c: SQL[] = [eq(auditLog.orgId, orgId)];
    if (f.action) {
      c.push(
        f.action.endsWith('.')
          ? sql`${auditLog.action} like ${f.action.replace(/[%_]/g, '') + '%'}`
          : eq(auditLog.action, f.action),
      );
    }
    if (f.actorType) c.push(eq(auditLog.actorType, f.actorType));
    if (f.actorId) c.push(eq(auditLog.actorId, f.actorId));
    if (f.from) c.push(gte(auditLog.createdAt, f.from));
    if (f.to) c.push(lt(auditLog.createdAt, f.to));
    if (f.q) {
      const pattern = like(f.q);
      c.push(
        or(
          ilike(auditLog.action, pattern),
          ilike(auditLog.targetType, pattern),
          ilike(auditLog.targetId, pattern),
          ilike(users.name, pattern),
          ilike(sql`${users.email}::text`, pattern),
        )!,
      );
    }
    return c;
  };

  const columns = {
    id: auditLog.id,
    action: auditLog.action,
    actorType: auditLog.actorType,
    actorId: auditLog.actorId,
    actorName: users.name,
    actorEmail: users.email,
    targetType: auditLog.targetType,
    targetId: auditLog.targetId,
    ip: auditLog.ip,
    userAgent: auditLog.userAgent,
    data: auditLog.data,
    createdAt: auditLog.createdAt,
  };

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

    /** S-51: filtered, newest first, keyset-paginated on (created_at, id). */
    async search(
      orgId: OrgId,
      filters: AuditLogFilters,
      limit: number,
      cursor: AuditCursor | null,
    ) {
      const c = conditionsFor(orgId, filters);
      if (cursor) {
        c.push(
          sql`(${auditLog.createdAt}, ${auditLog.id}) < (${cursor.createdAt.toISOString()}::timestamptz, ${cursor.id}::uuid)`,
        );
      }
      const rows = await db
        .select(columns)
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorId))
        .where(and(...c))
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(limit + 1);
      const items = rows.slice(0, limit);
      const last = items[items.length - 1];
      return {
        items,
        nextCursor:
          rows.length > limit && last
            ? encodeAuditCursor({ createdAt: last.createdAt, id: last.id })
            : null,
      };
    },

    /** Everything matching the filters for CSV export, capped so one request stays bounded. */
    async exportRows(orgId: OrgId, filters: AuditLogFilters, max = 50_000) {
      return db
        .select(columns)
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorId))
        .where(and(...conditionsFor(orgId, filters)))
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(max);
    },

    async listActions(orgId: OrgId): Promise<string[]> {
      const rows = await db
        .selectDistinct({ action: auditLog.action })
        .from(auditLog)
        .where(eq(auditLog.orgId, orgId))
        .orderBy(auditLog.action);
      return rows.map((r) => r.action);
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
