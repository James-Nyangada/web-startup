import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { apiClient } from './api';

export interface PasskeyItem {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface MfaStatus {
  pending: boolean;
  totpEnabled: boolean;
  recoveryCodesRemaining: number;
  trustWindowHours: number;
  passkeys: PasskeyItem[];
}

const post = (path: string, body?: unknown) =>
  apiClient<never>(`/v1/mfa${path}`, {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  });

export const passkeysSupported = () =>
  typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';

/** Two-step verification: authenticator app, recovery codes and passkeys. */
export const mfaClient = {
  status: () => apiClient<MfaStatus>('/v1/mfa'),

  startTotp: () => post('/totp/setup') as Promise<{ secret: string; otpauthUrl: string }>,

  enableTotp: (code: string) =>
    post('/totp/enable', { code }) as Promise<{ enabled: boolean; recoveryCodes: string[] | null }>,

  disableTotp: (code: string) =>
    apiClient<{ enabled: boolean }>('/v1/mfa/totp', {
      method: 'DELETE',
      body: JSON.stringify({ code }),
    }),

  regenerateRecoveryCodes: (code: string) =>
    post('/recovery-codes', { code }) as Promise<{ recoveryCodes: string[] }>,

  /** Prompts the browser to create a passkey, then stores it. */
  async addPasskey(name: string) {
    const options = (await post('/passkeys/options')) as Parameters<typeof startRegistration>[0]['optionsJSON'];
    const response = await startRegistration({ optionsJSON: options });
    return post('/passkeys', { name, response }) as Promise<{ id: string; name: string }>;
  },

  removePasskey: (id: string) =>
    apiClient<{ success: boolean }>(`/v1/mfa/passkeys/${id}`, { method: 'DELETE' }),

  verifyCode: (code: string) => post('/verify/code', { code }) as Promise<{ verified: boolean }>,

  /** Prompts the browser for a saved passkey and checks it. */
  async verifyPasskey() {
    const options = (await post('/verify/passkey/options')) as Parameters<typeof startAuthentication>[0]['optionsJSON'];
    const response = await startAuthentication({ optionsJSON: options });
    return post('/verify/passkey', { response }) as Promise<{ verified: boolean }>;
  },
};
