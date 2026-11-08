'use strict';

/**
 * Role guard. Sits on every non-public route. Ownership is checked again in the
 * service layer — this only narrows by role.
 *
 *   router.get('/jobs', authenticate, requireRole('DESIGNER'), ...)
 */

const { UnauthorizedError, ForbiddenError } = require('../utils/errors');

function requireRole(...roles) {
  const allowed = roles.flat();
  return function guard(req, res, next) {
    if (!req.user) return next(new UnauthorizedError('Authentication required'));
    if (!allowed.includes(req.user.role)) {
      return next(
        new ForbiddenError('Your account does not have access to this', {
          required: allowed,
          yours: req.user.role,
        }),
      );
    }
    return next();
  };
}

module.exports = requireRole;
