const { scoped, assertSameOrg } = require('../../src/middleware/tenant');
const { terminologyFor } = require('../../src/config/terminology');

/**
 * Tenant isolation is the core multi-tenant guarantee. These pin the helpers
 * that every route relies on.
 */
describe('tenant isolation helpers', () => {
  test('scoped() injects the caller org into any filter', () => {
    const req = { orgId: 'org1' };
    expect(scoped(req, { status: 'waiting' })).toEqual({ status: 'waiting', organization: 'org1' });
  });

  test('assertSameOrg rejects a cross-tenant document as 404 (no existence leak)', () => {
    const req = { orgId: 'org1' };
    let code = null;
    const res = { status: (c) => { code = c; return res; }, json: () => res };
    const ok = assertSameOrg(req, res, { organization: { toString: () => 'org2' } });
    expect(ok).toBe(false);
    expect(code).toBe(404); // deliberately 404, not 403
  });

  test('assertSameOrg accepts a same-tenant document', () => {
    const req = { orgId: 'org1' };
    const res = { status: () => res, json: () => res };
    expect(assertSameOrg(req, res, { organization: { toString: () => 'org1' } })).toBe(true);
  });

  test('a missing document is a 404', () => {
    const req = { orgId: 'org1' };
    let code = null;
    const res = { status: (c) => { code = c; return res; }, json: () => res };
    expect(assertSameOrg(req, res, null)).toBe(false);
    expect(code).toBe(404);
  });
});

describe('industry-adaptive terminology', () => {
  // Structural names (Branch / Department / Room / Counter) are deliberately
  // fixed. Only what an org calls the person in the queue varies.
  test('a hospital calls them Patients, a restaurant Guests', () => {
    expect(terminologyFor('hospital').customer).toBe('Patient');
    expect(terminologyFor('restaurant').customer).toBe('Guest');
    expect(terminologyFor('restaurant').token).toBe('Order');
  });

  test('an unknown industry falls back to neutral words', () => {
    const t = terminologyFor('spaceport');
    expect(t.customer).toBe('Customer');
    expect(t.token).toBe('Token');
  });
});
