export type HealthBandValue = 'good' | 'at_risk' | 'poor';

export interface HealthInputs {
  /** Days since a member last signed in; null when never. */
  daysSinceSignIn: number | null;
  scansLast14d: number;
  openCriticalIssues: number;
  /** Open critical issues 14 days ago, to show the trend; null when unknown. */
  openCriticalIssues14dAgo: number | null;
  reportsLast30d: number;
  billingStatus: string;
}

/**
 * Customer health (0-100) from the five signals in the staff spec section 5.
 * Starts at 100 and subtracts per signal; every deduction adds a plain-language reason.
 */
export function computeHealth(i: HealthInputs): { score: number; band: HealthBandValue; reasons: string[] } {
  let score = 100;
  const reasons: string[] = [];

  if (i.daysSinceSignIn === null) {
    score -= 30;
    reasons.push('Nobody has signed in yet');
  } else if (i.daysSinceSignIn > 30) {
    score -= 30;
    reasons.push(`No sign-in for ${i.daysSinceSignIn} days`);
  } else if (i.daysSinceSignIn > 14) {
    score -= 15;
    reasons.push(`No sign-in for ${i.daysSinceSignIn} days`);
  }

  if (i.scansLast14d === 0) {
    score -= 25;
    reasons.push('No scans in the last 14 days');
  }

  if (i.openCriticalIssues > 0) {
    const worse = i.openCriticalIssues14dAgo !== null && i.openCriticalIssues > i.openCriticalIssues14dAgo;
    score -= worse ? 20 : 10;
    reasons.push(
      `${i.openCriticalIssues} open critical issue${i.openCriticalIssues === 1 ? '' : 's'}${worse ? ' (rising)' : ''}`,
    );
  }

  if (i.reportsLast30d === 0) {
    score -= 10;
    reasons.push('No reports generated in the last 30 days');
  }

  if (i.billingStatus === 'past_due') {
    score -= 25;
    reasons.push('Payment is past due');
  } else if (i.billingStatus === 'read_only') {
    score -= 40;
    reasons.push('Account is read-only');
  }

  score = Math.max(0, Math.min(100, score));
  const band: HealthBandValue = score >= 70 ? 'good' : score >= 40 ? 'at_risk' : 'poor';
  return { score, band, reasons };
}
