import * as dns from 'node:dns/promises';
import { Parser } from 'htmlparser2';
import { createGuardedFetch, type GuardedFetch } from '../net/guarded-fetch.js';

export type VerifyMethod = 'meta' | 'dns' | 'file' | 'plugin' | 'shopify';

export interface VerificationResult {
  ok: boolean;
  method: VerifyMethod;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface VerificationCheckOptions {
  fetcher?: GuardedFetch;
  lookupTxt?: (hostname: string) => Promise<string[][]>;
}

const defaultGuardedFetch = createGuardedFetch({
  userAgent: 'Mozilla/5.0 (compatible; PlainsightBot/1.0; +https://plainsight.app/bot)',
  timeoutMs: 10000,
  maxBytes: 2 * 1024 * 1024,
});

function extractMetaTag(html: string): { foundMeta: boolean; token: string | null } {
  let foundMeta = false;
  let token: string | null = null;

  const parser = new Parser({
    onopentag(name, attribs) {
      if (name.toLowerCase() === 'meta') {
        const metaName = (attribs.name ?? attribs.property ?? '').toLowerCase().trim();
        if (metaName === 'plainsight-verify' || metaName === 'product_name-verify') {
          foundMeta = true;
          if (attribs.content) {
            token = attribs.content.trim();
          }
        }
      }
    },
  });

  parser.write(html);
  parser.end();

  return { foundMeta, token };
}

/**
 * Verify site ownership via HTML Meta Tag.
 * Checks for <meta name="plainsight-verify" content="<token>"> in the root URL page.
 */
export async function verifyMetaTag(
  rootUrl: string,
  expectedToken: string,
  fetcher: GuardedFetch = defaultGuardedFetch,
): Promise<VerificationResult> {
  try {
    const res = await fetcher(rootUrl);
    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        method: 'meta',
        reason: `Could not reach ${rootUrl} (HTTP ${res.status}).`,
      };
    }

    const html = res.text();
    const { foundMeta, token } = extractMetaTag(html);

    if (!foundMeta) {
      return {
        ok: false,
        method: 'meta',
        reason: "No meta tag with name='plainsight-verify' was found on your home page.",
      };
    }

    if (!token) {
      return {
        ok: false,
        method: 'meta',
        reason: "Found meta tag 'plainsight-verify', but its content attribute is empty.",
      };
    }

    if (token !== expectedToken) {
      return {
        ok: false,
        method: 'meta',
        reason: `Found meta tag 'plainsight-verify', but the token does not match. Found '${token}', expected '${expectedToken}'.`,
        details: { foundToken: token, expectedToken },
      };
    }

    return {
      ok: true,
      method: 'meta',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      method: 'meta',
      reason: `Verification request failed: ${message}`,
    };
  }
}

/**
 * Verify site ownership via /.well-known/plainsight-verify.txt file.
 */
export async function verifyFile(
  rootUrl: string,
  expectedToken: string,
  fetcher: GuardedFetch = defaultGuardedFetch,
): Promise<VerificationResult> {
  const urlObj = new URL(rootUrl);
  // Remove any path/query, target /.well-known/plainsight-verify.txt
  const fileUrl = `${urlObj.origin}/.well-known/plainsight-verify.txt`;

  try {
    const res = await fetcher(fileUrl);
    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        method: 'file',
        reason: `Could not retrieve ${fileUrl} (HTTP ${res.status}). Ensure the file is publicly accessible.`,
        details: { status: res.status, url: fileUrl },
      };
    }

    const text = res.text().trim();
    // In case the file has plainsight-verify=<token> or just <token>
    const cleanContent = text.replace(/^plainsight-verify\s*=\s*/i, '').trim();

    if (!cleanContent) {
      return {
        ok: false,
        method: 'file',
        reason: `File ${fileUrl} was found, but it is empty.`,
      };
    }

    if (cleanContent !== expectedToken && text !== expectedToken) {
      return {
        ok: false,
        method: 'file',
        reason: `File ${fileUrl} was found, but the token does not match. Expected '${expectedToken}'.`,
        details: { foundContent: text, expectedToken },
      };
    }

    return {
      ok: true,
      method: 'file',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      method: 'file',
      reason: `Verification request to ${fileUrl} failed: ${message}`,
    };
  }
}

/**
 * Verify site ownership via DNS TXT record.
 * Checks for TXT record: plainsight-verify=<token> on apex or _plainsight.<host>.
 */
export async function verifyDns(
  rootUrl: string,
  expectedToken: string,
  options: VerificationCheckOptions = {},
): Promise<VerificationResult> {
  const urlObj = new URL(rootUrl);
  const hostname = urlObj.hostname;

  const lookup =
    options.lookupTxt ??
    (async (host: string): Promise<string[][]> => {
      return dns.resolveTxt(host);
    });

  const targetPrefix = 'plainsight-verify=';
  const expectedRecord = `${targetPrefix}${expectedToken}`;

  // Hosts to check: host itself, and _plainsight.host
  const hostsToCheck = [hostname, `_plainsight.${hostname}`];

  // If host starts with www., also check apex
  if (hostname.startsWith('www.')) {
    hostsToCheck.push(hostname.slice(4));
    hostsToCheck.push(`_plainsight.${hostname.slice(4)}`);
  }

  const foundTxtValues: string[] = [];

  for (const host of hostsToCheck) {
    try {
      const records = await lookup(host);
      for (const chunkGroup of records) {
        const fullTxt = chunkGroup.join('').trim();
        foundTxtValues.push(fullTxt);

        if (fullTxt === expectedRecord || fullTxt === expectedToken) {
          return {
            ok: true,
            method: 'dns',
          };
        }

        if (fullTxt.toLowerCase().startsWith('plainsight-verify=')) {
          const foundToken = fullTxt.slice(targetPrefix.length).trim();
          if (foundToken === expectedToken) {
            return {
              ok: true,
              method: 'dns',
            };
          }
          return {
            ok: false,
            method: 'dns',
            reason: `Found DNS TXT record for ${host}, but token does not match. Found '${foundToken}', expected '${expectedToken}'.`,
            details: { host, foundToken, expectedToken },
          };
        }
      }
    } catch {
      // Continue to next host
    }
  }

  return {
    ok: false,
    method: 'dns',
    reason: `No DNS TXT record matching '${expectedRecord}' found on ${hostname} or _plainsight.${hostname}. Note that DNS changes may take up to a few minutes to propagate.`,
    details: { hostsChecked: hostsToCheck, foundTxtValues: foundTxtValues.slice(0, 5) },
  };
}

/**
 * Main verifyOwnership entrypoint.
 */
export async function verifyOwnership(
  rootUrl: string,
  expectedToken: string,
  method: 'meta' | 'dns' | 'file',
  options: VerificationCheckOptions = {},
): Promise<VerificationResult> {
  const fetcher = options.fetcher ?? defaultGuardedFetch;

  switch (method) {
    case 'meta':
      return verifyMetaTag(rootUrl, expectedToken, fetcher);
    case 'file':
      return verifyFile(rootUrl, expectedToken, fetcher);
    case 'dns':
      return verifyDns(rootUrl, expectedToken, options);
    default: {
      const unhandledMethod: string = method;
      return {
        ok: false,
        method,
        reason: `Unsupported verification method: ${unhandledMethod}`,
      };
    }
  }
}
