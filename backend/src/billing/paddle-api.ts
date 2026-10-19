import { logger } from '../lib/logger.js';
import { AppError } from '../lib/app-error.js';
import { ErrorCode } from '../shared/errors.js';

export interface PaddleClientOptions {
  apiKey?: string;
  environment?: 'sandbox' | 'production';
}

export interface PaddleSubscriptionUpdateParams {
  priceId: string;
  prorationBillingMode: 'prorated_immediately' | 'full_next_billing_period';
}

export interface PaddleSubscriptionCancelParams {
  effectiveFrom?: 'next_billing_period' | 'immediately';
}

export interface PaddleSubscriptionResponse {
  id: string;
  status: string;
  customerId?: string;
  currentBillingPeriod?: {
    startsAt?: string;
    endsAt?: string;
  };
  scheduledChange?: {
    action: string;
    effectiveAt: string;
  } | null;
  items?: Array<{
    price?: {
      id: string;
    };
  }>;
}

export interface PaddleCustomerPortalSessionResponse {
  id: string;
  customerId: string;
  urls: {
    general?: {
      overview?: string;
    };
  };
}

/**
 * Paddle Billing API client.
 * Calls Paddle Billing REST API (https://api.paddle.com or https://sandbox-api.paddle.com)
 * for subscription updates, cancellations, resumes, and customer portal sessions.
 */
export class PaddleClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly environment: 'sandbox' | 'production';

  constructor(options?: PaddleClientOptions) {
    this.apiKey = options?.apiKey ?? process.env.PADDLE_API_KEY;
    this.environment =
      options?.environment ?? (process.env.PADDLE_ENV === 'production' ? 'production' : 'sandbox');
    this.baseUrl =
      this.environment === 'production'
        ? 'https://api.paddle.com'
        : 'https://sandbox-api.paddle.com';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  getEnvironment(): 'sandbox' | 'production' {
    return this.environment;
  }

  /**
   * Updates an existing subscription's plan/price in Paddle.
   * Spec Section 7.9:
   * "proration: `prorated_immediately` for upgrades, `full_next_billing_period` for downgrades"
   */
  async updateSubscription(
    subscriptionId: string,
    params: PaddleSubscriptionUpdateParams,
  ): Promise<PaddleSubscriptionResponse> {
    if (!this.isConfigured()) {
      logger.info(
        { subscriptionId, params },
        'Paddle API key not configured; simulating subscription update',
      );
      return {
        id: subscriptionId,
        status: 'active',
        items: [{ price: { id: params.priceId } }],
      };
    }

    const payload = {
      items: [
        {
          price_id: params.priceId,
          quantity: 1,
        },
      ],
      proration_billing_mode: params.prorationBillingMode,
    };

    return this.request<PaddleSubscriptionResponse>(
      'PATCH',
      `/subscriptions/${subscriptionId}`,
      payload,
    );
  }

  /**
   * Schedules or executes a subscription cancellation in Paddle.
   * Spec Section 7.9: "Cancel at period end, with optional reason (stored)"
   */
  async cancelSubscription(
    subscriptionId: string,
    params?: PaddleSubscriptionCancelParams,
  ): Promise<PaddleSubscriptionResponse> {
    if (!this.isConfigured()) {
      logger.info(
        { subscriptionId, params },
        'Paddle API key not configured; simulating subscription cancellation',
      );
      return {
        id: subscriptionId,
        status: 'active',
        scheduledChange: {
          action: 'cancel',
          effectiveAt: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
        },
      };
    }

    const payload = {
      effective_from: params?.effectiveFrom ?? 'next_billing_period',
    };

    return this.request<PaddleSubscriptionResponse>(
      'POST',
      `/subscriptions/${subscriptionId}/cancel`,
      payload,
    );
  }

  /**
   * Resumes a subscription in Paddle by clearing the scheduled cancellation.
   */
  async resumeSubscription(subscriptionId: string): Promise<PaddleSubscriptionResponse> {
    if (!this.isConfigured()) {
      logger.info(
        { subscriptionId },
        'Paddle API key not configured; simulating subscription resume',
      );
      return {
        id: subscriptionId,
        status: 'active',
        scheduledChange: null,
      };
    }

    const payload = {
      scheduled_change: null,
    };

    return this.request<PaddleSubscriptionResponse>(
      'PATCH',
      `/subscriptions/${subscriptionId}`,
      payload,
    );
  }

  /**
   * Creates an authenticated customer portal session link for the given customer.
   */
  async createCustomerPortalSession(
    customerId: string,
    subscriptionIds?: string[],
  ): Promise<{ url: string }> {
    const isSandbox = this.environment === 'sandbox';
    const fallbackUrl = `https://${isSandbox ? 'sandbox-' : ''}customer-portal.paddle.com`;

    if (!this.isConfigured()) {
      logger.info(
        { customerId },
        'Paddle API key not configured; using default customer portal url',
      );
      return { url: fallbackUrl };
    }

    try {
      const payload: Record<string, unknown> = {};
      if (subscriptionIds && subscriptionIds.length > 0) {
        payload.subscription_ids = subscriptionIds;
      }

      const res = await this.request<{
        urls?: {
          general?: {
            overview?: string;
          };
        };
        data?: {
          urls?: {
            general?: {
              overview?: string;
            };
          };
        };
      }>('POST', `/customers/${customerId}/portal-sessions`, payload);

      const sessionUrl = res.urls?.general?.overview ?? res.data?.urls?.general?.overview;
      return { url: sessionUrl || fallbackUrl };
    } catch (err) {
      logger.warn(
        { err, customerId },
        'Failed to create Paddle customer portal session, using fallback URL',
      );
      return { url: fallbackUrl };
    }
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseText = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(responseText);
    } catch {
      json = null;
    }

    if (!res.ok) {
      const errorMsg =
        (json as { error?: { message?: string } })?.error?.message ||
        `Paddle API request failed with status ${res.status}: ${responseText}`;
      logger.error({ status: res.status, url, responseText }, 'Paddle API error');
      throw new AppError(res.status >= 500 ? 502 : 400, ErrorCode.INTERNAL_ERROR, errorMsg, {
        paddleStatus: res.status,
        paddleError: json,
      });
    }

    const typedJson = json as { data?: T } | T;
    if (
      typedJson &&
      typeof typedJson === 'object' &&
      'data' in typedJson &&
      typedJson.data !== undefined
    ) {
      return typedJson.data;
    }
    return typedJson as T;
  }
}

export const defaultPaddleClient = new PaddleClient();
