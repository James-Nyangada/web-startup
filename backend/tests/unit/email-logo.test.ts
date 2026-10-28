import { describe, expect, it } from 'vitest';
import { getSampleTemplateData, renderEmail } from '../../src/emails/renderer.js';
import type { EmailTemplateId } from '../../src/emails/types.js';

const TEMPLATE_IDS: EmailTemplateId[] = [
  'E-01', 'E-02', 'E-03', 'E-04', 'E-05', 'E-06', 'E-07', 'E-08', 'E-09', 'E-10', 'E-11',
  'E-12', 'E-13', 'E-14', 'E-15', 'E-17', 'E-18', 'E-19', 'E-20', 'E-21', 'E-22', 'E-23', 'E-24', 'E-25', 'E-26',
];

// Templates the preview sample data doesn't cover.
const EXTRA_DATA: Partial<Record<EmailTemplateId, unknown>> = {
  'E-08': { siteName: 'Shop', regressedCount: 1, newCriticalCount: 0, items: [{ title: 'Alt text', impact: 'serious' }], viewUrl: 'https://x.test' },
  'E-10': { orgName: 'Org', sites: [{ siteName: 'Shop', currentScore: 90, scoreDelta: 1, newIssuesCount: 1, fixedIssuesCount: 2 }], overdueAssignedCount: 0, viewUrl: 'https://x.test' },
  'E-12': { siteName: 'Shop', reportPeriod: 'October 2026', downloadUrl: 'https://x.test', score: 90 },
  'E-21': { orgName: 'Org', webhookUrl: 'https://hooks.test', failureCount: 5, settingsUrl: 'https://x.test' },
};

describe('email logo', () => {
  it.each(TEMPLATE_IDS)('%s shows the EveryVisitor logo', (id) => {
    const { html } = renderEmail(id, (EXTRA_DATA[id] ?? getSampleTemplateData(id)) as never);
    expect(html).toMatch(/<img[^>]+src="[^"]*everyvisitor-logo\.png"[^>]*alt="EveryVisitor"/);
  });
});
