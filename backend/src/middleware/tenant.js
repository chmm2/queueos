/**
 * Tenant-isolation helpers. These are the single most important safety
 * layer in a multi-tenant system: without them, a Staff user at Org A could
 * read or mutate Org B's data just by guessing an id.
 *
 * Rule: req.orgId is set ONLY from the verified JWT (see middleware/auth.js).
 * It is never accepted from the request body or query. Every tenant-scoped
 * query filters by it, and every fetched resource is checked against it.
 */

// Guard that a route may only be used by a user who belongs to an org.
function requireOrg(req, res, next) {
  if (!req.orgId) {
    return res.status(403).json({ message: 'This action requires an organization account' });
  }
  next();
}

// Merge the caller's org into a Mongo filter so a query can never span tenants.
function scoped(req, filter = {}) {
  return { ...filter, organization: req.orgId };
}

/**
 * Assert a already-fetched document belongs to the caller's org. Returns
 * true if OK; if not, writes a 404 (we deliberately return "not found"
 * rather than "forbidden" so we don't leak that the id exists in another
 * tenant) and returns false.
 */
function assertSameOrg(req, res, doc) {
  if (!doc) {
    res.status(404).json({ message: 'Not found' });
    return false;
  }
  if (!doc.organization || doc.organization.toString() !== req.orgId) {
    res.status(404).json({ message: 'Not found' });
    return false;
  }
  return true;
}

module.exports = { requireOrg, scoped, assertSameOrg };
