'use strict';

/**
 * Tiny JSON logger. Redacts anything that looks like a secret so passwords,
 * tokens and payment payloads never reach the log.
 */

const env = require('../config/env');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = env.isTest ? LEVELS.error : LEVELS.debug;

const REDACT_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'passwordhash',
  'password_hash',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'tokenhash',
  'token_hash',
  'authorization',
  'cookie',
  'secret',
  'signature',
  'razorpaysignature',
  'x-razorpay-signature',
  'keysecret',
  'payload',
  'card',
  'cvv',
]);

function redact(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (REDACT_KEYS.has(key.toLowerCase())) out[key] = '[REDACTED]';
    else out[key] = redact(val, depth + 1);
  }
  return out;
}

function emit(level, message, meta) {
  if (LEVELS[level] > threshold) return;
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta ? { meta: redact(meta) } : {}),
  };
  const text = JSON.stringify(line);
  if (level === 'error') process.stderr.write(`${text}\n`);
  else process.stdout.write(`${text}\n`);
}

module.exports = {
  error: (message, meta) => emit('error', message, meta),
  warn: (message, meta) => emit('warn', message, meta),
  info: (message, meta) => emit('info', message, meta),
  debug: (message, meta) => emit('debug', message, meta),
  redact,
};
