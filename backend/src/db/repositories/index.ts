import type { Database } from '../client.js';
import { auditLogRepository } from './audit-log.js';
import { membershipsRepository } from './memberships.js';
import { organizationsRepository } from './organizations.js';
import { sitesRepository } from './sites.js';
import { scansRepository } from './scans.js';
import { pagesRepository } from './pages.js';
import { issuesRepository } from './issues.js';
import { usersRepository } from './users.js';
import { waitlistRepository } from './waitlist.js';
import { invitationsRepository } from './invitations.js';
import { reportsRepository } from './reports.js';
import { freeChecksRepository } from './free-checks.js';

export function createRepositories(db: Database) {
  return {
    auditLog: auditLogRepository(db),
    memberships: membershipsRepository(db),
    organizations: organizationsRepository(db),
    sites: sitesRepository(db),
    scans: scansRepository(db),
    pages: pagesRepository(db),
    issues: issuesRepository(db),
    users: usersRepository(db),
    waitlist: waitlistRepository(db),
    invitations: invitationsRepository(db),
    reports: reportsRepository(db),
    freeChecks: freeChecksRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
export { asOrgId, type OrgId } from './org-scope.js';
