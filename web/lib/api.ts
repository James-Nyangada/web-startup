export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: ApiError;
}

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiException extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'ApiException';
  }
}

/**
 * On a custom portal domain the API is reached through the same origin (Caddy proxies
 * `/v1/*`), so cookies stay first-party (P6-07).
 */
export function apiBaseUrl(): string {
  if (typeof window === 'undefined') return API_BASE_URL;
  const appHost = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_APP_URL || window.location.origin).host;
    } catch {
      return window.location.host;
    }
  })();
  const knownHosts = new Set([appHost, 'localhost:3000', '127.0.0.1:3000']);
  return knownHosts.has(window.location.host) ? API_BASE_URL : window.location.origin;
}

/** Fired on `window` when a signed-in request comes back 401 (S-80 re-auth dialog). */
export const SESSION_EXPIRED_EVENT = 'everyvisitor:session-expired';
/** Fired on `window` when the API answers 503 MAINTENANCE (S-80 maintenance page). */
export const MAINTENANCE_EVENT = 'everyvisitor:maintenance';

const AUTH_PATHS = ['/v1/auth/', '/v1/me'];

export interface ApiRequestInit extends RequestInit {
  /** A poll the app makes on its own; it does not count as activity for the idle session timeout. */
  background?: boolean;
}

export async function apiClient<T>(path: string, options: ApiRequestInit = {}): Promise<T> {
  const payload = await apiFetch<{ data?: T } | null>(path, options);
  return (payload?.data ?? payload) as T;
}

/** Like apiClient but returns the whole body, e.g. `{ data, nextCursor }`. */
export async function apiFetch<T>(path: string, { background, ...options }: ApiRequestInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `${apiBaseUrl()}${path}`;
  const headers = new Headers(options.headers);
  if (background) headers.set('X-Background-Request', '1');

  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Ensures cookies are sent and received
  });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const error = payload?.error;
    if (typeof window !== 'undefined') {
      if (res.status === 401 && !AUTH_PATHS.some((p) => path.startsWith(p))) {
        window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
      }
      if (res.status === 503 && error?.code === 'MAINTENANCE') {
        window.dispatchEvent(new CustomEvent(MAINTENANCE_EVENT));
      }
    }
    throw new ApiException(
      error?.code || 'UNKNOWN_ERROR',
      error?.message || `Request failed with status ${res.status}`,
      error?.details || {},
      res.status,
    );
  }

  return payload as T;
}
