import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { requireAuth } from '../../src/middleware/auth.js';
import type { Auth } from '../../src/lib/auth.js';

/** Sessions end after 30 idle minutes; activity slides the expiry, background polls do not. */
describe('idle session timeout', () => {
  function build() {
    const getSession = vi.fn().mockResolvedValue({
      headers: new Headers({ 'set-cookie': 'better-auth.session_token=refreshed; Max-Age=1800' }),
      response: { user: { id: 'user-1' }, session: { id: 'session-1' } },
    });
    const app = express();
    app.get('/thing', requireAuth({ api: { getSession } } as unknown as Auth), (_req, res) => {
      res.json({ ok: true });
    });
    return { app, getSession };
  }

  it('forwards the refreshed session cookie so activity extends the session', async () => {
    const { app, getSession } = build();
    const res = await request(app).get('/thing').expect(200);
    expect(res.headers['set-cookie']).toEqual([
      'better-auth.session_token=refreshed; Max-Age=1800',
    ]);
    expect(getSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableRefresh: false }, returnHeaders: true }),
    );
  });

  it('does not refresh the session for background polls', async () => {
    const { app, getSession } = build();
    await request(app).get('/thing').set('X-Background-Request', '1').expect(200);
    expect(getSession).toHaveBeenCalledWith(
      expect.objectContaining({ query: { disableRefresh: true } }),
    );
  });

  it('answers 401 once the session has expired', async () => {
    const getSession = vi.fn().mockResolvedValue({ headers: new Headers(), response: null });
    const app = express();
    app.get('/thing', requireAuth({ api: { getSession } } as unknown as Auth), (_req, res) => {
      res.json({ ok: true });
    });
    await request(app).get('/thing').expect(401);
  });
});
