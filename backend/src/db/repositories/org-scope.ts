declare const orgIdBrand: unique symbol;

/**
 * An organisation ID that has passed an authorization check. Tenant repository
 * functions take this as their first argument, so a query without an org scope
 * does not compile, and a raw string from a request cannot be passed by accident.
 *
 * Only `requireOrgRole` (Phase 2) and trusted system code (seed, jobs) should
 * call `asOrgId`.
 */
export type OrgId = string & { readonly [orgIdBrand]: true };

export const asOrgId = (id: string): OrgId => id as OrgId;
