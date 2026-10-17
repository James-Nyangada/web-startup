import { and, asc, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Database } from '../client.js';
import type { Platform, Standard } from '../../scanner/types.js';
import {
  sites,
  type ScanFrequency,
  type SiteStatus,
  type VerifyMethod,
} from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export interface SiteListOptions {
  status?: SiteStatus;
  platform?: Platform;
  client?: string;
  q?: string;
  sort?: 'score' | 'name' | 'lastScan' | 'openCritical';
}

export interface CreateSiteInput {
  name: string;
  rootUrl: string;
  platform?: Platform;
  clientName?: string | null;
  scanFrequency?: ScanFrequency;
  scanDay?: number;
  scanHour?: number;
  pageLimit?: number;
  standard?: Standard;
  pinnedUrls?: string[];
  excludedPaths?: string[];
}

export interface UpdateSiteInput {
  name?: string;
  clientName?: string | null;
  scanFrequency?: ScanFrequency;
  scanDay?: number;
  scanHour?: number;
  pageLimit?: number;
  standard?: Standard;
  pinnedUrls?: string[];
  excludedPaths?: string[];
}

export function sitesRepository(db: Database) {
  return {
    async list(orgId: OrgId, options: SiteListOptions = {}) {
      const conditions = [eq(sites.orgId, orgId), isNull(sites.deletedAt)];

      if (options.status) {
        conditions.push(eq(sites.status, options.status));
      }

      if (options.platform) {
        conditions.push(eq(sites.platform, options.platform));
      }

      if (options.client) {
        conditions.push(ilike(sites.clientName, `%${options.client.trim()}%`));
      }

      if (options.q) {
        const q = `%${options.q.trim()}%`;
        conditions.push(or(ilike(sites.name, q), ilike(sites.rootUrl, q))!);
      }

      let query = db
        .select()
        .from(sites)
        .where(and(...conditions));

      switch (options.sort) {
        case 'score':
          query = query.orderBy(asc(sites.score), asc(sites.name)) as typeof query;
          break;
        case 'name':
          query = query.orderBy(asc(sites.name)) as typeof query;
          break;
        case 'lastScan':
          query = query.orderBy(desc(sites.updatedAt)) as typeof query;
          break;
        case 'openCritical':
          query = query.orderBy(asc(sites.score)) as typeof query;
          break;
        default:
          query = query.orderBy(desc(sites.createdAt)) as typeof query;
          break;
      }

      return query;
    },

    async findById(orgId: OrgId, siteId: string) {
      const [row] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId), isNull(sites.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async findByRootUrl(orgId: OrgId, rootUrl: string) {
      const [row] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.orgId, orgId), eq(sites.rootUrl, rootUrl), isNull(sites.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async count(orgId: OrgId): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sites)
        .where(and(eq(sites.orgId, orgId), isNull(sites.deletedAt)));
      return row?.count ?? 0;
    },

    async create(orgId: OrgId, input: CreateSiteInput) {
      const verifyToken = `ps_${randomBytes(16).toString('hex')}`;
      const [row] = await db
        .insert(sites)
        .values({
          orgId,
          name: input.name,
          rootUrl: input.rootUrl,
          platform: input.platform ?? 'unknown',
          clientName: input.clientName ?? null,
          verifyToken,
          scanFrequency: input.scanFrequency ?? 'weekly',
          scanDay: input.scanDay ?? 1,
          scanHour: input.scanHour ?? 2,
          pageLimit: input.pageLimit ?? 50,
          standard: input.standard ?? 'wcag22aa',
          pinnedUrls: input.pinnedUrls ?? [],
          excludedPaths: input.excludedPaths ?? [],
        })
        .returning();
      if (!row) {
        throw new Error('Failed to insert site record.');
      }
      return row;
    },

    async update(orgId: OrgId, siteId: string, patch: UpdateSiteInput) {
      const [row] = await db
        .update(sites)
        .set({
          ...patch,
          updatedAt: new Date(),
        })
        .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId), isNull(sites.deletedAt)))
        .returning();
      return row ?? null;
    },

    async pause(orgId: OrgId, siteId: string) {
      const [row] = await db
        .update(sites)
        .set({
          status: 'paused',
          updatedAt: new Date(),
        })
        .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId), isNull(sites.deletedAt)))
        .returning();
      return row ?? null;
    },

    async resume(orgId: OrgId, siteId: string) {
      const existing = await this.findById(orgId, siteId);
      if (!existing) return null;

      const newStatus = existing.verifiedAt ? 'active' : 'pending_verification';

      const [row] = await db
        .update(sites)
        .set({
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId), isNull(sites.deletedAt)))
        .returning();
      return row ?? null;
    },

    async softDelete(orgId: OrgId, siteId: string) {
      const [row] = await db
        .update(sites)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId), isNull(sites.deletedAt)))
        .returning();
      return row ?? null;
    },

    async setVerified(orgId: OrgId, siteId: string, method: VerifyMethod) {
      const [row] = await db
        .update(sites)
        .set({
          status: 'active',
          verifyMethod: method,
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId), isNull(sites.deletedAt)))
        .returning();
      return row ?? null;
    },

    async findRawById(siteId: string) {
      const [row] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.id, siteId), isNull(sites.deletedAt)));
      return row ?? null;
    },
  };
}

export type SitesRepository = ReturnType<typeof sitesRepository>;
