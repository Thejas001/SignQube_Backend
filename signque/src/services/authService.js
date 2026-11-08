'use strict';

/**
 * Auth: register, login, refresh (with rotation), logout, me.
 *
 * Access tokens are short-lived JWTs sent in the Authorization header. Refresh
 * tokens are opaque random strings — only their SHA-256 hash is stored — and
 * every refresh rotates them, revoking the one just used.
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const env = require('../config/env');
const userRepository = require('../repositories/userRepository');
const { prisma } = require('../repositories/prisma');
const { ROLES } = require('../config/constants');
const {
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} = require('../utils/errors');
const logger = require('../utils/logger');

const BCRYPT_ROUNDS = 12;

function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL },
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

/** Opaque refresh token; the JWT signature binds it to this deployment. */
function createRefreshTokenValue(user) {
  const nonce = crypto.randomBytes(48).toString('base64url');
  return jwt.sign({ sub: user.id, jti: nonce }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL,
  });
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshExpiryDate(token) {
  const decoded = jwt.decode(token);
  return new Date(decoded.exp * 1000);
}

async function issueTokens(user, tx) {
  const accessToken = signAccessToken(user);
  const refreshToken = createRefreshTokenValue(user);
  await userRepository.createRefreshToken(
    { userId: user.id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiryDate(refreshToken) },
    tx,
  );
  return { accessToken, refreshToken };
}

/** Public registration always creates a CUSTOMER — role is never taken from the body. */
async function register({ name, email, phone, password }) {
  const existing = await userRepository.findByEmail(email);
  if (existing) throw new ConflictError('An account with that email already exists');

  const user = await userRepository.create({
    name,
    email,
    phone: phone || null,
    passwordHash: await hashPassword(password),
    role: ROLES.CUSTOMER,
  });

  const tokens = await issueTokens(user);
  logger.info('user registered', { userId: user.id, role: user.role });
  return { user, ...tokens };
}

async function login({ email, password }) {
  const record = await userRepository.findByEmailWithPassword(email);
  // Same message either way, so the response cannot be used to probe for emails.
  if (!record) throw new UnauthorizedError('Email or password is incorrect');

  const matches = await verifyPassword(password, record.passwordHash);
  if (!matches) throw new UnauthorizedError('Email or password is incorrect');
  if (!record.isActive) throw new ForbiddenError('This account has been deactivated');

  const { passwordHash, ...user } = record;
  const tokens = await issueTokens(user);
  logger.info('user logged in', { userId: user.id, role: user.role });
  return { user, ...tokens };
}

/**
 * Rotate: the presented token is revoked and a new pair issued, in one
 * transaction. A token already revoked is a reuse attempt — every token for
 * that user is then revoked.
 */
async function refresh(presentedToken) {
  if (!presentedToken) throw new UnauthorizedError('No refresh token');

  try {
    jwt.verify(presentedToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw new UnauthorizedError('Refresh token is invalid or has expired');
  }

  const tokenHash = hashToken(presentedToken);

  // The reuse check runs OUTSIDE the transaction below: it has to survive the
  // throw, and anything done inside a transaction that then throws is rolled
  // back — which would quietly undo the revocation.
  const stored = await userRepository.findRefreshToken(tokenHash);
  if (!stored) throw new UnauthorizedError('Refresh token is invalid or has expired');

  if (stored.revokedAt) {
    // Replay of a rotated token: assume it leaked and cut the user off.
    await userRepository.revokeAllForUser(stored.userId);
    logger.warn('refresh token reuse detected', { userId: stored.userId });
    throw new UnauthorizedError('Refresh token has already been used');
  }
  if (stored.expiresAt <= new Date()) {
    throw new UnauthorizedError('Refresh token is invalid or has expired');
  }
  if (!stored.user.isActive) throw new ForbiddenError('This account has been deactivated');

  // Revoke-and-issue together, so a token is never consumed without a
  // replacement being written. The conditional revoke is the race guard: two
  // simultaneous refreshes with the same token, and only one gets count > 0.
  return prisma.$transaction(async (tx) => {
    const revoked = await userRepository.revokeRefreshToken(tokenHash, tx);
    if (revoked.count === 0) throw new UnauthorizedError('Refresh token has already been used');

    const tokens = await issueTokens(stored.user, tx);
    return { user: stored.user, ...tokens };
  });
}

async function logout(presentedToken) {
  if (!presentedToken) return { revoked: 0 };
  const result = await userRepository.revokeRefreshToken(hashToken(presentedToken));
  return { revoked: result.count };
}

async function me(userId) {
  const user = await userRepository.findById(userId);
  if (!user) throw new NotFoundError('User not found');
  return user;
}

module.exports = {
  BCRYPT_ROUNDS,
  hashPassword,
  verifyPassword,
  signAccessToken,
  verifyAccessToken,
  hashToken,
  register,
  login,
  refresh,
  logout,
  me,
};
