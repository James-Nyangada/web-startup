import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/fakes.js';

describe('Public Plans API (Chunk P3-02, Screen S-02, Section 7.10)', () => {
  it('returns list of public plans at GET /public/plans and GET /v1/public/plans', async () => {
    const { app } = buildTestApp();

    const res1 = await request(app).get('/public/plans').expect(200);
    expect(res1.body.data.plans).toHaveLength(4);
    expect(res1.body.data.plans.map((p: { id: string }) => p.id)).toEqual([
      'store',
      'growth',
      'agency',
      'agency_pro',
    ]);

    const res2 = await request(app).get('/v1/public/plans').expect(200);
    expect(res2.body.data.plans).toEqual(res1.body.data.plans);

    // Verify properties of Store and Agency
    const store = res1.body.data.plans.find((p: { id: string }) => p.id === 'store');
    expect(store.priceMonthly).toBe(29);
    expect(store.priceAnnual).toBe(290);
    expect(store.maxSites).toBe(1);

    const agency = res1.body.data.plans.find((p: { id: string }) => p.id === 'agency');
    expect(agency.priceMonthly).toBe(199);
    expect(agency.priceAnnual).toBe(1990);
    expect(agency.maxSites).toBe(25);
    expect(agency.features.whiteLabel).toBe(true);
  });
});
