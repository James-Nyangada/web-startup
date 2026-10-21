import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../../src/shared/errors.js';
import { resetUserRateLimit } from '../../src/middleware/auth.js';
import { buildTestApp, mockAuth } from '../helpers/fakes.js';

/**
 * P6-10 authorization matrix: every org-scoped and staff endpoint × every role.
 *
 * Routes are discovered from the live Express app (not a hand-kept list), so a new endpoint
 * is covered automatically. The observed minimum role per endpoint is written to
 * `authorization-matrix.md`; any change shows up in review as a snapshot diff.
 */

interface RouteInfo {
  method: string;
  path: string;
}

// Record each router's mount path so full paths can be rebuilt (Express 5 does not keep them).
const RouterProto = express.Router as unknown as { prototype: Record<string, unknown> };
const originalUse = RouterProto.prototype.use as (...args: unknown[]) => unknown;
RouterProto.prototype.use = function patchedUse(
  this: { stack: Array<Record<string, unknown>> },
  ...args: unknown[]
) {
  const before = this.stack.length;
  const result = originalUse.apply(this, args);
  const mount = typeof args[0] === 'string' ? args[0] : '';
  for (let i = before; i < this.stack.length; i++) this.stack[i]!.__mount = mount;
  return result;
};

type Layer = {
  __mount?: string;
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
};

function collectRoutes(stack: Layer[], prefix = ''): RouteInfo[] {
  const out: RouteInfo[] = [];
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue;
        out.push({ method: method.toUpperCase(), path: prefix + layer.route.path });
      }
    } else if (layer.handle?.stack) {
      const mount = layer.__mount && layer.__mount !== '/' ? layer.__mount : '';
      out.push(...collectRoutes(layer.handle.stack, prefix + mount));
    }
  }
  return out;
}

const ORG_ID = '018f0000-0000-7000-8000-00000000aa01';
const ID = '018f0000-0000-7000-8000-00000000aa02';
const ROLES = ['client_viewer', 'member', 'admin', 'owner'] as const;
type Role = (typeof ROLES)[number];

function concrete(path: string): string {
  return path
    .replace(':orgId', ORG_ID)
    .replace(/:type/g, 'light')
    .replace(/:queue/g, 'scan.run')
    .replace(/:key/g, 'example_flag')
    .replace(/:[A-Za-z]+/g, ID);
}

const org = {
  id: ORG_ID,
  name: 'Matrix Org',
  slug: 'matrix-org',
  type: 'agency',
  plan: 'agency_pro',
  billingStatus: 'active',
  trialEndsAt: null,
  paddleCustomerId: null,
  pastDueSince: null,
  planOverride: null,
  planOverrideExpiresAt: null,
  planOverrideReason: null,
  timeZone: 'UTC',
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

type Actor = Role | 'anonymous' | 'other_org' | 'staff_impersonating';

function appFor(actor: Actor) {
  const userId = `user-${actor}`;
  const auth = mockAuth(userId);
  const built = buildTestApp({ auth });
  const repos = built.repos;
  vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(org as never);
  vi.mocked(repos.organizations.findById).mockResolvedValue(org as never);
  if (actor === 'member' || actor === 'admin' || actor === 'owner') {
    vi.mocked(repos.memberships.find).mockResolvedValue({
      id: 'm',
      orgId: ORG_ID,
      userId,
      role: actor,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  if (actor === 'client_viewer') {
    vi.mocked(repos.clientAccess.listByUserAndOrg).mockResolvedValue([
      { id: 'ca', orgId: ORG_ID, userId, siteId: ID, createdAt: new Date(), updatedAt: new Date() },
    ] as never);
  }
  if (actor === 'staff_impersonating') {
    vi.mocked(repos.staff.getSessionState).mockResolvedValue({
      sessionId: `session-${userId}`,
      userId,
      email: 'staff@example.com',
      isStaff: true,
      totpSecretEncrypted: 'x',
      totpEnabledAt: new Date(),
      staffVerifiedAt: new Date(),
      impersonatingOrgId: ORG_ID,
    });
  }
  return { app: built.app, cookie: actor === 'anonymous' ? null : auth.cookie };
}

async function call(actor: Actor, route: RouteInfo) {
  // The matrix sends far more than 300 requests a minute per user (spec 11.1 general limit).
  resetUserRateLimit(`user-${actor}`);
  const { app, cookie } = appFor(actor);
  const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  const req = request(app)[method](concrete(route.path));
  if (cookie) req.set('Cookie', cookie);
  if (method !== 'get' && method !== 'delete') req.send({});
  const res = await req;
  return { status: res.status, code: res.body?.error?.code as string | undefined, body: res.body };
}

/** 403 raised by requireOrgRole (as opposed to a business-rule 403 inside a handler). */
const roleDenied = (r: {
  status: number;
  body: { error?: { details?: { requiredRole?: string } } };
}) => r.status === 403 && Boolean(r.body?.error?.details?.requiredRole);

/**
 * Writes that only touch the caller's own data (their notifications and preferences), so
 * client viewers may make them. Everything else a client viewer writes must fail.
 */
const SELF_SCOPED_WRITES = new Set([
  'PATCH /v1/orgs/:orgId/notifications/:id/read',
  'POST /v1/orgs/:orgId/notifications/read-all',
  'PUT /v1/orgs/:orgId/notification-preferences',
]);

let orgRoutes: RouteInfo[] = [];
let staffRoutes: RouteInfo[] = [];

beforeAll(() => {
  const { app } = buildTestApp();
  const all = collectRoutes((app as unknown as { router: { stack: Layer[] } }).router.stack);
  const seen = new Set<string>();
  const unique = all.filter((r) => {
    const k = `${r.method} ${r.path}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  orgRoutes = unique.filter((r) => r.path.startsWith('/v1/orgs/:orgId'));
  staffRoutes = unique.filter((r) => r.path.startsWith('/v1/staff'));
});

describe('P6-10: authorization matrix', () => {
  it('discovers the org-scoped and staff endpoints', () => {
    expect(orgRoutes.length).toBeGreaterThan(80);
    expect(staffRoutes.length).toBeGreaterThan(20);
  });

  it('every org endpoint: anonymous 401, other org 404, roles monotonic, writes closed to client viewers and staff', async () => {
    const lines: string[] = [
      '# Authorization matrix (generated by tests/unit/authorization-matrix.test.ts)',
      '',
      'Minimum org role that gets past `requireOrgRole` for each endpoint. Anonymous requests get 401,',
      'users of another org get 404, staff impersonation is read-only (writes 403).',
      '',
      '| Method | Path | Minimum role |',
      '| --- | --- | --- |',
    ];
    const failures: string[] = [];

    for (const route of orgRoutes) {
      const label = `${route.method} ${route.path}`;
      const anon = await call('anonymous', route);
      if (anon.status !== 401) failures.push(`${label}: anonymous got ${anon.status}`);

      const other = await call('other_org', route);
      if (other.status !== 404 || other.code !== ErrorCode.NOT_FOUND) {
        failures.push(`${label}: other org got ${other.status}`);
      }

      const results = new Map<Role, Awaited<ReturnType<typeof call>>>();
      for (const role of ROLES) results.set(role, await call(role, route));

      // Monotonic: once a role passes, every higher role passes.
      let passed = false;
      let minimum: Role | null = null;
      for (const role of ROLES) {
        const denied = roleDenied(results.get(role)!) || results.get(role)!.status === 401;
        if (!denied && !passed) {
          passed = true;
          minimum = role;
        } else if (denied && passed) {
          failures.push(`${label}: ${role} denied although a lower role passed`);
        }
      }

      if (route.method !== 'GET' && route.method !== 'HEAD') {
        const viewer = results.get('client_viewer')!;
        if (viewer.status < 400 && !SELF_SCOPED_WRITES.has(label)) {
          failures.push(`${label}: client viewer write succeeded (${viewer.status})`);
        }
        const staff = await call('staff_impersonating', route);
        if (staff.status !== 403 || staff.code !== ErrorCode.IMPERSONATION_READ_ONLY) {
          failures.push(`${label}: impersonating staff write got ${staff.status}`);
        }
      }

      lines.push(
        `| ${route.method} | \`${route.path.replace('/v1/orgs/:orgId', '…')}\` | ${minimum ?? 'none'} |`,
      );
    }

    expect(failures).toEqual([]);
    await expect(lines.join('\n') + '\n').toMatchFileSnapshot(
      './__snapshots__/authorization-matrix.md',
    );
  }, 300_000);

  it('sensitive endpoints need the role the spec gives them', async () => {
    const minimum = async (method: string, path: string): Promise<Role | null> => {
      for (const role of ROLES) {
        const r = await call(role, { method, path });
        if (!roleDenied(r) && r.status !== 401) return role;
      }
      return null;
    };
    expect(await minimum('DELETE', '/v1/orgs/:orgId')).toBe('owner');
    expect(await minimum('POST', '/v1/orgs/:orgId/transfer-ownership')).toBe('owner');
    expect(await minimum('GET', '/v1/orgs/:orgId/api-keys')).toBe('owner');
    expect(await minimum('POST', '/v1/orgs/:orgId/api-keys')).toBe('owner');
    expect(await minimum('POST', '/v1/orgs/:orgId/branding/custom-domain')).toBe('owner');
    expect(await minimum('GET', '/v1/orgs/:orgId/audit-log')).toBe('admin');
    expect(await minimum('PATCH', '/v1/orgs/:orgId')).toBe('admin');
    expect(await minimum('POST', '/v1/orgs/:orgId/invitations')).toBe('admin');
    expect(await minimum('GET', '/v1/orgs/:orgId/webhooks')).toBe('admin');
  }, 60_000);

  it('every staff endpoint is hidden from non-staff (404) and needs sign-in (401)', async () => {
    const failures: string[] = [];
    for (const route of staffRoutes) {
      const anon = await call('anonymous', route);
      if (anon.status !== 401)
        failures.push(`${route.method} ${route.path}: anonymous ${anon.status}`);
      const owner = await call('owner', route);
      if (owner.status !== 404)
        failures.push(`${route.method} ${route.path}: org owner ${owner.status}`);
    }
    expect(failures).toEqual([]);
  }, 120_000);
});
