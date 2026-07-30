const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Counter = require('../models/Counter');

/**
 * Authenticates either kind of principal:
 *
 *   'user'    an administrator                 -> req.user  (role 'Admin')
 *   'counter' a machine signed in as a counter -> req.counter, plus a
 *                                                 req.user-shaped principal
 *                                                 with role 'Counter' so the
 *                                                 authorize() guard is uniform
 *
 * Either way `req.orgId` is set from the VERIFIED token only — never from
 * anything the client sends — which is what keeps tenants isolated.
 */
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: 'Missing or malformed Authorization header' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.pt === 'counter') {
      const counter = await Counter.findById(decoded.id).select('-password').populate('room', 'name code departments');
      if (!counter || !counter.isActive) {
        return res.status(401).json({ message: 'Counter not found or disabled' });
      }
      if (typeof decoded.tv === 'number' && decoded.tv !== counter.tokenVersion) {
        return res.status(401).json({ message: 'Session expired, please sign in again' });
      }
      req.counter = counter;
      // A uniform principal so authorize() and route code don't need to care.
      req.user = {
        _id: counter._id,
        role: 'Counter',
        name: counter.name,
        email: counter.email,
        organization: counter.organization,
        branch: counter.branch,
      };
      req.orgId = counter.organization.toString();
      return next();
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'Account not found or disabled' });
    }
    if (typeof decoded.tv === 'number' && decoded.tv !== user.tokenVersion) {
      return res.status(401).json({ message: 'Session expired, please log in again' });
    }

    req.user = user;
    req.orgId = user.organization ? user.organization.toString() : null;
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

/**
 * Role guard. Usage: authorize('Admin') or authorize('Counter').
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Not permitted for a ${req.user.role.toLowerCase()} account`,
      });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
