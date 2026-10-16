import { describe, expectTypeOf, it } from 'vitest';
import type { Database } from '../../src/db/client.js';
import { asOrgId, type OrgId } from '../../src/db/repositories/index.js';
import { membershipsRepository } from '../../src/db/repositories/memberships.js';

declare const db: Database;
const repo = membershipsRepository(db);

describe('tenant repositories require an org scope', () => {
  it('accepts an OrgId', () => {
    expectTypeOf(repo.list).parameter(0).toEqualTypeOf<OrgId>();
    void repo.list(asOrgId('0199e6a0-0000-7000-8000-000000000000'));
  });

  it('rejects a call without orgId or with a raw string', () => {
    // @ts-expect-error orgId is required
    void repo.list();
    // @ts-expect-error a plain string is not an authorised OrgId
    void repo.list('0199e6a0-0000-7000-8000-000000000000');
  });
});
