import { eq, sql } from 'drizzle-orm';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDb, createPool, type Database } from '../../src/db/client.js';
import { asOrgId, createRepositories } from '../../src/db/repositories/index.js';
import {
  auditLog,
  evidenceEvents,
  issues,
  memberships,
  organizations,
  pages,
  rules,
  scans,
  sites,
  users,
  waitlist,
} from '../../src/db/schema/index.js';
import { runMigrations } from '../../src/db/scripts/migrate.js';
import { dropAppObjects } from '../../src/db/scripts/reset.js';
import { seed } from '../../src/db/scripts/seed.js';
import { testConfig } from '../helpers/fakes.js';

/**
 * Runs against a real, disposable Postgres. Set TEST_DATABASE_URL to enable.
 * Never point this at your Supabase project: it drops and recreates every table.
 */
const url = process.env.TEST_DATABASE_URL;

const ALL_APP_TABLES = [
  'users',
  'organizations',
  'memberships',
  'audit_log',
  'feature_flags',
  'waitlist',
  'accounts',
  'sessions',
  'verifications',
  'invitations',
  'client_access',
  'branding',
  'sites',
  'scans',
  'pages',
  'page_results',
  'rules',
  'fix_guides',
  'issues',
  'issue_occurrences',
  'issue_events',
  'issue_notes',
  'reports',
  'notification_preferences',
  'in_app_notifications',
  'ai_suggestions',
  'ai_usage',
  'free_checks',
  'subscriptions',
  'paddle_events',
  'invoices',
  'report_schedules',
  'evidence_events',
  'manual_checks',
  'statements',
  'webhooks',
  'webhook_deliveries',
];

describe.skipIf(!url)('database (integration)', () => {
  let pool: pg.Pool;
  let db: Database;

  beforeAll(async () => {
    pool = createPool({ url: url!, ssl: process.env.TEST_DATABASE_SSL === 'true' });
    db = createDb(pool);
    await dropAppObjects(db);
    await runMigrations(db);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('migrations are idempotent', async () => {
    await expect(runMigrations(db)).resolves.toBeUndefined();
  });

  it('seed is idempotent', async () => {
    await seed(db);
    await seed(db);
    const owners = await db.select().from(users).where(eq(users.email, 'owner@example.com'));
    expect(owners).toHaveLength(1);
    const orgs = await db.select().from(organizations).where(eq(organizations.slug, 'demo-agency'));
    expect(orgs).toHaveLength(1);
    expect(orgs[0]?.plan).toBe('trial');

    const allRules = await db.select().from(rules);
    expect(allRules.length).toBeGreaterThanOrEqual(70);
  });

  it('emails are case-insensitive and unique', async () => {
    await expect(db.insert(users).values({ email: 'OWNER@example.com' })).rejects.toThrow();
  });

  it('updated_at is set by trigger on organizations and sites', async () => {
    const [before] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'demo-agency'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await db.update(organizations).set({ name: 'Renamed' }).where(eq(organizations.id, before!.id));
    const [after] = await db.select().from(organizations).where(eq(organizations.id, before!.id));
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());

    const [site] = await db
      .insert(sites)
      .values({
        orgId: before!.id,
        name: 'Test Store',
        rootUrl: 'https://teststore.example.com',
        verifyToken: 'token123',
      })
      .returning();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await db.update(sites).set({ name: 'Updated Store' }).where(eq(sites.id, site!.id));
    const [updatedSite] = await db.select().from(sites).where(eq(sites.id, site!.id));
    expect(updatedSite!.updatedAt.getTime()).toBeGreaterThan(site!.updatedAt.getTime());
  });

  it('allows at most one owner per organisation', async () => {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'demo-agency'));
    const [second] = await db.insert(users).values({ email: 'second@example.com' }).returning();
    await expect(
      db.insert(memberships).values({ orgId: org!.id, userId: second!.id, role: 'owner' }),
    ).rejects.toThrow();
    await expect(
      db.insert(memberships).values({ orgId: org!.id, userId: second!.id, role: 'admin' }),
    ).resolves.toBeDefined();
  });

  it('rejects invalid enum values', async () => {
    await expect(
      db.insert(organizations).values({ name: 'Bad', plan: 'platinum' as 'trial' }),
    ).rejects.toThrow();
  });

  it('enforces site constraints and scan/page/issue relationships', async () => {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'demo-agency'));

    const [site] = await db
      .insert(sites)
      .values({
        orgId: org!.id,
        name: 'Acme Shoes',
        rootUrl: 'https://acme.example.com',
        platform: 'shopify',
        verifyToken: 'acme-token',
      })
      .returning();

    // Duplicate root_url in same org fails
    await expect(
      db.insert(sites).values({
        orgId: org!.id,
        name: 'Acme Shoes Duplicate',
        rootUrl: 'https://acme.example.com',
        verifyToken: 'dup-token',
      }),
    ).rejects.toThrow();

    const [scan] = await db
      .insert(scans)
      .values({
        orgId: org!.id,
        siteId: site!.id,
        trigger: 'manual',
        standard: 'wcag22aa',
      })
      .returning();

    const [page] = await db
      .insert(pages)
      .values({
        orgId: org!.id,
        siteId: site!.id,
        url: 'https://acme.example.com/products/shoe-1',
        urlHash: 'hash123',
        templateKey: 'product',
      })
      .returning();

    const [issue] = await db
      .insert(issues)
      .values({
        orgId: org!.id,
        siteId: site!.id,
        fingerprint: 'fp-img-alt-1',
        ruleId: 'image-alt',
        impact: 'critical',
        wcagCriteria: ['1.1.1'],
        wcagLevel: 'A',
        templateKey: 'product',
        selector: 'img.product',
      })
      .returning();

    expect(site?.id).toBeDefined();
    expect(scan?.id).toBeDefined();
    expect(page?.id).toBeDefined();
    expect(issue?.id).toBeDefined();
  });

  it('site summaries count open issues and the last two scans per site', async () => {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'demo-agency'));
    const orgId = asOrgId(org!.id);
    const [site] = await db
      .insert(sites)
      .values({
        orgId: org!.id,
        name: 'Summary Store',
        rootUrl: 'https://summary.example.com',
        verifyToken: 'summary-token',
      })
      .returning();
    const base = {
      orgId: org!.id,
      siteId: site!.id,
      wcagCriteria: ['1.1.1'],
      wcagLevel: 'A' as const,
      templateKey: 'home',
      selector: 'img',
      ruleId: 'image-alt',
    };
    await db.insert(issues).values([
      { ...base, fingerprint: 's-1', impact: 'critical' },
      { ...base, fingerprint: 's-2', impact: 'critical', isRegression: true },
      { ...base, fingerprint: 's-3', impact: 'serious' },
      { ...base, fingerprint: 's-4', impact: 'critical', status: 'fixed' },
    ]);
    const day = (n: number) => new Date(Date.UTC(2026, 9, n));
    await db.insert(scans).values([
      {
        orgId: org!.id,
        siteId: site!.id,
        trigger: 'manual',
        standard: 'wcag22aa',
        status: 'completed',
        score: 60,
        queuedAt: day(1),
        finishedAt: day(1),
      },
      {
        orgId: org!.id,
        siteId: site!.id,
        trigger: 'manual',
        standard: 'wcag22aa',
        status: 'completed',
        score: 70,
        queuedAt: day(2),
        finishedAt: day(2),
      },
      {
        orgId: org!.id,
        siteId: site!.id,
        trigger: 'manual',
        standard: 'wcag22aa',
        status: 'failed',
        queuedAt: day(3),
        errorMessage: 'Site returned 503',
      },
    ]);

    const summaries = await createRepositories(db).sites.listSummaries(orgId, [site!.id]);
    expect(summaries.get(site!.id)).toMatchObject({
      openCritical: 2,
      openSerious: 1,
      regressions: 1,
      lastScanStatus: 'failed',
      lastScanError: 'Site returned 503',
      previousScore: 60,
    });
  });

  it('audit_log is append-only', async () => {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'demo-agency'));
    const repos = createRepositories(db);
    await repos.auditLog.write(asOrgId(org!.id), { actorType: 'system', action: 'test.event' });
    const entries = await repos.auditLog.list(asOrgId(org!.id));
    expect(entries).toHaveLength(1);

    // Drizzle wraps the Postgres error; the trigger's message is on `cause`.
    const appendOnly = {
      cause: expect.objectContaining({ message: expect.stringMatching(/append-only/) }),
    };
    await expect(db.update(auditLog).set({ action: 'tampered' })).rejects.toMatchObject(appendOnly);
    await expect(db.delete(auditLog)).rejects.toMatchObject(appendOnly);
    await expect(db.execute(sql`truncate audit_log`)).rejects.toMatchObject(appendOnly);
    expect(await repos.auditLog.list(asOrgId(org!.id))).toMatchObject([{ action: 'test.event' }]);
  });

  it('evidence_events is append-only', async () => {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'demo-agency'));
    const repos = createRepositories(db);
    const orgSites = await repos.sites.list(asOrgId(org!.id));
    const site = orgSites[0]!;
    const event = await repos.evidenceEvents.record(asOrgId(org!.id), {
      siteId: site.id,
      type: 'site_added',
      data: { name: site.name },
    });
    const entries = await repos.evidenceEvents.list(asOrgId(org!.id), site.id);
    expect(entries.length).toBeGreaterThanOrEqual(1);

    const appendOnly = {
      cause: expect.objectContaining({ message: expect.stringMatching(/append-only/) }),
    };
    await expect(
      db
        .update(evidenceEvents)
        .set({ type: 'scan_completed' })
        .where(eq(evidenceEvents.id, event.id)),
    ).rejects.toMatchObject(appendOnly);
    await expect(
      db.delete(evidenceEvents).where(eq(evidenceEvents.id, event.id)),
    ).rejects.toMatchObject(appendOnly);
    await expect(db.execute(sql`truncate evidence_events`)).rejects.toMatchObject(appendOnly);
  });

  it('evidence pack queries return only rows inside the period (P5-04)', async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Evidence Range', slug: 'evidence-range' })
      .returning();
    const orgId = asOrgId(org!.id);
    const [site] = await db
      .insert(sites)
      .values({
        orgId,
        name: 'Range Site',
        rootUrl: 'https://range.example.com',
        verifyToken: 'range-token',
      })
      .returning();
    const siteId = site!.id;
    const inside = new Date('2026-03-15T12:00:00Z');
    const before = new Date('2025-12-31T23:00:00Z');

    await db.insert(scans).values([
      { orgId, siteId, trigger: 'manual', status: 'completed', score: 80, finishedAt: inside },
      { orgId, siteId, trigger: 'manual', status: 'completed', score: 70, finishedAt: before },
      { orgId, siteId, trigger: 'manual', status: 'queued' },
    ]);
    const base = {
      orgId,
      siteId,
      ruleId: 'image-alt',
      impact: 'serious' as const,
      wcagLevel: 'A' as const,
      templateKey: 'home',
      selector: 'img',
    };
    await db.insert(issues).values([
      { ...base, fingerprint: 'fixed-in', status: 'fixed', fixedAt: inside },
      { ...base, fingerprint: 'fixed-out', status: 'fixed', fixedAt: before },
      {
        ...base,
        fingerprint: 'ignored-in',
        status: 'ignored',
        ignoredAt: inside,
        ignoredReason: 'false_positive',
      },
      { ...base, fingerprint: 'open-now', status: 'open' },
    ]);

    const repos = createRepositories(db);
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-03-31T23:59:59.999Z');

    const scanRows = await repos.scans.listForEvidencePack(orgId, siteId, start, end);
    expect(scanRows.map((s) => s.score)).toEqual([80]);

    const sets = await repos.issues.listForEvidencePack(orgId, siteId, start, end);
    expect(sets.fixed).toHaveLength(1);
    expect(sets.ignored).toHaveLength(1);
    expect(sets.open).toHaveLength(1);
    expect(sets.fixed[0]!.title).toBeTruthy();
  });

  it('retention can hard-delete an org whose append-only rows cascade', async () => {
    const [org] = await db
      .insert(organizations)
      .values({ name: 'Purge Me', slug: 'purge-me' })
      .returning();
    const orgId = asOrgId(org!.id);
    const [site] = await db
      .insert(sites)
      .values({
        orgId,
        name: 'Purge Site',
        rootUrl: 'https://purge.example.com',
        verifyToken: 'purge-token',
      })
      .returning();
    const repos = createRepositories(db);
    await repos.evidenceEvents.record(orgId, { siteId: site!.id, type: 'site_added', data: {} });
    await repos.auditLog.write(orgId, { actorType: 'system', action: 'test.purge' });

    expect(await repos.retention.purgeOrganization(orgId)).toBe(true);
    expect(await db.select().from(organizations).where(eq(organizations.id, orgId))).toHaveLength(
      0,
    );
    expect(
      await db.select().from(evidenceEvents).where(eq(evidenceEvents.orgId, orgId)),
    ).toHaveLength(0);

    // The guard is lifted for that transaction only
    await expect(db.delete(evidenceEvents)).rejects.toMatchObject({
      cause: expect.objectContaining({ message: expect.stringMatching(/append-only/) }),
    });
  });

  it('enables row-level security on every app table', async () => {
    const { rows } = await pool.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relname = any($1::text[])`,
      [ALL_APP_TABLES],
    );
    expect(rows).toHaveLength(ALL_APP_TABLES.length);
    expect(rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  it('memberships repository is scoped to its org', async () => {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'demo-agency'));
    const [other] = await db.insert(organizations).values({ name: 'Other Org' }).returning();
    const repos = createRepositories(db);
    expect((await repos.memberships.list(asOrgId(org!.id))).length).toBe(2);
    expect(await repos.memberships.list(asOrgId(other!.id))).toEqual([]);
  });

  it('POST /v1/public/waitlist stores the email once and keeps consent', async () => {
    const app = createApp({
      config: testConfig,
      pool,
      repos: createRepositories(db),
      verifyTurnstile: () => Promise.resolve(true),
    });
    await request(app)
      .post('/v1/public/waitlist')
      .send({ email: 'Ada@Example.com', consent: true })
      .expect(201);
    await request(app)
      .post('/v1/public/waitlist')
      .send({ email: 'ada@example.com', consent: false })
      .expect(201);
    const rows = await db.select().from(waitlist);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: 'ada@example.com', consent: true });

    const deep = await request(app).get('/health/deep').expect(200);
    expect(deep.body.checks.database.status).toBe('ok');
  });
});
