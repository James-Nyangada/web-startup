export const PLANS = ['trial', 'store', 'growth', 'agency', 'agency_pro'] as const;
export type PlanType = (typeof PLANS)[number];

export interface PlanLimits {
  name: string;
  maxSites: number;
  maxPagesPerScan: number;
  manualScansPerDayPerSite: number;
  scheduledFrequency: 'weekly' | 'daily';
  teamMembers: number;
  clientViewers: number;
  retentionMonths: number;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  trial: {
    name: 'Trial',
    maxSites: 3,
    maxPagesPerScan: 50,
    manualScansPerDayPerSite: 2,
    scheduledFrequency: 'weekly',
    teamMembers: 3,
    clientViewers: 0,
    retentionMonths: 1, // 30 days
  },
  store: {
    name: 'Store',
    maxSites: 1,
    maxPagesPerScan: 250,
    manualScansPerDayPerSite: 2,
    scheduledFrequency: 'weekly',
    teamMembers: 2,
    clientViewers: 0,
    retentionMonths: 12,
  },
  growth: {
    name: 'Growth',
    maxSites: 3,
    maxPagesPerScan: 500,
    manualScansPerDayPerSite: 5,
    scheduledFrequency: 'daily',
    teamMembers: 5,
    clientViewers: 0,
    retentionMonths: 12,
  },
  agency: {
    name: 'Agency',
    maxSites: 25,
    maxPagesPerScan: 250,
    manualScansPerDayPerSite: 3,
    scheduledFrequency: 'weekly',
    teamMembers: 10,
    clientViewers: Number.POSITIVE_INFINITY,
    retentionMonths: 24,
  },
  agency_pro: {
    name: 'Agency Pro',
    maxSites: 75,
    maxPagesPerScan: 500,
    manualScansPerDayPerSite: 10,
    scheduledFrequency: 'daily',
    teamMembers: Number.POSITIVE_INFINITY,
    clientViewers: Number.POSITIVE_INFINITY,
    retentionMonths: 24,
  },
};

export function getPlanLimits(plan: PlanType = 'trial'): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.trial;
}
