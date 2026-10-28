import { apiClient, ApiException } from './api';

export interface User {
  id: string;
  email: string;
  name: string;
  emailVerifiedAt: string | null;
  avatarUrl: string | null;
  timeZone: string;
  isStaff: boolean;
  lastActiveOrgId: string | null;
  createdAt: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  type: 'agency' | 'store';
  plan: string;
  billingStatus?: 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'read_only';
  trialEndsAt?: string | null;
  updatedAt?: string | null;
  hasLogo?: boolean;
  logoVersion?: number | null;
}

export interface Membership {
  id: string;
  orgId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
  org: OrganizationSummary;
}

export interface ClientAccess {
  id: string;
  userId: string;
  orgId: string;
  siteId: string;
  createdAt: string;
}

export interface MeResponse {
  user: User;
  memberships: Membership[];
  clientAccess: ClientAccess[];
  activeOrg: OrganizationSummary | null;
  /** Set while a staff user views a customer org read-only (P6-02). */
  impersonation?: { org: { id: string; slug: string | null; name: string } } | null;
  /** True while the session still owes a second-factor check. */
  mfaPending?: boolean;
}

export interface SignUpParams {
  email: string;
  password: string;
  name?: string;
  turnstileToken?: string;
}

export interface SignInParams {
  email: string;
  password: string;
}

export interface ResetPasswordParams {
  token: string;
  newPassword: string;
}

export interface ChangePasswordParams {
  currentPassword: string;
  newPassword: string;
}

export interface ActiveSession {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export const authClient = {
  async signUp(params: SignUpParams) {
    return apiClient<{ message: string }>('/v1/auth/sign-up', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async signIn(params: SignInParams) {
    return apiClient<{ user: User }>('/v1/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async requestMagicLink(email: string) {
    return apiClient<{ message: string }>('/v1/auth/magic-link', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async verifyMagicLink(token: string) {
    return apiClient<{ verified: boolean }>(
      `/v1/auth/magic-link/verify?token=${encodeURIComponent(token)}`,
      { method: 'GET' },
    );
  },

  async signOut() {
    // Onboarding progress is stored per browser; don't hand it to the next account.
    try {
      localStorage.removeItem('everyvisitor_onboarding_v1');
    } catch {
      // Ignore storage errors
    }
    return apiClient<{ success: boolean }>('/v1/auth/sign-out', {
      method: 'POST',
    });
  },

  async verifyEmail(token: string) {
    return apiClient<{ verified: boolean; message: string }>('/v1/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  },

  async forgotPassword(email: string) {
    return apiClient<{ message: string }>('/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(params: ResetPasswordParams) {
    return apiClient<{ success: boolean; message: string }>('/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async getMe(): Promise<MeResponse> {
    return apiClient<MeResponse>('/v1/me', {
      method: 'GET',
    });
  },

  async updateProfile(data: Partial<Pick<User, 'name' | 'timeZone' | 'avatarUrl' | 'lastActiveOrgId'>>) {
    return apiClient<{ user: User }>('/v1/me', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /** Uploads a profile picture (a data URL, already resized) and returns the updated user. */
  async uploadAvatar(dataUrl: string) {
    return apiClient<{ user: User }>('/v1/me/avatar', {
      method: 'POST',
      body: JSON.stringify({ dataUrl }),
    });
  },

  async removeAvatar() {
    return apiClient<{ user: User }>('/v1/me/avatar', { method: 'DELETE' });
  },

  async changePassword(params: ChangePasswordParams) {
    return apiClient<{ success: boolean; message: string }>('/v1/me/change-password', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  },

  async listSessions() {
    return apiClient<{ sessions: ActiveSession[] }>('/v1/me/sessions', {
      method: 'GET',
    });
  },

  async revokeSession(id: string) {
    return apiClient<{ success: boolean }>(`/v1/me/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async requestDataExport() {
    return apiClient<{ message: string }>('/v1/me/export', {
      method: 'POST',
    });
  },

  async deleteAccount() {
    return apiClient<{ success: boolean; message: string }>('/v1/me', {
      method: 'DELETE',
    });
  },
};

export { ApiException };
