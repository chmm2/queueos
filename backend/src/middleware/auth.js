const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Stateless auth for staff/operator/admin. The JWT payload (id, role,
 * organization, branch) is trusted once verified. We still fetch the user
 * to confirm the account is active and its tokenVersion still matches —
 * that's what lets an admin revoke access before the token expires.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ message: 'Missing or malformed Authorization header' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Account not found or disabled' });
    }
    // Revocation check: a token minted before a password change / forced
    // logout carries a stale version and is rejected.
    if (typeof decoded.tv === 'number' && decoded.tv !== user.tokenVersion) {
      return res.status(401).json({ message: 'Session expired, please log in again' });
    }

    req.user = user;
    // The tenant every downstream query must be scoped to. NEVER read the
    // org from the request body — only from the verified token.
    req.orgId = user.organization ? user.organization.toString() : null;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * RBAC guard. Usage: authorize('Admin', 'Operator')
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Role '${req.user.role}' is not permitted to perform this action`,
      });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
