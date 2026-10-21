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
import { aiSuggestionsRepository } from './ai-suggestions.js';
import { subscriptionsRepository } from './subscriptions.js';
import { invoicesRepository } from './invoices.js';
import { paddleEventsRepository } from './paddle-events.js';
import { brandingRepository } from './branding.js';
import { clientAccessRepository } from './client-access.js';
import { evidenceEventsRepository } from './evidence-events.js';
import { manualChecksRepository } from './manual-checks.js';
import { statementsRepository } from './statements.js';
import { notificationsRepository } from './notifications.js';
import { webhooksRepository } from './webhooks.js';
import { reportSchedulesRepository } from './report-schedules.js';
import { retentionRepository } from './retention.js';
import { staffRepository } from './staff.js';
import { featureFlagsRepository } from './feature-flags.js';
import { apiKeysRepository } from './api-keys.js';
import { privacyRepository } from './privacy.js';

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
    aiSuggestions: aiSuggestionsRepository(db),
    subscriptions: subscriptionsRepository(db),
    invoices: invoicesRepository(db),
    paddleEvents: paddleEventsRepository(db),
    branding: brandingRepository(db),
    clientAccess: clientAccessRepository(db),
    evidenceEvents: evidenceEventsRepository(db),
    manualChecks: manualChecksRepository(db),
    statements: statementsRepository(db),
    notifications: notificationsRepository(db),
    webhooks: webhooksRepository(db),
    reportSchedules: reportSchedulesRepository(db),
    retention: retentionRepository(db),
    staff: staffRepository(db),
    featureFlags: featureFlagsRepository(db),
    apiKeys: apiKeysRepository(db),
    privacy: privacyRepository(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;
export { asOrgId, type OrgId } from './org-scope.js';
