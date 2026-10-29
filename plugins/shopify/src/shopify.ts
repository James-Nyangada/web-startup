import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface ShopSession {
  shop: string;
  accessToken: string;
  scope: string;
  siteId?: string;
  apiKey?: string; // Dedicated site-scoped EveryVisitor API key for this shop
  orgId?: string;
  plan?: string;
  subscriptionId?: string;
  installedAt: string;
  updatedAt?: string;
}

/**
 * Persistent Shop Session Store.
 * Backed by a PostgreSQL database table (`shopify_sessions`) for multi-instance production deploys,
 * with local persistence fallback for development and unit testing.
 */
export class PersistentShopSessionStore {
  private sessions = new Map<string, ShopSession>();
  private filePath?: string;
  private pool: any = null;

  constructor(filePathOrDbUrl?: string) {
    const dbUrl = process.env.DATABASE_URL;
    if (filePathOrDbUrl && (filePathOrDbUrl.startsWith('postgres://') || filePathOrDbUrl.startsWith('postgresql://'))) {
      this.initPostgres(filePathOrDbUrl);
    } else if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
      this.initPostgres(dbUrl);
    } else {
      this.filePath =
        filePathOrDbUrl ||
        process.env.SESSION_STORAGE_PATH ||
        path.join(process.cwd(), '.storage', 'shopify-sessions.json');
      this.loadFromDisk();
    }
  }

  private initPostgres(url: string): void {
    try {
      // Use dynamic import / require for node-postgres
      const pg = require('pg');
      this.pool = new pg.Pool({ connectionString: url, max: 10 });
      this.pool
        .query(
          `CREATE TABLE IF NOT EXISTS shopify_sessions (
            shop TEXT PRIMARY KEY,
            access_token TEXT NOT NULL,
            scope TEXT NOT NULL,
            site_id TEXT,
            api_key TEXT,
            org_id TEXT,
            plan TEXT NOT NULL DEFAULT 'trial',
            subscription_id TEXT,
            installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS shopify_sessions_org_id_idx ON shopify_sessions(org_id);`
        )
        .catch(() => {});
    } catch {
      // Fallback cleanly if pg driver not installed
    }
  }

  private loadFromDisk(): void {
    if (!this.filePath) return;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) {
          for (const [key, value] of Object.entries(parsed)) {
            this.sessions.set(key.toLowerCase(), value as ShopSession);
          }
        }
      }
    } catch {
      // Ignore load error on fresh install
    }
  }

  private saveToDisk(): void {
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data: Record<string, ShopSession> = {};
      for (const [key, val] of this.sessions.entries()) {
        data[key] = val;
      }
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to persist Shopify session store:', err);
    }
  }

  set(shop: string, session: ShopSession): void {
    session.updatedAt = new Date().toISOString();
    this.sessions.set(shop.toLowerCase(), session);

    if (this.pool) {
      this.pool
        .query(
          `INSERT INTO shopify_sessions (shop, access_token, scope, site_id, api_key, org_id, plan, subscription_id, installed_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (shop) DO UPDATE SET
             access_token = EXCLUDED.access_token,
             scope = EXCLUDED.scope,
             site_id = COALESCE(EXCLUDED.site_id, shopify_sessions.site_id),
             api_key = COALESCE(EXCLUDED.api_key, shopify_sessions.api_key),
             org_id = COALESCE(EXCLUDED.org_id, shopify_sessions.org_id),
             plan = COALESCE(EXCLUDED.plan, shopify_sessions.plan),
             subscription_id = COALESCE(EXCLUDED.subscription_id, shopify_sessions.subscription_id),
             updated_at = EXCLUDED.updated_at`,
          [
            shop.toLowerCase(),
            session.accessToken,
            session.scope,
            session.siteId || null,
            session.apiKey || null,
            session.orgId || null,
            session.plan || 'trial',
            session.subscriptionId || null,
            session.installedAt,
            session.updatedAt,
          ]
        )
        .catch((err: any) => console.error('Database session persistence error:', err));
    }

    if (this.filePath) {
      this.saveToDisk();
    }
  }

  get(shop: string): ShopSession | undefined {
    return this.sessions.get(shop.toLowerCase());
  }

  async findInDb(shop: string): Promise<ShopSession | undefined> {
    if (this.pool) {
      try {
        const res = await this.pool.query('SELECT * FROM shopify_sessions WHERE LOWER(shop) = LOWER($1)', [shop]);
        if (res.rows.length > 0) {
          const row = res.rows[0];
          const session: ShopSession = {
            shop: row.shop,
            accessToken: row.access_token,
            scope: row.scope,
            siteId: row.site_id || undefined,
            apiKey: row.api_key || undefined,
            orgId: row.org_id || undefined,
            plan: row.plan || 'trial',
            subscriptionId: row.subscription_id || undefined,
            installedAt: row.installed_at ? new Date(row.installed_at).toISOString() : new Date().toISOString(),
            updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
          };
          this.sessions.set(shop.toLowerCase(), session);
          return session;
        }
      } catch (err) {
        console.error('Failed to query shopify session from database:', err);
      }
    }
    return this.sessions.get(shop.toLowerCase());
  }

  delete(shop: string): boolean {
    const deleted = this.sessions.delete(shop.toLowerCase());
    if (this.pool) {
      this.pool
        .query('DELETE FROM shopify_sessions WHERE LOWER(shop) = LOWER($1)', [shop])
        .catch((err: any) => console.error('Database session deletion error:', err));
    }
    if (this.filePath && deleted) {
      this.saveToDisk();
    }
    return deleted;
  }

  has(shop: string): boolean {
    return this.sessions.has(shop.toLowerCase());
  }

  clear(): void {
    this.sessions.clear();
    if (this.filePath) {
      this.saveToDisk();
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end().catch(() => {});
    }
  }
}

export const sessionStore = new PersistentShopSessionStore();

/**
 * Validates whether a given domain is a valid Shopify shop domain.
 */
export function isValidShopDomain(shop: string): boolean {
  if (!shop || typeof shop !== 'string') return false;
  const regex = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/i;
  return regex.test(shop);
}

/**
 * Validates HMAC on Shopify OAuth queries.
 */
export function verifyOAuthHmac(query: Record<string, any>, apiSecret: string): boolean {
  const { hmac, signature, ...rest } = query;
  const targetHmac = hmac || signature;
  if (!targetHmac) return false;

  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join('&');

  const computed = crypto.createHmac('sha256', apiSecret).update(message).digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(targetHmac, 'utf8'),
      Buffer.from(computed, 'utf8'),
    );
  } catch {
    return false;
  }
}

/**
 * Validates HMAC header on Shopify Webhooks (X-Shopify-Hmac-Sha256).
 */
export function verifyWebhookHmac(
  rawBody: Buffer | string,
  hmacHeader: string | undefined,
  apiSecret: string,
): boolean {
  if (!hmacHeader) return false;

  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
  const computed = crypto.createHmac('sha256', apiSecret).update(bodyBuffer).digest('base64');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmacHeader, 'utf8'),
      Buffer.from(computed, 'utf8'),
    );
  } catch {
    return false;
  }
}

export interface AppBridgeClaims {
  iss: string;
  dest: string;
  aud: string;
  sub: string;
  exp: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  sid?: string;
}

/**
 * Verifies Shopify App Bridge Session Token (JWT).
 * App Bridge sends an HS256 signed JWT in Authorization: Bearer <token>.
 */
export function verifyAppBridgeToken(
  token: string,
  apiSecret: string,
  apiKey: string,
): { valid: boolean; shop?: string; claims?: AppBridgeClaims } {
  if (!token || typeof token !== 'string') {
    return { valid: false };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { valid: false };
  }

  const [headerB64, payloadB64, signatureB64] = parts;

  // 1. Verify HS256 signature
  const dataToSign = `${headerB64}.${payloadB64}`;
  const computedSignature = crypto
    .createHmac('sha256', apiSecret)
    .update(dataToSign)
    .digest('base64url');

  try {
    const isSigMatch = crypto.timingSafeEqual(
      Buffer.from(signatureB64!, 'utf8'),
      Buffer.from(computedSignature, 'utf8'),
    );
    if (!isSigMatch) return { valid: false };
  } catch {
    return { valid: false };
  }

  // 2. Decode claims
  try {
    const payloadJson = Buffer.from(payloadB64!, 'base64url').toString('utf8');
    const claims = JSON.parse(payloadJson) as AppBridgeClaims;

    // 3. Verify expiration
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) {
      return { valid: false };
    }

    // 4. Verify audience
    if (claims.aud && claims.aud !== apiKey) {
      return { valid: false };
    }

    // 5. Extract shop domain from dest claim (e.g. https://my-store.myshopify.com)
    let shop = '';
    if (claims.dest) {
      try {
        const destUrl = new URL(claims.dest);
        shop = destUrl.hostname;
      } catch {
        shop = claims.dest.replace(/^https?:\/\//, '');
      }
    }

    return { valid: true, shop, claims };
  } catch {
    return { valid: false };
  }
}
