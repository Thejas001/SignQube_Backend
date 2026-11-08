'use strict';

/**
 * Reads the Bearer access token, verifies it and puts the live user on
 * `req.user`. The database is checked on every request so a deactivated
 * account stops working immediately rather than when its token expires.
 */

const authService = require('../services/authService');
const userRepository = require('../repositories/userRepository');
const { UnauthorizedError, ForbiddenError } = require('../utils/errors');
const asyncHandler = require('../utils/asyncHandler');

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    throw new UnauthorizedError('Send an access token in the Authorization header');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) throw new UnauthorizedError('Send an access token in the Authorization header');

  let payload;
  try {
    payload = authService.verifyAccessToken(token);
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    throw new UnauthorizedError(expired ? 'Access token has expired' : 'Access token is invalid');
  }

  const user = await userRepository.findById(payload.sub);
  if (!user) throw new UnauthorizedError('Account no longer exists');
  if (!user.isActive) throw new ForbiddenError('This account has been deactivated');

  req.user = user;
  next();
});

module.exports = authenticate;
