import type express from 'express';
import request from 'supertest';
import { expect } from 'vitest';
import { ErrorCode } from '../../src/shared/errors.js';

export interface CrossOrgCheckOptions {
  method: 'get' | 'post' | 'patch' | 'put' | 'delete';
  path: string;
  sessionCookie?: string;
  body?: Record<string, unknown>;
}

/**
 * Cross-org 404 verification helper.
 *
 * SPEC REQUIREMENT (Section 7):
 * "All org-scoped routes are under `/orgs/:orgId/…`; the API checks membership and role
 * on every request. A resource in another org returns 404, never 403."
 *
 * This reusable helper verifies that when a user authenticated in Org B attempts to
 * access an endpoint or resource belonging to Org A, the server responds with 404 (NOT_FOUND)
 * and never with 403 (FORBIDDEN).
 */
export async function assertCrossOrg404(
  app: express.Express,
  options: CrossOrgCheckOptions,
): Promise<void> {
  const req = request(app)[options.method](options.path);

  if (options.sessionCookie) {
    req.set('Cookie', options.sessionCookie);
  }
  if (options.body) {
    req.send(options.body);
  }

  const res = await req;
  expect(res.status).toBe(404);
  expect(res.body.error).toBeDefined();
  expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
}
