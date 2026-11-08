'use strict';

/**
 * Rate limiters. Auth and upload routes are limited; the limiters are disabled
 * under NODE_ENV=test so the integration suite is not throttled.
 */

const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { fail } = require('../utils/apiResponse');

function build({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (req, res) =>
      fail(res, { statusCode: 429, code: 'TOO_MANY_REQUESTS', message, details: null }),
  });
}

/** 20 requests per 15 minutes, as specified for the auth routes. */
const authLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

/** Uploads are expensive — 30 per 15 minutes per IP. */
const uploadLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many uploads. Please wait a few minutes and try again.',
});

/** A wide net over the rest of the API. */
const apiLimiter = build({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: 'Too many requests. Please slow down.',
});

module.exports = { authLimiter, uploadLimiter, apiLimiter };
