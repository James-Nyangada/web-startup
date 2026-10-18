import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import type { Database } from '../client.js';
import { invitations, organizations, users, type InvitationRole } from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreateInvitationInput {
  email: string;
  role: InvitationRole;
  siteIds?: string[];
  invitedBy?: string | null;
}

export function invitationsRepository(db: Database) {
  return {
    /**
     * Creates an invitation with a single-use token that expires after 7 days,
     * stored as a SHA-256 hash. Returns the created record and raw token for delivery.
     */
    async create(orgId: OrgId, input: CreateInvitationInput) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = hashInvitationToken(rawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const [row] = await db
        .insert(invitations)
        .values({
          orgId,
          email: input.email.toLowerCase().trim(),
          role: input.role,
          siteIds: input.siteIds ?? [],
          tokenHash,
          invitedBy: input.invitedBy ?? null,
          expiresAt,
        })
        .returning();

      if (!row) {
        throw new Error('Failed to create invitation record.');
      }

      return {
        invitation: row,
        rawToken,
      };
    },

    /**
     * Lists active pending invitations for an organisation (not accepted, not revoked, not expired).
     */
    async listPending(orgId: OrgId) {
      const now = new Date();
      const rows = await db
        .select({
          id: invitations.id,
          orgId: invitations.orgId,
          email: invitations.email,
          role: invitations.role,
          siteIds: invitations.siteIds,
          expiresAt: invitations.expiresAt,
          createdAt: invitations.createdAt,
          invitedById: invitations.invitedBy,
          invitedByName: users.name,
          invitedByEmail: users.email,
        })
        .from(invitations)
        .leftJoin(users, eq(users.id, invitations.invitedBy))
        .where(
          and(
            eq(invitations.orgId, orgId),
            isNull(invitations.acceptedAt),
            isNull(invitations.revokedAt),
            gt(invitations.expiresAt, now),
          ),
        )
        .orderBy(desc(invitations.createdAt));

      return rows;
    },

    /**
     * Finds invitation by ID within an organisation.
     */
    async findById(orgId: OrgId, id: string) {
      const [row] = await db
        .select()
        .from(invitations)
        .where(and(eq(invitations.orgId, orgId), eq(invitations.id, id)))
        .limit(1);

      return row ?? null;
    },

    /**
     * Resolves an invitation by its raw token (via tokenHash), checking expiration and state.
     */
    async findByToken(rawToken: string) {
      const tokenHash = hashInvitationToken(rawToken);
      const [row] = await db
        .select({
          invitation: invitations,
          org: {
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
          },
          inviter: {
            name: users.name,
            email: users.email,
          },
        })
        .from(invitations)
        .innerJoin(organizations, eq(organizations.id, invitations.orgId))
        .leftJoin(users, eq(users.id, invitations.invitedBy))
        .where(eq(invitations.tokenHash, tokenHash))
        .limit(1);

      if (!row) {
        return null;
      }

      const now = new Date();
      const isExpired = row.invitation.expiresAt.getTime() <= now.getTime();
      const isAccepted = row.invitation.acceptedAt !== null;
      const isRevoked = row.invitation.revokedAt !== null;
      const isValid = !isExpired && !isAccepted && !isRevoked;

      return {
        invitation: row.invitation,
        org: row.org,
        inviter: row.inviter,
        isValid,
        isExpired,
        isAccepted,
        isRevoked,
      };
    },

    /**
     * Revokes a pending invitation.
     */
    async revoke(orgId: OrgId, id: string) {
      const [row] = await db
        .update(invitations)
        .set({
          revokedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(invitations.orgId, orgId), eq(invitations.id, id)))
        .returning();

      return row ?? null;
    },

    /**
     * Renews an invitation: generates a new rawToken, resets expiresAt to +7 days, and unrevokes.
     */
    async renew(orgId: OrgId, id: string) {
      const rawToken = randomBytes(32).toString('hex');
      const tokenHash = hashInvitationToken(rawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const [row] = await db
        .update(invitations)
        .set({
          tokenHash,
          expiresAt,
          revokedAt: null,
          acceptedAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(invitations.orgId, orgId), eq(invitations.id, id)))
        .returning();

      if (!row) return null;

      return {
        invitation: row,
        rawToken,
      };
    },

    /**
     * Marks an invitation as accepted (single-use token consumed).
     */
    async markAccepted(id: string) {
      const [row] = await db
        .update(invitations)
        .set({
          acceptedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invitations.id, id))
        .returning();

      return row ?? null;
    },
  };
}
