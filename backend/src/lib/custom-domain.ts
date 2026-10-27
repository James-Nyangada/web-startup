import crypto from 'node:crypto';
import * as dns from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Custom portal domains (Agency Pro, P6-07). The agency points a subdomain they own at our
 * portal host with a CNAME, and proves control with a TXT record. Caddy only issues a
 * certificate once both checks have passed (GET /internal/tls-allowed).
 */

export const VERIFY_TXT_LABEL = '_everyvisitor-verify';
// Issued before the rename; domains already set up with it must keep verifying.
const LEGACY_VERIFY_TXT_LABEL = '_plainsight-verify';

export interface DnsResolver {
  resolveCname(host: string): Promise<string[]>;
  resolveTxt(host: string): Promise<string[][]>;
  resolve4(host: string): Promise<string[]>;
}

export const systemResolver: DnsResolver = {
  resolveCname: (host) => dns.resolveCname(host),
  resolveTxt: (host) => dns.resolveTxt(host),
  resolve4: (host) => dns.resolve4(host),
};

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** Lower-cases and strips a trailing dot, scheme, path or port someone pasted in. */
export function normalizeDomain(input: string): string {
  let value = input.trim().toLowerCase();
  value = value
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '');
  return value.replace(/\.$/, '');
}

/**
 * Returns a reason the domain cannot be used, or null if it is acceptable. A subdomain is
 * required (an apex cannot hold a CNAME), and our own domains are refused.
 */
export function customDomainProblem(domain: string, ownHosts: string[]): string | null {
  if (domain.length > 253) return 'That domain is too long.';
  if (isIP(domain)) return 'Use a domain name, not an IP address.';
  const labels = domain.split('.');
  if (labels.length < 3) {
    return 'Use a subdomain such as reports.youragency.com: a root domain cannot point to us with a CNAME.';
  }
  if (!labels.every((l) => LABEL.test(l))) return 'That is not a valid domain name.';
  if (/^\d+$/.test(labels[labels.length - 1]!)) return 'That is not a valid domain name.';
  for (const own of ownHosts) {
    const base = own.split('.').slice(-2).join('.');
    if (domain === own || domain.endsWith(`.${base}`) || domain === base) {
      return 'That domain belongs to us. Use a domain your agency owns.';
    }
  }
  return null;
}

export function newDomainVerifyToken(): string {
  return `everyvisitor-verify=${crypto.randomBytes(16).toString('hex')}`;
}

export interface DomainCheck {
  cname: boolean;
  txt: boolean;
  verified: boolean;
  found: { cname: string[]; txt: string[] };
}

const stripDot = (s: string) => s.toLowerCase().replace(/\.$/, '');

/**
 * Both records must be present. A CNAME that a DNS provider flattens (e.g. Cloudflare
 * proxying) still passes when the domain resolves to exactly the target's addresses.
 */
export async function checkCustomDomainDns(
  domain: string,
  token: string,
  target: string,
  resolver: DnsResolver = systemResolver,
): Promise<DomainCheck> {
  const safe = <T>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const [cnames, txtRecords, legacyTxtRecords] = await Promise.all([
    safe(resolver.resolveCname(domain), [] as string[]),
    safe(resolver.resolveTxt(`${VERIFY_TXT_LABEL}.${domain}`), [] as string[][]),
    safe(resolver.resolveTxt(`${LEGACY_VERIFY_TXT_LABEL}.${domain}`), [] as string[][]),
  ]);

  const wanted = stripDot(target);
  let cname = cnames.some((c) => stripDot(c) === wanted);
  if (!cname && cnames.length === 0) {
    const [mine, theirs] = await Promise.all([
      safe(resolver.resolve4(domain), [] as string[]),
      safe(resolver.resolve4(wanted), [] as string[]),
    ]);
    cname = mine.length > 0 && theirs.length > 0 && mine.every((ip) => theirs.includes(ip));
  }

  const txtValues = [...txtRecords, ...legacyTxtRecords].map((chunks) => chunks.join(''));
  const txt = txtValues.some((v) => v.trim().replace(/^"(.*)"$/, '$1').trim() === token);
  return { cname, txt, verified: cname && txt, found: { cname: cnames, txt: txtValues } };
}
