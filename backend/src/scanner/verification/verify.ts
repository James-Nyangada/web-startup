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
  userAgent: 'Mozilla/5.0 (compatible; EveryVisitorBot/1.0; +https://everyvisitor.app/bot)',
  timeoutMs: 10000,
  maxBytes: 2 * 1024 * 1024,
});

const VERIFY_NAME = 'everyvisitor-verify';
const VERIFY_DNS_LABEL = '_everyvisitor';
// Names issued before the rename; sites that already added them must keep verifying.
const LEGACY_VERIFY_NAME = 'plainsight-verify';
const LEGACY_VERIFY_DNS_LABEL = '_plainsight';
const VERIFY_NAMES = [VERIFY_NAME, LEGACY_VERIFY_NAME];

function extractMetaTag(html: string): { foundMeta: boolean; token: string | null } {
  let foundMeta = false;
  let token: string | null = null;

  const parser = new Parser({
    onopentag(name, attribs) {
      if (name.toLowerCase() === 'meta') {
        const metaName = (attribs.name ?? attribs.property ?? '').toLowerCase().trim();
        if (VERIFY_NAMES.includes(metaName) || metaName === 'product_name-verify') {
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
 * Checks for <meta name="everyvisitor-verify" content="<token>"> in the root URL page.
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
        reason: "No meta tag with name='everyvisitor-verify' was found on your home page.",
      };
    }

    if (!token) {
      return {
        ok: false,
        method: 'meta',
        reason: "Found meta tag 'everyvisitor-verify', but its content attribute is empty.",
      };
    }

    if (token !== expectedToken) {
      return {
        ok: false,
        method: 'meta',
        reason: `Found meta tag 'everyvisitor-verify', but the token does not match. Found '${token}', expected '${expectedToken}'.`,
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
 * Verify site ownership via /.well-known/everyvisitor-verify.txt file (or the legacy plainsight-verify.txt).
 */
export async function verifyFile(
  rootUrl: string,
  expectedToken: string,
  fetcher: GuardedFetch = defaultGuardedFetch,
): Promise<VerificationResult> {
  const urlObj = new URL(rootUrl);
  // Remove any path/query, target /.well-known/everyvisitor-verify.txt
  const fileUrl = `${urlObj.origin}/.well-known/${VERIFY_NAME}.txt`;
  const legacyFileUrl = `${urlObj.origin}/.well-known/${LEGACY_VERIFY_NAME}.txt`;

  try {
    let res = await fetcher(fileUrl);
    if (res.status < 200 || res.status >= 300) {
      const legacy = await fetcher(legacyFileUrl);
      if (legacy.status >= 200 && legacy.status < 300) res = legacy;
    }
    if (res.status < 200 || res.status >= 300) {
      return {
        ok: false,
        method: 'file',
        reason: `Could not retrieve ${fileUrl} (HTTP ${res.status}). Ensure the file is publicly accessible.`,
        details: { status: res.status, url: fileUrl },
      };
    }

    const text = res.text().trim();
    // In case the file has everyvisitor-verify=<token> or just <token>
    const cleanContent = text.replace(/^(?:everyvisitor|plainsight)-verify\s*=\s*/i, '').trim();

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
 * Checks for TXT record: everyvisitor-verify=<token> on apex or _everyvisitor.<host>
 * (the legacy plainsight-verify= / _plainsight forms are still accepted).
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

  const targetPrefix = `${VERIFY_NAME}=`;
  const expectedRecord = `${targetPrefix}${expectedToken}`;
  const recordPrefixes = VERIFY_NAMES.map((n) => `${n}=`);

  // Hosts to check: host itself, and _everyvisitor.host (plus the legacy label)
  const labels = [VERIFY_DNS_LABEL, LEGACY_VERIFY_DNS_LABEL];
  const hostsToCheck = [hostname, ...labels.map((l) => `${l}.${hostname}`)];

  // If host starts with www., also check apex
  if (hostname.startsWith('www.')) {
    const apex = hostname.slice(4);
    hostsToCheck.push(apex, ...labels.map((l) => `${l}.${apex}`));
  }

  const foundTxtValues: string[] = [];
  // A stale token on one host must not hide a correct one on another, so
  // mismatches are only reported once every host has been checked.
  let mismatch: { host: string; foundToken: string } | null = null;

  for (const host of hostsToCheck) {
    try {
      const records = await lookup(host);
      for (const chunkGroup of records) {
        // Some DNS panels store the quotes users paste around the value.
        const fullTxt = chunkGroup
          .join('')
          .trim()
          .replace(/^"(.*)"$/, '$1')
          .trim();
        foundTxtValues.push(fullTxt);

        if (fullTxt === expectedRecord || fullTxt === expectedToken) {
          return {
            ok: true,
            method: 'dns',
          };
        }

        const prefix = recordPrefixes.find((p) => fullTxt.toLowerCase().startsWith(p));
        if (prefix) {
          const foundToken = fullTxt.slice(prefix.length).trim();
          if (foundToken === expectedToken) {
            return {
              ok: true,
              method: 'dns',
            };
          }
          mismatch ??= { host, foundToken };
        }
      }
    } catch {
      // Continue to next host
    }
  }

  if (mismatch) {
    return {
      ok: false,
      method: 'dns',
      reason: `Found DNS TXT record for ${mismatch.host}, but token does not match. Found '${mismatch.foundToken}', expected '${expectedToken}'.`,
      details: { host: mismatch.host, foundToken: mismatch.foundToken, expectedToken },
    };
  }

  return {
    ok: false,
    method: 'dns',
    reason: `No DNS TXT record matching '${expectedRecord}' found on ${hostname} or ${VERIFY_DNS_LABEL}.${hostname}. Note that DNS changes may take up to a few minutes to propagate.`,
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
