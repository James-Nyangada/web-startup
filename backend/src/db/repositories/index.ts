import type { Database } from '../client.js';
import { auditLogRepository } from './audit-log.js';
import { membershipsRepository } from './memberships.js';
import { usersRepository } from './users.js';
import { waitlistRepository } from './waitlist.js';

export function createRepositories(db: Database) {
  return {
    auditLog: auditLogRepository(db),
    memberships: membershipsRepository(db),
    users: usersRepository(db),
    waitlist: waitlistRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
export { asOrgId, type OrgId } from './org-scope.js';
