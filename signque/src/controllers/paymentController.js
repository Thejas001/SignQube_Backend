'use strict';

/**
 * The Razorpay webhook. Mounted BEFORE express.json() with a raw body parser,
 * because the signature is computed over the exact bytes Razorpay sent.
 */

const razorpayClient = require('../integrations/razorpayClient');
const paymentService = require('../services/paymentService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const { UnauthorizedError, BadRequestError } = require('../utils/errors');

const webhook = asyncHandler(async (req, res) => {
  const signature = req.get('x-razorpay-signature');
  const rawBody = req.body; // a Buffer, from express.raw()

  if (!Buffer.isBuffer(rawBody)) {
    throw new BadRequestError('Webhook body must be raw');
  }

  if (!razorpayClient.verifyWebhookSignature(rawBody, signature)) {
    logger.warn('webhook signature rejected', { bytes: rawBody.length });
    throw new UnauthorizedError('Webhook signature could not be verified');
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    throw new BadRequestError('Webhook body is not valid JSON');
  }

  // Razorpay sends the event id in a header; fall back to a deterministic key
  // built from the payload so the unique constraint still deduplicates.
  const eventId =
    req.get('x-razorpay-event-id') ||
    `${body.event}:${body?.payload?.payment?.entity?.id || body?.payload?.order?.entity?.id || body?.payload?.refund?.entity?.id || body.created_at}`;

  const result = await paymentService.handleWebhook({ eventId, body });

  // Always 200 — a non-2xx makes Razorpay retry, and a duplicate or unhandled
  // event is not a failure on our side.
  return ok(res, result, result.duplicate ? 'Event already processed' : 'OK');
});

module.exports = { webhook };
