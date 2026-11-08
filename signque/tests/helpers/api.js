'use strict';

/** Supertest helpers: the app under test, and signing in as a seeded role. */

const request = require('supertest');
const crypto = require('crypto');

const app = require('../../src/app');
const env = require('../../src/config/env');
const authService = require('../../src/services/authService');
const db = require('./db');

const api = () => request(app);

/**
 * Create a user and return an Authorization header for them.
 * @returns {Promise<{ user: object, token: string, auth: [string, string] }>}
 */
async function signedInUser(overrides = {}) {
  const user = await db.createUser(overrides);
  const token = authService.signAccessToken(user);
  return { user, token, auth: ['Authorization', `Bearer ${token}`] };
}

/** Header tuple for an existing user row. */
function authFor(user) {
  return ['Authorization', `Bearer ${authService.signAccessToken(user)}`];
}

/**
 * A Razorpay webhook request with a genuine HMAC-SHA256 signature over the raw
 * body, computed with the test webhook secret.
 */
function postWebhook({ body, eventId, secret = env.RAZORPAY_WEBHOOK_SECRET, signature }) {
  // Send the exact JSON text, not a Buffer: superagent re-serializes a Buffer
  // for an application/json request, which would change the bytes the
  // signature was computed over.
  const raw = JSON.stringify(body);
  const sig =
    signature !== undefined
      ? signature
      : crypto.createHmac('sha256', secret).update(Buffer.from(raw, 'utf8')).digest('hex');

  const req = api()
    .post('/api/payments/razorpay/webhook')
    .set('Content-Type', 'application/json')
    .set('x-razorpay-signature', sig);

  if (eventId) req.set('x-razorpay-event-id', eventId);

  return req.send(raw);
}

// ----------------------------------------------------- webhook payload shapes

function paymentCapturedBody({ razorpayOrderId, razorpayPaymentId, amountPaise }) {
  return {
    event: 'payment.captured',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: razorpayPaymentId,
          order_id: razorpayOrderId,
          amount: amountPaise,
          currency: 'INR',
          status: 'captured',
          method: 'upi',
        },
      },
    },
  };
}

function paymentFailedBody({ razorpayOrderId, razorpayPaymentId, reason = 'Insufficient funds' }) {
  return {
    event: 'payment.failed',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      payment: {
        entity: {
          id: razorpayPaymentId,
          order_id: razorpayOrderId,
          status: 'failed',
          error_description: reason,
        },
      },
    },
  };
}

function refundProcessedBody({ razorpayPaymentId, refundId, amountPaise }) {
  return {
    event: 'refund.processed',
    created_at: Math.floor(Date.now() / 1000),
    payload: {
      refund: {
        entity: { id: refundId, payment_id: razorpayPaymentId, amount: amountPaise, status: 'processed' },
      },
    },
  };
}

/** Unwrap the API envelope, failing loudly when the call did not succeed. */
function data(res) {
  if (!res.body || res.body.success !== true) {
    throw new Error(
      `Expected a successful response, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }
  return res.body.data;
}

module.exports = {
  app,
  api,
  signedInUser,
  authFor,
  postWebhook,
  paymentCapturedBody,
  paymentFailedBody,
  refundProcessedBody,
  data,
};
