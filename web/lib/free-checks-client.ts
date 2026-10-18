import { apiClient } from './api';

export interface FreeCheckIssue {
  ruleId: string;
  title: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  wcagCriteria: string[];
  occurrences: number;
  whoIsAffected: string;
  selector?: string;
  htmlSnippet?: string;
}

export interface FreeCheckCounts {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
}

export interface FreeCheckResultPayload {
  score: number;
  scoreBand: string;
  counts: FreeCheckCounts;
  topIssues: FreeCheckIssue[];
  pageTitle: string | null;
  checkedAt: string;
  loadMs: number | null;
}

export interface FreeCheckRecord {
  id: string;
  url: string;
  domain: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result: FreeCheckResultPayload | null;
  errorMessage: string | null;
  hasEmail: boolean;
  createdAt: string;
}

export interface CreateFreeCheckResponse {
  checkId: string;
  status: 'pending' | 'running';
  url: string;
}

export interface EmailFreeCheckResponse {
  success: boolean;
  message: string;
}

export const freeChecksClient = {
  async createCheck(url: string, turnstileToken?: string): Promise<CreateFreeCheckResponse> {
    return apiClient<CreateFreeCheckResponse>('/public/free-checks', {
      method: 'POST',
      body: JSON.stringify({ url, turnstileToken }),
    });
  },

  async getCheck(checkId: string): Promise<FreeCheckRecord> {
    return apiClient<FreeCheckRecord>(`/public/free-checks/${encodeURIComponent(checkId)}`, {
      method: 'GET',
    });
  },

  async emailReport(
    checkId: string,
    email: string,
    marketingConsent: boolean = false,
  ): Promise<EmailFreeCheckResponse> {
    return apiClient<EmailFreeCheckResponse>(
      `/public/free-checks/${encodeURIComponent(checkId)}/email`,
      {
        method: 'POST',
        body: JSON.stringify({ email, marketingConsent }),
      },
    );
  },
};
