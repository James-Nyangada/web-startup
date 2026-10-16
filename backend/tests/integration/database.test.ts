import { eq, sql } from 'drizzle-orm';
import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDb, createPool, type Database } from '../../src/db/client.js';
import { asOrgId, createRepositories } from '../../src/db/repositories/index.js';
import {
  auditLog,
  memberships,
  organizations,
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
  });

  it('emails are case-insensitive and unique', async () => {
    await expect(db.insert(users).values({ email: 'OWNER@example.com' })).rejects.toThrow();
  });

  it('updated_at is set by trigger', async () => {
    const [before] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, 'demo-agency'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await db.update(organizations).set({ name: 'Renamed' }).where(eq(organizations.id, before!.id));
    const [after] = await db.select().from(organizations).where(eq(organizations.id, before!.id));
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
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

  it('enables row-level security on every app table', async () => {
    const { rows } = await pool.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relname in ('users','organizations','memberships','audit_log','feature_flags','waitlist')`,
    );
    expect(rows).toHaveLength(6);
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
