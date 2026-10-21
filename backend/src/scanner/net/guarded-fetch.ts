import { gunzipSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { Agent, fetch as undiciFetch, type Dispatcher } from 'undici';
import {
  assertPublicUrl,
  BlockedUrlError,
  strictPolicy,
  type GuardPolicy,
  type PublicTarget,
} from './guard.js';

/*
 * This module is the ONLY place the scanner makes HTTP requests (spec P1-02).
 * ESLint forbids `fetch`, undici and node:http(s) everywhere else in src/scanner.
 */

export interface GuardedFetchOptions {
  policy?: GuardPolicy;
  userAgent: string;
  timeoutMs?: number;
  /** Bodies larger than this (after decompression) are cut off and flagged. */
  maxBytes?: number;
  maxRedirects?: number;
}

export interface GuardedResponse {
  /** URL after redirects. */
  url: string;
  status: number;
  headers: Headers;
  redirects: string[];
  body: Buffer;
  truncated: boolean;
  text(): string;
}

export type GuardedFetch = (url: string, init?: { accept?: string }) => Promise<GuardedResponse>;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** An undici Agent whose DNS lookup always returns the address we already validated. */
function pinnedAgent(address: string, timeoutMs: number): Agent {
  const family = address.includes(':') ? 6 : 4;
  return new Agent({
    connect: {
      timeout: timeoutMs,
      lookup: (_hostname, options, callback) => {
        if ((options as { all?: boolean }).all) callback(null, [{ address, family }]);
        else callback(null, address, family);
      },
    },
  });
}

async function readCapped(
  stream: Readable,
  maxBytes: number,
): Promise<{ body: Buffer; truncated: boolean }> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = chunk as Buffer;
    if (size + buffer.length > maxBytes) {
      chunks.push(buffer.subarray(0, maxBytes - size));
      stream.destroy();
      return { body: Buffer.concat(chunks), truncated: true };
    }
    chunks.push(buffer);
    size += buffer.length;
  }
  return { body: Buffer.concat(chunks), truncated: false };
}

export interface GuardedPostResult {
  status: number;
  ok: boolean;
  /** First `maxBytes` of the response body, for error logs. */
  text: string;
}

/** Sends a POST to an already-validated target. Injectable so tests need no network. */
export type GuardedPostTransport = (
  target: PublicTarget,
  init: { headers: Record<string, string>; body: string; timeoutMs: number },
) => Promise<GuardedPostResult>;

/**
 * POST to a target that passed assertPublicUrl (webhooks, spec 11.2). The connection is
 * pinned to the validated address (no DNS rebinding) and redirects are never followed:
 * a 3xx is returned as a non-ok status so it cannot bounce the request to a private host.
 */
export const pinnedPost: GuardedPostTransport = async (target, init) => {
  const dispatcher = pinnedAgent(target.addresses[0]!, init.timeoutMs);
  try {
    const response = await undiciFetch(target.url, {
      dispatcher,
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(init.timeoutMs),
      headers: init.headers,
      body: init.body,
    });
    const stream = response.body ? Readable.fromWeb(response.body) : Readable.from([]);
    const { body } = await readCapped(stream, 4096);
    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      text: body.toString('utf8'),
    };
  } finally {
    void dispatcher.close();
  }
};

export function createGuardedFetch(options: GuardedFetchOptions): GuardedFetch {
  const policy = options.policy ?? strictPolicy;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  const maxRedirects = options.maxRedirects ?? 5;

  return async (input, init = {}) => {
    const redirects: string[] = [];
    let current = input;

    for (let hop = 0; ; hop++) {
      // Spec 11.2 step 5: every hop is re-checked.
      const target = await assertPublicUrl(current, policy);
      const dispatcher: Dispatcher = pinnedAgent(target.addresses[0]!, timeoutMs);
      try {
        const response = await undiciFetch(target.url, {
          dispatcher,
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            'user-agent': options.userAgent,
            accept:
              init.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'accept-encoding': 'gzip, deflate, br',
          },
        });

        if (REDIRECT_STATUSES.has(response.status)) {
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location) throw new BlockedUrlError(target.url.href, 'redirect without Location');
          if (hop >= maxRedirects)
            throw new BlockedUrlError(target.url.href, `more than ${maxRedirects} redirects`);
          current = new URL(location, target.url).href;
          redirects.push(current);
          continue;
        }

        const stream = response.body ? Readable.fromWeb(response.body) : Readable.from([]);
        let { body, truncated } = await readCapped(stream, maxBytes);
        // Sitemaps are often raw .gz files (no Content-Encoding), so sniff the gzip magic bytes.
        if (!truncated && body[0] === 0x1f && body[1] === 0x8b) {
          try {
            body = gunzipSync(body, { maxOutputLength: maxBytes });
          } catch {
            truncated = true; // corrupt, or larger than maxBytes once decompressed
          }
        }
        return {
          url: target.url.href,
          status: response.status,
          headers: response.headers,
          redirects,
          body,
          truncated,
          text: () => body.toString('utf8'),
        };
      } finally {
        void dispatcher.close();
      }
    }
  };
}
