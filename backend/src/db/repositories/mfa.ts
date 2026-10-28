import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { sessions, userMfa, userPasskeys, users } from '../schema/index.js';

export interface PasskeyInput {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  name: string;
}

/** Two-step verification state for a user: authenticator app, recovery codes and passkeys. */
export function mfaRepository(db: Database) {
  const getRow = async (userId: string) => {
    const [row] = await db.select().from(userMfa).where(eq(userMfa.userId, userId)).limit(1);
    return row ?? null;
  };

  const upsert = async (userId: string, values: Partial<typeof userMfa.$inferInsert>) => {
    await db
      .insert(userMfa)
      .values({ userId, ...values })
      .onConflictDoUpdate({ target: userMfa.userId, set: { ...values, updatedAt: new Date() } });
  };

  return {
    getRow,

    async listPasskeys(userId: string) {
      return db
        .select()
        .from(userPasskeys)
        .where(eq(userPasskeys.userId, userId))
        .orderBy(userPasskeys.createdAt);
    },

    async findPasskey(userId: string, credentialId: string) {
      const [row] = await db
        .select()
        .from(userPasskeys)
        .where(and(eq(userPasskeys.userId, userId), eq(userPasskeys.credentialId, credentialId)))
        .limit(1);
      return row ?? null;
    },

    async addPasskey(userId: string, input: PasskeyInput) {
      const [row] = await db
        .insert(userPasskeys)
        .values({ userId, ...input })
        .returning();
      return row!;
    },

    async deletePasskey(userId: string, passkeyId: string): Promise<boolean> {
      const rows = await db
        .delete(userPasskeys)
        .where(and(eq(userPasskeys.id, passkeyId), eq(userPasskeys.userId, userId)))
        .returning({ id: userPasskeys.id });
      return rows.length > 0;
    },

    async touchPasskey(passkeyId: string, counter: number) {
      await db
        .update(userPasskeys)
        .set({ counter, lastUsedAt: new Date() })
        .where(eq(userPasskeys.id, passkeyId));
    },

    /** True when the user has any second factor, so a sign-in must be challenged. */
    async isEnabled(userId: string): Promise<boolean> {
      const row = await getRow(userId);
      if (row?.totpEnabledAt) return true;
      const [passkey] = await db
        .select({ id: userPasskeys.id })
        .from(userPasskeys)
        .where(eq(userPasskeys.userId, userId))
        .limit(1);
      return Boolean(passkey);
    },

    async setPendingTotp(userId: string, secretEncrypted: string) {
      await upsert(userId, { totpSecretEncrypted: secretEncrypted, totpEnabledAt: null });
    },

    async enableTotp(userId: string, recoveryCodeHashes: string[] | null) {
      await upsert(userId, {
        totpEnabledAt: new Date(),
        ...(recoveryCodeHashes ? { recoveryCodeHashes } : {}),
      });
    },

    async disableTotp(userId: string) {
      await upsert(userId, { totpSecretEncrypted: null, totpEnabledAt: null });
    },

    async setRecoveryCodes(userId: string, hashes: string[]) {
      await upsert(userId, { recoveryCodeHashes: hashes });
    },

    async setChallenge(userId: string, challenge: string, ttlMs: number) {
      await upsert(userId, {
        passkeyChallenge: challenge,
        passkeyChallengeExpiresAt: new Date(Date.now() + ttlMs),
      });
    },

    /** Returns the outstanding challenge and clears it, so it can only be used once. */
    async takeChallenge(userId: string): Promise<string | null> {
      const row = await getRow(userId);
      if (!row?.passkeyChallenge) return null;
      await db
        .update(userMfa)
        .set({ passkeyChallenge: null, passkeyChallengeExpiresAt: null })
        .where(eq(userMfa.userId, userId));
      const fresh =
        row.passkeyChallengeExpiresAt && row.passkeyChallengeExpiresAt.getTime() > Date.now();
      return fresh ? row.passkeyChallenge : null;
    },

    /** Spends one recovery code; false when it is not (or no longer) valid. */
    async consumeRecoveryCode(userId: string, hash: string): Promise<boolean> {
      const row = await getRow(userId);
      if (!row || !row.recoveryCodeHashes.includes(hash)) return false;
      const rows = await db
        .update(userMfa)
        .set({ recoveryCodeHashes: row.recoveryCodeHashes.filter((h) => h !== hash) })
        .where(
          and(
            eq(userMfa.userId, userId),
            sql`${userMfa.recoveryCodeHashes} @> ${JSON.stringify([hash])}::jsonb`,
          ),
        )
        .returning({ userId: userMfa.userId });
      return rows.length > 0;
    },

    /** The session passed its second factor; the user is trusted for the next 24 hours. */
    async markVerified(sessionId: string, userId: string) {
      await db.update(sessions).set({ mfaPending: false }).where(eq(sessions.id, sessionId));
      await db.update(users).set({ lastMfaAt: new Date() }).where(eq(users.id, userId));
    },
  };
}
