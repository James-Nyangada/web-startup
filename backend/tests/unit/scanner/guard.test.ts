import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertPublicUrl,
  BlockedUrlError,
  strictPolicy,
  type GuardPolicy,
} from '../../../src/scanner/net/guard.js';
import { createGuardedFetch } from '../../../src/scanner/net/guarded-fetch.js';
import { isBlockedAddress } from '../../../src/scanner/net/ip-ranges.js';
import {
  fixturePolicy,
  startFixtureServer,
  type FixtureServer,
} from '../../helpers/fixture-server.js';

describe('isBlockedAddress', () => {
  it.each([
    ['0.0.0.0', '0.0.0.0/8'],
    ['0.255.1.1', '0.0.0.0/8'],
    ['10.0.0.1', '10.0.0.0/8'],
    ['10.255.255.255', '10.0.0.0/8'],
    ['100.64.0.1', '100.64.0.0/10 (CGNAT)'],
    ['100.127.255.254', '100.64.0.0/10'],
    ['127.0.0.1', 'loopback'],
    ['127.255.0.9', 'loopback'],
    ['169.254.169.254', 'cloud metadata'],
    ['169.254.0.1', 'link-local'],
    ['172.16.0.1', '172.16.0.0/12'],
    ['172.31.255.255', '172.16.0.0/12'],
    ['192.0.0.8', '192.0.0.0/24'],
    ['192.168.1.1', '192.168.0.0/16'],
    ['198.18.0.1', '198.18.0.0/15'],
    ['198.19.255.255', '198.18.0.0/15'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.250', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['255.255.255.255', 'broadcast'],
    ['::', 'unspecified'],
    ['::1', 'IPv6 loopback'],
    ['fc00::1', 'unique local'],
    ['fd12:3456::1', 'unique local'],
    ['fe80::1', 'IPv6 link-local'],
    ['febf::1', 'IPv6 link-local'],
    ['ff02::1', 'IPv6 multicast'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:10.0.0.1', 'IPv4-mapped private'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
    ['::ffff:7f00:1', 'IPv4-mapped loopback, hex form'],
    ['not-an-ip', 'invalid'],
  ])('blocks %s (%s)', (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '172.32.0.1',
    '100.128.0.1',
    '11.0.0.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8',
  ])('allows public %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });
});

const resolverPolicy = (records: Record<string, string[]>): GuardPolicy => ({
  ...strictPolicy,
  resolve: (hostname) =>
    records[hostname] ? Promise.resolve(records[hostname]) : Promise.reject(new Error('ENOTFOUND')),
});

describe('assertPublicUrl', () => {
  const policy = resolverPolicy({
    'public.example': ['93.184.216.34'],
    'internal.example': ['10.1.2.3'],
    'mixed.example': ['93.184.216.34', '192.168.0.10'],
    'v6.example': ['2606:4700:4700::1111'],
    'v6-private.example': ['fd00::1'],
    'metadata.example': ['169.254.169.254'],
  });

  it('allows a public host and returns its addresses for pinning', async () => {
    const target = await assertPublicUrl('https://public.example/a', policy);
    expect(target.addresses).toEqual(['93.184.216.34']);
    await expect(assertPublicUrl('https://v6.example/', policy)).resolves.toBeDefined();
  });

  it.each([
    ['http://127.0.0.1/', 'loopback literal'],
    ['http://2130706433/', 'decimal 127.0.0.1'],
    ['http://0x7f000001/', 'hex 127.0.0.1'],
    ['http://0177.0.0.1/', 'octal 127.0.0.1'],
    ['http://017700000001/', 'octal integer 127.0.0.1'],
    ['http://127.1/', 'short form'],
    ['http://0/', 'zero'],
    ['http://[::1]/', 'IPv6 loopback'],
    ['http://[::ffff:127.0.0.1]/', 'IPv4-mapped IPv6'],
    ['http://[::ffff:a9fe:a9fe]/', 'IPv4-mapped metadata, hex'],
    ['http://169.254.169.254/latest/meta-data/', 'metadata endpoint'],
    ['http://localhost/', 'localhost'],
    ['http://LOCALHOST./', 'localhost, trailing dot'],
    ['http://app.localhost/', '*.localhost'],
    ['http://internal.example/', 'DNS → private'],
    ['http://mixed.example/', 'DNS → mixed public + private'],
    ['http://v6-private.example/', 'DNS → IPv6 unique local'],
    ['http://metadata.example/', 'DNS → metadata'],
    ['http://unknown.example/', 'unresolvable'],
    ['https://public.example:8443/', 'non-standard port'],
    ['http://public.example:22/', 'SSH port'],
    ['ftp://public.example/', 'ftp scheme'],
    ['file:///etc/passwd', 'file scheme'],
    ['gopher://public.example/', 'gopher scheme'],
    ['http://user:pw@public.example/', 'credentials'],
    ['not a url', 'garbage'],
  ])('blocks %s (%s)', async (url) => {
    await expect(assertPublicUrl(url, policy)).rejects.toBeInstanceOf(BlockedUrlError);
  });
});

describe('createGuardedFetch', () => {
  let server: FixtureServer;

  beforeAll(async () => {
    server = await startFixtureServer({
      '/': '<p>home</p>',
      '/to-private-host': { status: 302, headers: { location: 'http://private.test/' } },
      '/to-private-ip': { status: 301, headers: { location: 'http://10.0.0.1/' } },
      '/to-metadata': { status: 307, headers: { location: 'http://169.254.169.254/latest/' } },
      '/to-localhost': { status: 302, headers: { location: 'http://localhost/' } },
      '/loop': { status: 302, headers: { location: '/loop' } },
      '/hop1': { status: 302, headers: { location: '/hop2' } },
      '/hop2': { status: 301, headers: { location: '/' } },
      '/big': { body: 'x'.repeat(5_000) },
    });
  });
  afterAll(() => server.close());

  const guardedFetch = (maxBytes?: number) =>
    createGuardedFetch({ userAgent: 'TestBot/1.0', policy: fixturePolicy(server.port), maxBytes });

  it('fetches through the pinned address and sends our user agent', async () => {
    const response = await guardedFetch()(`${server.url}/`);
    expect(response.status).toBe(200);
    expect(response.text()).toContain('home');
    const last = server.requests.at(-1)!;
    expect(last.host).toBe(`site.test:${server.port}`);
    expect(last.userAgent).toBe('TestBot/1.0');
  });

  it('follows safe redirects and records them', async () => {
    const response = await guardedFetch()(`${server.url}/hop1`);
    expect(response.url).toBe(`${server.url}/`);
    expect(response.redirects).toHaveLength(2);
  });

  it.each(['/to-private-host', '/to-private-ip', '/to-metadata', '/to-localhost'])(
    'refuses a redirect to an internal address (%s)',
    async (path) => {
      await expect(guardedFetch()(`${server.url}${path}`)).rejects.toBeInstanceOf(BlockedUrlError);
    },
  );

  it('stops after 5 redirects', async () => {
    await expect(guardedFetch()(`${server.url}/loop`)).rejects.toThrow(/more than 5 redirects/);
  });

  it('caps the body size', async () => {
    const response = await guardedFetch(1_000)(`${server.url}/big`);
    expect(response.truncated).toBe(true);
    expect(response.body.length).toBe(1_000);
  });

  it('refuses the fixture port under the strict policy', async () => {
    const strictFetch = createGuardedFetch({ userAgent: 'TestBot/1.0' });
    await expect(strictFetch(`http://127.0.0.1:${server.port}/`)).rejects.toBeInstanceOf(
      BlockedUrlError,
    );
  });
});
