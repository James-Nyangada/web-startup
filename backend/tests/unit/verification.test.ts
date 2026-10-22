import { describe, expect, it } from 'vitest';
import {
  verifyDns,
  verifyFile,
  verifyMetaTag,
  verifyOwnership,
} from '../../src/scanner/verification/verify.js';
import type { GuardedFetch, GuardedResponse } from '../../src/scanner/net/guarded-fetch.js';

function makeGuardedResponse(
  status: number,
  textContent: string,
  url = 'https://oakhaus.com',
): GuardedResponse {
  return {
    url,
    status,
    headers: new Headers({ 'content-type': 'text/html' }),
    redirects: [],
    body: Buffer.from(textContent),
    truncated: false,
    text: () => textContent,
  };
}

describe('Site Ownership Verification (Chunk P2-07 & Section 6.9)', () => {
  const rootUrl = 'https://oakhaus.com';
  const expectedToken = 'ps_9876543210abcdef';

  describe('Meta tag verification (verifyMetaTag)', () => {
    it('succeeds when home page contains valid <meta name="plainsight-verify" content="<token>">', async () => {
      const mockFetch: GuardedFetch = () =>
        Promise.resolve(
          makeGuardedResponse(
            200,
            `<!DOCTYPE html><html><head><title>Oakhaus</title><meta name="plainsight-verify" content="${expectedToken}"></head><body>Home</body></html>`,
          ),
        );

      const result = await verifyMetaTag(rootUrl, expectedToken, mockFetch);
      expect(result.ok).toBe(true);
      expect(result.method).toBe('meta');
    });

    it('fails with specific reason when meta tag is missing', async () => {
      const mockFetch: GuardedFetch = () =>
        Promise.resolve(
          makeGuardedResponse(
            200,
            `<!DOCTYPE html><html><head><title>Oakhaus</title></head><body>No meta</body></html>`,
          ),
        );

      const result = await verifyMetaTag(rootUrl, expectedToken, mockFetch);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain("No meta tag with name='plainsight-verify' was found");
    });

    it('fails with specific reason when token does not match', async () => {
      const mockFetch: GuardedFetch = () =>
        Promise.resolve(
          makeGuardedResponse(
            200,
            `<!DOCTYPE html><html><head><meta name="plainsight-verify" content="ps_wrong_token"></head><body></body></html>`,
          ),
        );

      const result = await verifyMetaTag(rootUrl, expectedToken, mockFetch);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain(
        "Found meta tag 'plainsight-verify', but the token does not match",
      );
      expect(result.details?.foundToken).toBe('ps_wrong_token');
    });

    it('fails with clear error on HTTP 404', async () => {
      const mockFetch: GuardedFetch = () => Promise.resolve(makeGuardedResponse(404, 'Not found'));

      const result = await verifyMetaTag(rootUrl, expectedToken, mockFetch);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('HTTP 404');
    });
  });

  describe('File verification (verifyFile)', () => {
    it('succeeds when /.well-known/plainsight-verify.txt contains token', async () => {
      const mockFetch: GuardedFetch = (url) => {
        expect(String(url)).toBe('https://oakhaus.com/.well-known/plainsight-verify.txt');
        return Promise.resolve(makeGuardedResponse(200, expectedToken, String(url)));
      };

      const result = await verifyFile(rootUrl, expectedToken, mockFetch);
      expect(result.ok).toBe(true);
      expect(result.method).toBe('file');
    });

    it('succeeds when file has plainsight-verify=<token> format', async () => {
      const mockFetch: GuardedFetch = (url) =>
        Promise.resolve(
          makeGuardedResponse(200, `plainsight-verify = ${expectedToken}\n`, String(url)),
        );

      const result = await verifyFile(rootUrl, expectedToken, mockFetch);
      expect(result.ok).toBe(true);
    });

    it('fails when token in file does not match', async () => {
      const mockFetch: GuardedFetch = (url) =>
        Promise.resolve(makeGuardedResponse(200, 'ps_different_token', String(url)));

      const result = await verifyFile(rootUrl, expectedToken, mockFetch);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('token does not match');
    });

    it('fails when /.well-known/ file returns HTTP 404', async () => {
      const mockFetch: GuardedFetch = (url) =>
        Promise.resolve(makeGuardedResponse(404, '404 Not Found', String(url)));

      const result = await verifyFile(rootUrl, expectedToken, mockFetch);
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('HTTP 404');
    });
  });

  describe('DNS verification (verifyDns)', () => {
    it('succeeds when apex has matching TXT record', async () => {
      const mockLookup = (host: string): Promise<string[][]> => {
        if (host === 'oakhaus.com') {
          return Promise.resolve([['v=spf1 ~all'], [`plainsight-verify=${expectedToken}`]]);
        }
        return Promise.reject(new Error('NXDOMAIN'));
      };

      const result = await verifyDns(rootUrl, expectedToken, { lookupTxt: mockLookup });
      expect(result.ok).toBe(true);
      expect(result.method).toBe('dns');
    });

    it('succeeds when _plainsight.<host> has matching TXT record', async () => {
      const mockLookup = (host: string): Promise<string[][]> => {
        if (host === '_plainsight.oakhaus.com') {
          return Promise.resolve([[`plainsight-verify=${expectedToken}`]]);
        }
        return Promise.reject(new Error('NXDOMAIN'));
      };

      const result = await verifyDns(rootUrl, expectedToken, { lookupTxt: mockLookup });
      expect(result.ok).toBe(true);
    });

    it('fails with reason when TXT record has mismatched token', async () => {
      const mockLookup = (host: string): Promise<string[][]> => {
        if (host === 'oakhaus.com') {
          return Promise.resolve([['plainsight-verify=ps_mismatched']]);
        }
        return Promise.reject(new Error('NXDOMAIN'));
      };

      const result = await verifyDns(rootUrl, expectedToken, { lookupTxt: mockLookup });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('token does not match');
      expect(result.details?.foundToken).toBe('ps_mismatched');
    });

    it('succeeds when a stale token on the apex sits beside a matching _plainsight record', async () => {
      const mockLookup = (host: string): Promise<string[][]> => {
        if (host === 'oakhaus.com') return Promise.resolve([['plainsight-verify=ps_old']]);
        if (host === '_plainsight.oakhaus.com') {
          return Promise.resolve([[`plainsight-verify=${expectedToken}`]]);
        }
        return Promise.reject(new Error('NXDOMAIN'));
      };

      const result = await verifyDns(rootUrl, expectedToken, { lookupTxt: mockLookup });
      expect(result.ok).toBe(true);
    });

    it('succeeds when the stored TXT value kept pasted quotes', async () => {
      const mockLookup = (host: string): Promise<string[][]> =>
        host === 'oakhaus.com'
          ? Promise.resolve([[`"plainsight-verify=${expectedToken}"`]])
          : Promise.reject(new Error('NXDOMAIN'));

      const result = await verifyDns(rootUrl, expectedToken, { lookupTxt: mockLookup });
      expect(result.ok).toBe(true);
    });

    it('fails when no TXT record is found for host or subdomain', async () => {
      const mockLookup = (): Promise<string[][]> => Promise.reject(new Error('ENODATA'));

      const result = await verifyDns(rootUrl, expectedToken, { lookupTxt: mockLookup });
      expect(result.ok).toBe(false);
      expect(result.reason).toContain('No DNS TXT record matching');
    });
  });

  describe('Unified verifyOwnership dispatcher', () => {
    it('routes meta check properly', async () => {
      const mockFetch: GuardedFetch = () =>
        Promise.resolve(
          makeGuardedResponse(200, `<meta name="plainsight-verify" content="${expectedToken}">`),
        );

      const res = await verifyOwnership(rootUrl, expectedToken, 'meta', { fetcher: mockFetch });
      expect(res.ok).toBe(true);
      expect(res.method).toBe('meta');
    });
  });
});
