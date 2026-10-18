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

export interface PlanDefinition extends PlanLimits {
  id: PlanType;
  priceMonthly: number;
  priceAnnual: number;
  currency: string;
  tag?: string;
  who: string;
  features: {
    regressionAlerts: boolean;
    slackWebhook: boolean;
    whiteLabel: boolean;
    customDomain: boolean;
    scheduledClientReports: boolean;
    evidencePack: boolean;
    publicApi: boolean;
  };
}

export const PLAN_DEFINITIONS: Record<PlanType, PlanDefinition> = {
  trial: {
    id: 'trial',
    name: '14-Day Trial',
    priceMonthly: 0,
    priceAnnual: 0,
    currency: 'USD',
    who: 'Free 14-day evaluation with full feature preview',
    maxSites: 3,
    maxPagesPerScan: 50,
    manualScansPerDayPerSite: 2,
    scheduledFrequency: 'weekly',
    teamMembers: 3,
    clientViewers: 0,
    retentionMonths: 1,
    features: {
      regressionAlerts: true,
      slackWebhook: false,
      whiteLabel: false,
      customDomain: false,
      scheduledClientReports: false,
      evidencePack: true,
      publicApi: false,
    },
  },
  store: {
    id: 'store',
    name: 'Store',
    priceMonthly: 29,
    priceAnnual: 290,
    currency: 'USD',
    who: 'One store owner, 1 site',
    maxSites: 1,
    maxPagesPerScan: 250,
    manualScansPerDayPerSite: 2,
    scheduledFrequency: 'weekly',
    teamMembers: 2,
    clientViewers: 0,
    retentionMonths: 12,
    features: {
      regressionAlerts: false,
      slackWebhook: false,
      whiteLabel: false,
      customDomain: false,
      scheduledClientReports: false,
      evidencePack: true,
      publicApi: false,
    },
  },
  growth: {
    id: 'growth',
    name: 'Growth',
    priceMonthly: 79,
    priceAnnual: 790,
    currency: 'USD',
    tag: 'Popular for growing brands',
    who: 'Growing brands, 3 sites, daily scans',
    maxSites: 3,
    maxPagesPerScan: 500,
    manualScansPerDayPerSite: 5,
    scheduledFrequency: 'daily',
    teamMembers: 5,
    clientViewers: 0,
    retentionMonths: 12,
    features: {
      regressionAlerts: true,
      slackWebhook: true,
      whiteLabel: false,
      customDomain: false,
      scheduledClientReports: false,
      evidencePack: true,
      publicApi: false,
    },
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    priceMonthly: 199,
    priceAnnual: 1990,
    currency: 'USD',
    tag: 'Most popular for agencies',
    who: 'Digital agencies managing up to 25 client sites',
    maxSites: 25,
    maxPagesPerScan: 250,
    manualScansPerDayPerSite: 3,
    scheduledFrequency: 'weekly',
    teamMembers: 10,
    clientViewers: Number.POSITIVE_INFINITY,
    retentionMonths: 24,
    features: {
      regressionAlerts: true,
      slackWebhook: true,
      whiteLabel: true,
      customDomain: false,
      scheduledClientReports: true,
      evidencePack: true,
      publicApi: false,
    },
  },
  agency_pro: {
    id: 'agency_pro',
    name: 'Agency Pro',
    priceMonthly: 399,
    priceAnnual: 3990,
    currency: 'USD',
    who: 'Large agencies up to 75 sites with custom portal domain and API',
    maxSites: 75,
    maxPagesPerScan: 500,
    manualScansPerDayPerSite: 10,
    scheduledFrequency: 'daily',
    teamMembers: Number.POSITIVE_INFINITY,
    clientViewers: Number.POSITIVE_INFINITY,
    retentionMonths: 24,
    features: {
      regressionAlerts: true,
      slackWebhook: true,
      whiteLabel: true,
      customDomain: true,
      scheduledClientReports: true,
      evidencePack: true,
      publicApi: true,
    },
  },
};

export function getPlanLimits(plan: PlanType = 'trial'): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.trial;
}

export function listPublicPlans(): PlanDefinition[] {
  return [
    PLAN_DEFINITIONS.store,
    PLAN_DEFINITIONS.growth,
    PLAN_DEFINITIONS.agency,
    PLAN_DEFINITIONS.agency_pro,
  ];
}
