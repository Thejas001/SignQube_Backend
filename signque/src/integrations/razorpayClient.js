'use strict';

/**
 * Razorpay: order creation, HMAC verification and refunds.
 *
 * Signature verification is pure crypto with no network call, so the webhook
 * and the verify-payment endpoint can both be tested with a real HMAC.
 */

const crypto = require('crypto');
const Razorpay = require('razorpay');

const env = require('../config/env');
const logger = require('../utils/logger');

const instance = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

/**
 * @param {{ amountPaise: number, receipt: string, notes?: object }} args
 * @returns {Promise<{ id: string, amount: number, currency: string }>}
 */
async function createOrder({ amountPaise, receipt, notes = {} }) {
  const order = await instance.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    payment_capture: 1,
    notes,
  });
  logger.info('razorpay order created', { razorpayOrderId: order.id, receipt });
  return order;
}

/**
 * Checkout callback signature: HMAC-SHA256 of "<order_id>|<payment_id>" with
 * the key secret.
 */
function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  return timingSafeEqual(expected, razorpaySignature);
}

/**
 * Webhook signature: HMAC-SHA256 of the RAW request body with the webhook
 * secret. The raw body matters — re-serialised JSON will not match.
 *
 * @param {Buffer|string} rawBody
 * @param {string} signature value of the x-razorpay-signature header
 */
function verifyWebhookSignature(rawBody, signature) {
  if (!rawBody || !signature) return false;
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8'))
    .digest('hex');
  return timingSafeEqual(expected, signature);
}

function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Full or partial refund.
 *
 * @param {{ razorpayPaymentId: string, amountPaise?: number, notes?: object }} args
 * @returns {Promise<{ id: string, status: string }>}
 */
async function refund({ razorpayPaymentId, amountPaise, notes = {} }) {
  const payload = { speed: 'normal', notes };
  if (amountPaise != null) payload.amount = amountPaise;
  const result = await instance.payments.refund(razorpayPaymentId, payload);
  logger.info('razorpay refund created', { refundId: result.id, status: result.status });
  return result;
}

module.exports = {
  instance,
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  refund,
  keyId: env.RAZORPAY_KEY_ID,
};
