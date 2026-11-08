'use strict';

/**
 * Zod-validated environment. Loaded once at boot by server.js; if anything is
 * missing or invalid the process exits with a readable message.
 */

const path = require('path');
const { z } = require('zod');

const envFile = process.env.NODE_ENV === 'test' ? '.env.test' : '.env';

// `override: true` matters: importing @prisma/client loads the root .env by
// itself, and plain dotenv.config() will not replace a variable that is
// already set — which would silently point the test run at the dev database.
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', envFile), override: true });

const durationRe = /^\d+(ms|s|m|h|d)$/;

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 characters'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().regex(durationRe, 'JWT_ACCESS_TTL must look like 15m').default('15m'),
  JWT_REFRESH_TTL: z.string().regex(durationRe, 'JWT_REFRESH_TTL must look like 7d').default('7d'),

  CORS_ORIGINS: z.string().min(1).default('http://localhost:5173'),

  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().min(1),
  AWS_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),

  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),

  SHIPPING_FEE: z.coerce.number().nonnegative().default(99),
  MAX_FREE_REVISIONS: z.coerce.number().int().nonnegative().default(3),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  MAIL_FROM: z.string().min(1),

  APP_BASE_URL: z.string().url(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  // eslint-disable-next-line no-console
  console.error(`\nInvalid environment configuration:\n${lines.join('\n')}\n\nCopy .env.example to .env and fill in the values.\n`);
  process.exit(1);
}

const env = Object.freeze({
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
});

module.exports = env;
