import { AppError } from '../lib/app-error.js';
import { ErrorCode } from './errors.js';

export const PLANS = ['trial', 'store', 'growth', 'agency', 'agency_pro'] as const;
export type PlanType = (typeof PLANS)[number];

export interface PlanLimits {
  name: string;
  maxSites: number;
  maxPagesPerScan: number;
  manualScansPerDayPerSite: number;
  scheduledFrequency: 'weekly' | 'daily';
  maxDailySites: number;
  teamMembers: number;
  clientViewers: number;
  retentionMonths: number;
  aiSuggestionsMonthly: number;
}

export const PLAN_LIMITS: Record<PlanType, PlanLimits> = {
  trial: {
    name: 'Trial',
    maxSites: 3,
    maxPagesPerScan: 50,
    manualScansPerDayPerSite: 2,
    scheduledFrequency: 'weekly',
    maxDailySites: 0,
    teamMembers: 3,
    clientViewers: 0,
    retentionMonths: 1, // 30 days
    aiSuggestionsMonthly: 20,
  },
  store: {
    name: 'Store',
    maxSites: 1,
    maxPagesPerScan: 250,
    manualScansPerDayPerSite: 2,
    scheduledFrequency: 'weekly',
    maxDailySites: 0,
    teamMembers: 2,
    clientViewers: 0,
    retentionMonths: 12,
    aiSuggestionsMonthly: 20,
  },
  growth: {
    name: 'Growth',
    maxSites: 3,
    maxPagesPerScan: 500,
    manualScansPerDayPerSite: 5,
    scheduledFrequency: 'daily',
    maxDailySites: Number.POSITIVE_INFINITY,
    teamMembers: 5,
    clientViewers: 0,
    retentionMonths: 12,
    aiSuggestionsMonthly: 100,
  },
  agency: {
    name: 'Agency',
    maxSites: 25,
    maxPagesPerScan: 250,
    manualScansPerDayPerSite: 3,
    scheduledFrequency: 'weekly',
    maxDailySites: 5,
    teamMembers: 10,
    clientViewers: Number.POSITIVE_INFINITY,
    retentionMonths: 24,
    aiSuggestionsMonthly: 500,
  },
  agency_pro: {
    name: 'Agency Pro',
    maxSites: 75,
    maxPagesPerScan: 500,
    manualScansPerDayPerSite: 10,
    scheduledFrequency: 'daily',
    maxDailySites: Number.POSITIVE_INFINITY,
    teamMembers: Number.POSITIVE_INFINITY,
    clientViewers: Number.POSITIVE_INFINITY,
    retentionMonths: 24,
    aiSuggestionsMonthly: 2000,
  },
};

export interface PlanFeatures {
  regressionAlerts: boolean;
  slackWebhook: boolean;
  whiteLabel: boolean;
  customDomain: boolean;
  scheduledClientReports: boolean;
  evidencePack: boolean;
  publicApi: boolean;
}

export interface PlanDefinition extends PlanLimits {
  id: PlanType;
  priceMonthly: number;
  priceAnnual: number;
  currency: string;
  tag?: string;
  who: string;
  features: PlanFeatures;
}

export const PLAN_DEFINITIONS: Record<PlanType, PlanDefinition> = {
  trial: {
    ...PLAN_LIMITS.trial,
    id: 'trial',
    name: '14-Day Trial',
    priceMonthly: 0,
    priceAnnual: 0,
    currency: 'USD',
    who: 'Free 14-day evaluation with full feature preview',
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
    ...PLAN_LIMITS.store,
    id: 'store',
    name: 'Store',
    priceMonthly: 29,
    priceAnnual: 290,
    currency: 'USD',
    who: 'One store owner, 1 site',
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
    ...PLAN_LIMITS.growth,
    id: 'growth',
    name: 'Growth',
    priceMonthly: 79,
    priceAnnual: 790,
    currency: 'USD',
    tag: 'Popular for growing brands',
    who: 'Growing brands, 3 sites, daily scans',
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
    ...PLAN_LIMITS.agency,
    id: 'agency',
    name: 'Agency',
    priceMonthly: 199,
    priceAnnual: 1990,
    currency: 'USD',
    tag: 'Most popular for agencies',
    who: 'Digital agencies managing up to 25 client sites',
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
    ...PLAN_LIMITS.agency_pro,
    id: 'agency_pro',
    name: 'Agency Pro',
    priceMonthly: 399,
    priceAnnual: 3990,
    currency: 'USD',
    who: 'Large agencies up to 75 sites with custom portal domain and API',
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

export interface PlanLimitDetails {
  limit: number | boolean | string;
  current?: number | boolean | string;
  upgradeTo: PlanType | null;
  [key: string]: unknown;
}

export class PlanLimitError extends AppError {
  constructor(
    message: string,
    readonly limitDetails: PlanLimitDetails,
  ) {
    super(422, ErrorCode.PLAN_LIMIT, message, limitDetails);
    this.name = 'PlanLimitError';
  }
}

export type PlanFeature =
  | 'sites'
  | 'pages'
  | 'daily_scans'
  | 'manual_scans'
  | 'team_members'
  | 'client_viewers'
  | 'white_label'
  | 'custom_domain'
  | 'scheduled_reports'
  | 'slack_webhook'
  | 'public_api'
  | 'ai_suggestions';

export function getUpgradeTarget(
  currentPlan: PlanType,
  feature: PlanFeature,
  value?: number,
): PlanType | null {
  const tiers: PlanType[] = ['store', 'growth', 'agency', 'agency_pro'];
  const currentIndex = tiers.indexOf(currentPlan);

  for (let i = Math.max(0, currentIndex + 1); i < tiers.length; i++) {
    const candidate = tiers[i];
    if (!candidate) continue;
    const limits = PLAN_LIMITS[candidate];
    const def = PLAN_DEFINITIONS[candidate];

    if (feature === 'sites') {
      if (!value || limits.maxSites >= value) return candidate;
    } else if (feature === 'pages') {
      if (!value || limits.maxPagesPerScan >= value) return candidate;
    } else if (feature === 'daily_scans') {
      if (limits.maxDailySites > 0 && (!value || limits.maxDailySites >= value)) return candidate;
    } else if (feature === 'manual_scans') {
      if (!value || limits.manualScansPerDayPerSite >= value) return candidate;
    } else if (feature === 'team_members') {
      if (!value || limits.teamMembers >= value) return candidate;
    } else if (feature === 'client_viewers') {
      if (limits.clientViewers > 0) return candidate;
    } else if (feature === 'white_label') {
      if (def.features.whiteLabel) return candidate;
    } else if (feature === 'custom_domain') {
      if (def.features.customDomain) return candidate;
    } else if (feature === 'scheduled_reports') {
      if (def.features.scheduledClientReports) return candidate;
    } else if (feature === 'slack_webhook') {
      if (def.features.slackWebhook) return candidate;
    } else if (feature === 'public_api') {
      if (def.features.publicApi) return candidate;
    } else if (feature === 'ai_suggestions') {
      if (!value || limits.aiSuggestionsMonthly >= value) return candidate;
    }
  }

  return null;
}

export function assertWithinPlan(
  org: { plan?: PlanType | null } | PlanType | null | undefined,
  feature: PlanFeature,
  nextValue?: number | string | boolean,
): void {
  const plan: PlanType = (typeof org === 'string' ? org : org?.plan) || 'trial';

  const limits = getPlanLimits(plan);
  const def = getPlanDefinition(plan);

  switch (feature) {
    case 'sites': {
      const candidateCount = typeof nextValue === 'number' ? nextValue : 1;
      if (candidateCount > limits.maxSites) {
        const upgradeTo = getUpgradeTarget(plan, 'sites', candidateCount);
        throw new PlanLimitError(
          `You have reached your plan limit of ${limits.maxSites} monitored site${limits.maxSites === 1 ? '' : 's'}.${upgradeTo ? ` Upgrade to ${PLAN_LIMITS[upgradeTo].name} to monitor more sites.` : ''}`,
          {
            limit: limits.maxSites,
            current: candidateCount - 1,
            upgradeTo,
          },
        );
      }
      break;
    }
    case 'pages': {
      const requestedPages = typeof nextValue === 'number' ? nextValue : 1;
      if (requestedPages > limits.maxPagesPerScan) {
        const upgradeTo = getUpgradeTarget(plan, 'pages', requestedPages);
        throw new PlanLimitError(
          `Your plan allows up to ${limits.maxPagesPerScan} pages scanned per site.${upgradeTo ? ` Upgrade to ${PLAN_LIMITS[upgradeTo].name} for up to ${PLAN_LIMITS[upgradeTo].maxPagesPerScan} pages.` : ''}`,
          {
            limit: limits.maxPagesPerScan,
            current: requestedPages,
            upgradeTo,
          },
        );
      }
      break;
    }
    case 'daily_scans': {
      if (limits.maxDailySites === 0) {
        const upgradeTo: PlanType = 'growth';
        throw new PlanLimitError(
          `Daily scans are not available on the ${limits.name} plan. Upgrade to Growth or Agency for daily scans.`,
          {
            limit: 'weekly',
            current: 'daily',
            upgradeTo,
          },
        );
      }
      if (Number.isFinite(limits.maxDailySites)) {
        const candidateDaily = typeof nextValue === 'number' ? nextValue : 1;
        if (candidateDaily > limits.maxDailySites) {
          const upgradeTo: PlanType = 'agency_pro';
          throw new PlanLimitError(
            `You have reached your plan limit of ${limits.maxDailySites} daily-scanned sites. Upgrade to Agency Pro for unlimited daily scans.`,
            {
              limit: limits.maxDailySites,
              current: candidateDaily - 1,
              upgradeTo,
            },
          );
        }
      }
      break;
    }
    case 'manual_scans': {
      const candidateScans = typeof nextValue === 'number' ? nextValue : 1;
      if (candidateScans > limits.manualScansPerDayPerSite) {
        const upgradeTo = getUpgradeTarget(plan, 'manual_scans', candidateScans);
        throw new PlanLimitError(
          `You have reached your daily limit of ${limits.manualScansPerDayPerSite} manual scan${limits.manualScansPerDayPerSite === 1 ? '' : 's'} for this site on the ${limits.name} plan.`,
          {
            limit: limits.manualScansPerDayPerSite,
            current: candidateScans - 1,
            upgradeTo,
          },
        );
      }
      break;
    }
    case 'team_members': {
      const candidateMembers = typeof nextValue === 'number' ? nextValue : 1;
      if (candidateMembers > limits.teamMembers) {
        const upgradeTo = getUpgradeTarget(plan, 'team_members', candidateMembers);
        throw new PlanLimitError(
          `You have reached your plan limit of ${limits.teamMembers} team member${limits.teamMembers === 1 ? '' : 's'}.${upgradeTo ? ` Upgrade to ${PLAN_LIMITS[upgradeTo].name} to add more team seats.` : ''}`,
          {
            limit: limits.teamMembers,
            current: candidateMembers - 1,
            upgradeTo,
          },
        );
      }
      break;
    }
    case 'client_viewers': {
      if (limits.clientViewers === 0) {
        const upgradeTo: PlanType = 'agency';
        throw new PlanLimitError(
          `Client viewer accounts are only available on Agency and Agency Pro plans.`,
          {
            limit: 0,
            current: 0,
            upgradeTo,
          },
        );
      }
      break;
    }
    case 'white_label': {
      if (!def.features.whiteLabel) {
        const upgradeTo: PlanType = 'agency';
        throw new PlanLimitError(`White-label branding requires an Agency or Agency Pro plan.`, {
          limit: 'whiteLabel',
          current: plan,
          upgradeTo,
        });
      }
      break;
    }
    case 'custom_domain': {
      if (!def.features.customDomain) {
        const upgradeTo: PlanType = 'agency_pro';
        throw new PlanLimitError(
          `Custom portal domains are exclusively available on the Agency Pro plan.`,
          {
            limit: false,
            current: false,
            upgradeTo,
          },
        );
      }
      break;
    }
    case 'scheduled_reports': {
      if (!def.features.scheduledClientReports) {
        const upgradeTo: PlanType = 'agency';
        throw new PlanLimitError(
          `Scheduled client reports are available on Agency and Agency Pro plans.`,
          {
            limit: false,
            current: false,
            upgradeTo,
          },
        );
      }
      break;
    }
    case 'slack_webhook': {
      if (!def.features.slackWebhook) {
        const upgradeTo: PlanType = 'growth';
        throw new PlanLimitError(
          `Slack webhook integrations are available on Growth, Agency, and Agency Pro plans.`,
          {
            limit: false,
            current: false,
            upgradeTo,
          },
        );
      }
      break;
    }
    case 'public_api': {
      if (!def.features.publicApi) {
        const upgradeTo: PlanType = 'agency_pro';
        throw new PlanLimitError(
          `Public REST API access and API keys are exclusively available on the Agency Pro plan.`,
          {
            limit: false,
            current: false,
            upgradeTo,
          },
        );
      }
      break;
    }
    case 'ai_suggestions': {
      const candidateRequests = typeof nextValue === 'number' ? nextValue : 1;
      if (candidateRequests > limits.aiSuggestionsMonthly) {
        const upgradeTo = getUpgradeTarget(plan, 'ai_suggestions', candidateRequests);
        throw new PlanLimitError(
          `Monthly AI suggestion limit reached (${limits.aiSuggestionsMonthly} suggestions/month). Upgrade your plan or wait until next month.`,
          {
            limit: limits.aiSuggestionsMonthly,
            current: candidateRequests - 1,
            upgradeTo,
          },
        );
      }
      break;
    }
    default:
      break;
  }
}

export function getPlanLimits(plan: PlanType = 'trial'): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS.trial;
}

export function getPlanDefinition(plan: PlanType = 'trial'): PlanDefinition {
  return PLAN_DEFINITIONS[plan] ?? PLAN_DEFINITIONS.trial;
}

export function listPublicPlans(): PlanDefinition[] {
  return [
    PLAN_DEFINITIONS.store,
    PLAN_DEFINITIONS.growth,
    PLAN_DEFINITIONS.agency,
    PLAN_DEFINITIONS.agency_pro,
  ];
}

export interface PlanPriceMapping {
  plan: PlanType;
  interval: 'month' | 'year';
}

export function getPaddlePriceMap(): Record<string, PlanPriceMapping> {
  return {
    [process.env.PADDLE_PRICE_STORE_MONTHLY || 'pri_sandbox_store_monthly']: {
      plan: 'store',
      interval: 'month',
    },
    [process.env.PADDLE_PRICE_STORE_ANNUAL || 'pri_sandbox_store_annual']: {
      plan: 'store',
      interval: 'year',
    },
    [process.env.PADDLE_PRICE_GROWTH_MONTHLY || 'pri_sandbox_growth_monthly']: {
      plan: 'growth',
      interval: 'month',
    },
    [process.env.PADDLE_PRICE_GROWTH_ANNUAL || 'pri_sandbox_growth_annual']: {
      plan: 'growth',
      interval: 'year',
    },
    [process.env.PADDLE_PRICE_AGENCY_MONTHLY || 'pri_sandbox_agency_monthly']: {
      plan: 'agency',
      interval: 'month',
    },
    [process.env.PADDLE_PRICE_AGENCY_ANNUAL || 'pri_sandbox_agency_annual']: {
      plan: 'agency',
      interval: 'year',
    },
    [process.env.PADDLE_PRICE_AGENCY_PRO_MONTHLY || 'pri_sandbox_agency_pro_monthly']: {
      plan: 'agency_pro',
      interval: 'month',
    },
    [process.env.PADDLE_PRICE_AGENCY_PRO_ANNUAL || 'pri_sandbox_agency_pro_annual']: {
      plan: 'agency_pro',
      interval: 'year',
    },
  };
}

export function getPriceIdForPlan(plan: PlanType, interval: 'month' | 'year'): string {
  if (plan === 'trial') {
    throw new Error('Trial tier has no Paddle price ID');
  }
  const envKey = `PADDLE_PRICE_${plan.toUpperCase()}_${interval === 'month' ? 'MONTHLY' : 'ANNUAL'}`;
  const envVal = process.env[envKey];
  if (envVal && envVal.trim()) {
    return envVal.trim();
  }
  return `pri_sandbox_${plan}_${interval === 'month' ? 'monthly' : 'annual'}`;
}

export function getPlanForPriceId(priceId: string): PlanPriceMapping | null {
  if (!priceId) return null;
  const map = getPaddlePriceMap();
  return map[priceId] ?? null;
}
