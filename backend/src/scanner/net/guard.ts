import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isPublicAddress } from './ip-ranges.js';

export type Resolver = (hostname: string) => Promise<string[]>;

export interface GuardPolicy {
  /** Ports allowed in URLs. Spec: 80 and 443 only. */
  allowedPorts: readonly number[];
  /** Decides whether a resolved IP may be contacted. */
  isAllowedAddress: (address: string) => boolean;
  resolve: Resolver;
}

export const systemResolver: Resolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
};

/**
 * The production policy. Tests and the local fixture server pass a looser
 * policy explicitly; nothing reads it from the environment.
 */
export const strictPolicy: GuardPolicy = {
  allowedPorts: [80, 443],
  isAllowedAddress: isPublicAddress,
  resolve: systemResolver,
};

export class BlockedUrlError extends Error {
  constructor(
    readonly url: string,
    readonly reason: string,
  ) {
    super(`Blocked URL ${url}: ${reason}`);
    this.name = 'BlockedUrlError';
  }
}

export interface PublicTarget {
  url: URL;
  /** Validated addresses; connections are pinned to the first one (DNS-rebinding protection). */
  addresses: string[];
}

/**
 * Spec 11.2 steps 1–2. The WHATWG URL parser already canonicalises decimal,
 * octal and hex IPv4 forms (`http://2130706433` → `127.0.0.1`), so checking the
 * parsed hostname covers them.
 */
export async function assertPublicUrl(
  input: string | URL,
  policy: GuardPolicy = strictPolicy,
): Promise<PublicTarget> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BlockedUrlError(String(input), 'not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError(url.href, `scheme ${url.protocol} is not allowed`);
  }
  if (url.username || url.password) {
    throw new BlockedUrlError(url.href, 'credentials in URLs are not allowed');
  }
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  if (!policy.allowedPorts.includes(port)) {
    throw new BlockedUrlError(url.href, `port ${port} is not allowed`);
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (!hostname) throw new BlockedUrlError(url.href, 'missing host');

  let addresses: string[];
  if (isIP(hostname)) {
    addresses = [hostname];
  } else {
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      throw new BlockedUrlError(url.href, 'localhost is not allowed');
    }
    try {
      addresses = await policy.resolve(hostname);
    } catch {
      throw new BlockedUrlError(url.href, `could not resolve ${hostname}`);
    }
    if (addresses.length === 0) throw new BlockedUrlError(url.href, `no addresses for ${hostname}`);
  }

  const blocked = addresses.find((address) => !policy.isAllowedAddress(address));
  if (blocked)
    throw new BlockedUrlError(
      url.href,
      `${hostname} resolves to a non-public address (${blocked})`,
    );

  return { url, addresses };
}
