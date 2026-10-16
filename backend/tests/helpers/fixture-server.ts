import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { GuardPolicy } from '../../src/scanner/net/guard.js';

export type Route =
  | string
  | { status?: number; headers?: Record<string, string>; body?: string | Buffer }
  | ((req: IncomingMessage, res: ServerResponse) => void);

export interface FixtureServer {
  port: number;
  /** Base URL using the fake hostname `site.test`, which the test policy resolves to 127.0.0.1. */
  url: string;
  requests: { path: string; host: string | undefined; userAgent: string | undefined; at: number }[];
  close(): Promise<void>;
}

export async function startFixtureServer(routes: Record<string, Route>): Promise<FixtureServer> {
  const requests: FixtureServer['requests'] = [];
  const server: Server = createServer((req, res) => {
    const path = req.url ?? '/';
    requests.push({
      path,
      host: req.headers.host,
      userAgent: req.headers['user-agent'],
      at: Date.now(),
    });
    const route = routes[path];
    if (route === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
    } else if (typeof route === 'function') {
      route(req, res);
    } else if (typeof route === 'string') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(route);
    } else {
      res.writeHead(route.status ?? 200, {
        'content-type': 'text/html; charset=utf-8',
        ...route.headers,
      });
      res.end(route.body ?? '');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    port,
    url: `http://site.test:${port}`,
    requests,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

/**
 * Lets the guard reach the fixture server and nothing else private: `site.test`
 * → 127.0.0.1 on the fixture port; `private.test` → 10.0.0.5 (must be blocked).
 */
export function fixturePolicy(port: number, extra: Record<string, string[]> = {}): GuardPolicy {
  const hosts: Record<string, string[]> = {
    'site.test': ['127.0.0.1'],
    'www.site.test': ['127.0.0.1'],
    'private.test': ['10.0.0.5'],
    ...extra,
  };
  return {
    allowedPorts: [port],
    isAllowedAddress: (address) => address === '127.0.0.1',
    resolve: (hostname) => {
      const addresses = hosts[hostname];
      return addresses
        ? Promise.resolve(addresses)
        : Promise.reject(new Error(`ENOTFOUND ${hostname}`));
    },
  };
}

export const html = (body: string, head = '') =>
  `<!doctype html><html><head><title>Fixture</title>${head}</head><body>${body}</body></html>`;
