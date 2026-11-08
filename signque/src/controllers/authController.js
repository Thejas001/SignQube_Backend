'use strict';

const env = require('../config/env');
const authService = require('../services/authService');
const { ok, created } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const REFRESH_COOKIE = 'signque_refresh';

/** Refresh tokens live in an httpOnly cookie, never in JS-readable storage. */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: env.isProduction ? 'strict' : 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
}

function readRefreshToken(req) {
  return req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken || null;
}

const register = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.register(req.body);
  setRefreshCookie(res, refreshToken);
  return created(res, { user, accessToken }, 'Account created');
});

const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body);
  setRefreshCookie(res, refreshToken);
  return ok(res, { user, accessToken }, 'Signed in');
});

const refresh = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.refresh(readRefreshToken(req));
  setRefreshCookie(res, refreshToken);
  return ok(res, { user, accessToken }, 'Session refreshed');
});

const logout = asyncHandler(async (req, res) => {
  const result = await authService.logout(readRefreshToken(req));
  clearRefreshCookie(res);
  return ok(res, result, 'Signed out');
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.me(req.user.id);
  return ok(res, { user }, 'OK');
});

module.exports = { REFRESH_COOKIE, register, login, refresh, logout, me };
