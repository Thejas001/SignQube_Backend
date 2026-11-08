'use strict';

/**
 * Jest setup. Runs before every test file.
 *
 * The external services are mocked here, globally: nothing in the suite talks
 * to AWS, Razorpay or an SMTP server. Everything else — Express, Prisma,
 * Postgres — is real, so the tests exercise the actual transactions,
 * constraints and conditional updates.
 */

process.env.NODE_ENV = 'test';

// ----------------------------------------------------------------------- S3
jest.mock('../src/integrations/s3Client', () => {
  const crypto = require('crypto');
  const path = require('path');
  const store = new Map();

  return {
    __store: store,
    buildPhotoKey: (userId, originalName) =>
      `photos/${userId}/${crypto.randomUUID()}${path.extname(originalName || '') || '.jpg'}`,
    buildDesignKey: (orderId, versionNo, originalName) =>
      `designs/${orderId}/v${versionNo}-${crypto.randomUUID()}${path.extname(originalName || '') || '.png'}`,
    putObject: jest.fn(async ({ key, body, contentType }) => {
      store.set(key, { body, contentType });
      return { key };
    }),
    getPresignedUrl: jest.fn(async (key) =>
      key ? `https://s3.test.local/${key}?X-Amz-Signature=test` : null,
    ),
    deleteObject: jest.fn(async (key) => {
      store.delete(key);
    }),
    client: {},
  };
});

// ----------------------------------------------------------------- Razorpay
// createOrder and refund are faked; the signature helpers are the REAL crypto,
// so the webhook signature test computes a genuine HMAC with the test secret.
jest.mock('../src/integrations/razorpayClient', () => {
  const actual = jest.requireActual('../src/integrations/razorpayClient');
  let counter = 0;

  return {
    ...actual,
    instance: {},
    createOrder: jest.fn(async ({ amountPaise, receipt }) => {
      counter += 1;
      return {
        id: `order_test_${counter}_${Date.now()}`,
        amount: amountPaise,
        currency: 'INR',
        receipt,
        status: 'created',
      };
    }),
    refund: jest.fn(async ({ razorpayPaymentId, amountPaise }) => ({
      id: `rfnd_test_${Date.now()}`,
      payment_id: razorpayPaymentId,
      amount: amountPaise,
      status: 'processed',
    })),
  };
});

// --------------------------------------------------------------------- mail
jest.mock('../src/integrations/mailClient', () => ({
  sendOrderMail: jest.fn(async () => ({ messageId: 'test' })),
  getTransporter: jest.fn(() => ({})),
}));

// ---------------------------------------------------------------------- sms
jest.mock('../src/integrations/smsClient', () => ({
  send: jest.fn(async () => ({ providerId: 'test', stub: true })),
}));

jest.setTimeout(30000);
