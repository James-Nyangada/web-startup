import { sql } from 'drizzle-orm';
import { closeDb, getDb, type Database } from '../index.js';
import { featureFlags, memberships, organizations, users } from '../schema/index.js';

/** Idempotent development seed: safe to run more than once. */
export async function seed(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    const [owner] = await tx
      .insert(users)
      .values({ email: 'owner@example.com', name: 'Demo Owner', emailVerifiedAt: new Date() })
      .onConflictDoUpdate({ target: users.email, set: { name: sql`excluded.name` } })
      .returning({ id: users.id });

    const [org] = await tx
      .insert(organizations)
      .values({
        name: 'Demo Agency',
        slug: 'demo-agency',
        trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoUpdate({ target: organizations.slug, set: { name: sql`excluded.name` } })
      .returning({ id: organizations.id });

    if (!owner || !org) throw new Error('Seed failed to create the demo user or organisation.');

    await tx
      .insert(memberships)
      .values({ orgId: org.id, userId: owner.id, role: 'owner' })
      .onConflictDoNothing();

    await tx
      .insert(featureFlags)
      .values([
        { key: 'ai_suggestions', enabled: false },
        { key: 'google_sign_in', enabled: false },
      ])
      .onConflictDoNothing();
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await seed(getDb().db);
    console.log('Seed data inserted (owner@example.com / Demo Agency).');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
