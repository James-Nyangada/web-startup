import crypto from 'node:crypto';

export interface ConnectExchangePayload {
  siteId: string;
  orgId: string;
  apiKey: {
    id: string;
    secret: string;
    prefix: string;
  };
  expiresAt: number;
}

const connectCodes = new Map<string, ConnectExchangePayload>();

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function storeConnectExchangeCode(
  payload: Omit<ConnectExchangePayload, 'expiresAt'>,
): string {
  // Prune expired codes if map grows
  if (connectCodes.size > 200) {
    const now = Date.now();
    for (const [k, v] of connectCodes.entries()) {
      if (v.expiresAt <= now) {
        connectCodes.delete(k);
      }
    }
  }

  const code = `ev_code_${crypto.randomBytes(24).toString('base64url')}`;
  connectCodes.set(code, {
    ...payload,
    expiresAt: Date.now() + CODE_TTL_MS,
  });
  return code;
}

export function redeemConnectExchangeCode(
  code: string,
): Omit<ConnectExchangePayload, 'expiresAt'> | null {
  const found = connectCodes.get(code);
  if (!found) return null;
  // Ephemeral, single-use
  connectCodes.delete(code);
  if (Date.now() > found.expiresAt) {
    return null;
  }
  const { expiresAt, ...data } = found;
  void expiresAt;
  return data;
}

export function clearConnectExchangeCodes(): void {
  connectCodes.clear();
}
