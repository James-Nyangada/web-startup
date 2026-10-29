import crypto from 'node:crypto';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { apiKeys, organizations, type ApiKeyScope } from '../schema/index.js';
import type { OrgId } from './org-scope.js';

/** Visible start of every key, so leaked keys are easy to spot in logs and secret scanners. */
export const API_KEY_PREFIX = 'psk_';

export function hashApiKey(secret: string): string {
  return crypto.createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** `psk_` + 43 url-safe characters (256 bits). Only its SHA-256 hash is ever stored. */
export function generateApiKeySecret(): { secret: string; prefix: string; keyHash: string } {
  const secret = `${API_KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  return {
    secret,
    prefix: secret.slice(0, API_KEY_PREFIX.length + 8),
    keyHash: hashApiKey(secret),
  };
}

/** The columns safe to return to a browser: never the hash. */
const publicColumns = {
  id: apiKeys.id,
  orgId: apiKeys.orgId,
  name: apiKeys.name,
  prefix: apiKeys.prefix,
  scopes: apiKeys.scopes,
  siteIds: apiKeys.siteIds,
  lastUsedAt: apiKeys.lastUsedAt,
  revokedAt: apiKeys.revokedAt,
  createdBy: apiKeys.createdBy,
  createdAt: apiKeys.createdAt,
};

export type PublicApiKey = {
  id: string;
  orgId: string;
  name: string;
  prefix: string;
  scopes: ApiKeyScope[];
  siteIds: string[];
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
};

export function apiKeysRepository(db: Database) {
  return {
    async create(
      orgId: OrgId,
      input: {
        name: string;
        scopes: ApiKeyScope[];
        siteIds?: string[];
        createdBy: string | null;
      },
    ): Promise<{ key: PublicApiKey; secret: string }> {
      const { secret, prefix, keyHash } = generateApiKeySecret();
      const [row] = await db
        .insert(apiKeys)
        .values({
          orgId,
          name: input.name,
          scopes: input.scopes,
          siteIds: input.siteIds ?? [],
          createdBy: input.createdBy,
          prefix,
          keyHash,
        })
        .returning(publicColumns);
      return { key: row!, secret };
    },

    async listByOrg(orgId: OrgId): Promise<PublicApiKey[]> {
      return db
        .select(publicColumns)
        .from(apiKeys)
        .where(eq(apiKeys.orgId, orgId))
        .orderBy(desc(apiKeys.createdAt));
    },

    async countActive(orgId: OrgId): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(apiKeys)
        .where(and(eq(apiKeys.orgId, orgId), isNull(apiKeys.revokedAt)));
      return row?.count ?? 0;
    },

    async revoke(orgId: OrgId, id: string): Promise<PublicApiKey | null> {
      const [row] = await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.orgId, orgId), eq(apiKeys.id, id), isNull(apiKeys.revokedAt)))
        .returning(publicColumns);
      return row ?? null;
    },

    /** Resolves a presented secret to its key and org. Revoked keys and deleted orgs miss. */
    async findActiveBySecret(secret: string) {
      const [row] = await db
        .select({ key: publicColumns, org: organizations })
        .from(apiKeys)
        .innerJoin(organizations, eq(organizations.id, apiKeys.orgId))
        .where(
          and(
            eq(apiKeys.keyHash, hashApiKey(secret)),
            isNull(apiKeys.revokedAt),
            isNull(organizations.deletedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    /** Records use at most once a minute per key, so busy keys do not write on every call. */
    async touchLastUsed(id: string): Promise<void> {
      await db
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(
          and(
            eq(apiKeys.id, id),
            or(
              isNull(apiKeys.lastUsedAt),
              lt(apiKeys.lastUsedAt, sql`now() - interval '1 minute'`),
            ),
          ),
        );
    },
  };
}

export type ApiKeysRepository = ReturnType<typeof apiKeysRepository>;
