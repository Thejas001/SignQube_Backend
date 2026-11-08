'use strict';

/**
 * Razorpay: creating the checkout order, the fast client-side verification, the
 * webhook (the source of truth) and refunds.
 *
 * The webhook is idempotent two ways: the razorpayEventId unique constraint
 * makes a redelivered event a no-op, and every payment status change is a
 * guarded update that refuses to move a payment already in a final state.
 */

const env = require('../config/env');
const razorpayClient = require('../integrations/razorpayClient');
const paymentRepository = require('../repositories/paymentRepository');
const orderRepository = require('../repositories/orderRepository');
const userRepository = require('../repositories/userRepository');
const orderWorkflowService = require('./workflow/orderWorkflowService');
const notificationService = require('./notificationService');
const { toRazorpayAmount } = require('../utils/price');
const logger = require('../utils/logger');
const {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  BadRequestError,
  InvalidTransitionError,
} = require('../utils/errors');

/** Payment statuses that must never be overwritten by a later/replayed event. */
const FINAL_PAYMENT_STATUSES = ['SUCCESS', 'REFUNDED'];

/**
 * Call the gateway only — no database write. Kept separate so order creation
 * can talk to Razorpay BEFORE it writes anything, and so a gateway failure
 * leaves no half-made order behind.
 *
 * @param {{ orderNumber: string, total: string|number, orderId?: number }} args
 * @returns {Promise<{ razorpayOrderId: string, checkout: object, amountPaise: number }>}
 */
async function createGatewayOrder({ orderNumber, total, orderId }) {
  const amountPaise = toRazorpayAmount(total);
  const rzpOrder = await razorpayClient.createOrder({
    amountPaise,
    receipt: orderNumber,
    notes: { orderNumber, ...(orderId ? { orderId: String(orderId) } : {}) },
  });

  return {
    razorpayOrderId: rzpOrder.id,
    amountPaise,
    checkout: {
      orderId: rzpOrder.id,
      amount: amountPaise,
      currency: rzpOrder.currency || 'INR',
      keyId: razorpayClient.keyId,
    },
  };
}

/** Write the Payment row for a gateway order. Takes `tx` so it can join a transaction. */
function recordPayment({ orderId, razorpayOrderId, amount }, tx) {
  return paymentRepository.create(
    { orderId, razorpayOrderId, amount: String(amount), status: 'PENDING' },
    tx,
  );
}

/**
 * Gateway order + Payment row together, for an order that already exists
 * (payment retry). Can join a transaction via `tx`.
 *
 * @param {{ order: object, tx?: object }} args
 * @returns {Promise<{ payment: object, razorpay: object }>}
 */
async function createCheckout({ order, tx }) {
  const gateway = await createGatewayOrder({
    orderNumber: order.orderNumber,
    total: order.total,
    orderId: order.id,
  });

  const payment = await recordPayment(
    { orderId: order.id, razorpayOrderId: gateway.razorpayOrderId, amount: order.total },
    tx,
  );

  return { payment, razorpay: gateway.checkout };
}

/**
 * Checkout callback verification. This is for fast UI feedback only — it does
 * NOT move the order, because the webhook is the source of truth.
 *
 * @returns {Promise<{ verified: true, paymentStatus: string, orderStatus: string }>}
 */
async function verifyCheckoutSignature({ orderId, customerId, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.customerId !== customerId) throw new ForbiddenError('This is not your order');

  const payment = await paymentRepository.findByRazorpayOrderId(razorpayOrderId);
  if (!payment || payment.orderId !== order.id) {
    throw new ValidationError('That payment does not belong to this order');
  }

  const valid = razorpayClient.verifyPaymentSignature({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
  });
  if (!valid) throw new BadRequestError('Payment signature could not be verified');

  // Record the payment id so the webhook can be matched up, but leave the
  // status to the webhook.
  if (!payment.razorpayPaymentId) {
    await paymentRepository.update(payment.id, { razorpayPaymentId });
  }

  const latest = await orderRepository.findById(order.id);
  logger.info('checkout signature verified', { orderId: order.id, razorpayOrderId });

  return {
    verified: true,
    paymentStatus: payment.status,
    orderStatus: latest.status,
    note: 'Payment is being confirmed. The order updates as soon as the gateway confirms it.',
  };
}

/**
 * Retry after a failure: a new Razorpay order, and the order goes back to
 * PENDING_PAYMENT through the workflow gateway.
 */
async function retryPayment({ orderId, customerId }) {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.customerId !== customerId) throw new ForbiddenError('This is not your order');
  if (order.status !== 'PAYMENT_FAILED') {
    throw new InvalidTransitionError('This order is not waiting for a payment retry', {
      status: order.status,
    });
  }

  let checkout = null;
  const committed = await orderWorkflowService.transition({
    orderId,
    to: 'PENDING_PAYMENT',
    actor: { id: customerId, role: 'CUSTOMER' },
    note: 'Customer retried payment',
    extra: {
      expectedFrom: 'PAYMENT_FAILED',
      inTransaction: async (tx, { order: current }) => {
        checkout = await createCheckout({ order: current, tx });
        return checkout;
      },
    },
  });

  return { order: committed.order, razorpay: checkout.razorpay };
}

// ------------------------------------------------------------------ webhook

/**
 * Handle a verified webhook body. The caller (controller) has already checked
 * the signature against the RAW body.
 *
 * @param {{ eventId: string, body: object }} args
 * @returns {Promise<{ handled: boolean, duplicate?: boolean, reason?: string }>}
 */
async function handleWebhook({ eventId, body }) {
  const eventType = body?.event;
  if (!eventType) throw new BadRequestError('Webhook body has no event');

  // Unique constraint on razorpayEventId: a redelivered event is a no-op.
  const recorded = await paymentRepository.recordEventOnce({
    razorpayEventId: eventId,
    eventType,
    payload: body,
  });
  if (!recorded) {
    logger.info('webhook replay ignored', { eventId, eventType });
    return { handled: false, duplicate: true, reason: 'Event already processed' };
  }

  switch (eventType) {
    case 'payment.captured':
    case 'order.paid':
      return handlePaymentCaptured(body);
    case 'payment.failed':
      return handlePaymentFailed(body);
    case 'refund.processed':
      return handleRefundProcessed(body);
    default:
      logger.info('webhook event ignored', { eventId, eventType });
      return { handled: false, reason: `Unhandled event ${eventType}` };
  }
}

/** Pull the payment and order entities out of a Razorpay webhook payload. */
function extractEntities(body) {
  const paymentEntity = body?.payload?.payment?.entity || null;
  const orderEntity = body?.payload?.order?.entity || null;
  const refundEntity = body?.payload?.refund?.entity || null;
  const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id || refundEntity?.notes?.razorpayOrderId || null;
  return { paymentEntity, orderEntity, refundEntity, razorpayOrderId };
}

async function handlePaymentCaptured(body) {
  const { paymentEntity, razorpayOrderId } = extractEntities(body);
  if (!razorpayOrderId) return { handled: false, reason: 'No razorpay order id in payload' };

  const payment = await paymentRepository.findByRazorpayOrderId(razorpayOrderId);
  if (!payment) {
    logger.warn('webhook for unknown payment', { razorpayOrderId });
    return { handled: false, reason: 'Unknown payment' };
  }

  // Already settled: nothing to do.
  if (FINAL_PAYMENT_STATUSES.includes(payment.status)) {
    return { handled: false, reason: `Payment already ${payment.status}` };
  }

  const moved = await paymentRepository.conditionalStatusUpdate({
    id: payment.id,
    fromStatuses: ['PENDING', 'FAILED'],
    status: 'SUCCESS',
    data: { razorpayPaymentId: paymentEntity?.id || payment.razorpayPaymentId || null },
  });
  if (moved === 0) return { handled: false, reason: 'Payment already settled' };

  // The order may already be PLACED if order.paid and payment.captured both
  // arrived — the workflow gateway refuses the second one, which is correct.
  if (payment.order.status !== 'PENDING_PAYMENT') {
    return { handled: true, reason: `Order already ${payment.order.status}` };
  }

  await orderWorkflowService.transition({
    orderId: payment.orderId,
    to: 'PLACED',
    actor: { role: 'SYSTEM' },
    note: 'Payment captured',
    extra: {
      expectedFrom: 'PENDING_PAYMENT',
      afterCommit: async ({ order }) => {
        const customer = await userRepository.findById(order.customerId);
        await notificationService.orderPlaced({ order, customer });
      },
    },
  });

  return { handled: true };
}

async function handlePaymentFailed(body) {
  const { paymentEntity, razorpayOrderId } = extractEntities(body);
  if (!razorpayOrderId) return { handled: false, reason: 'No razorpay order id in payload' };

  const payment = await paymentRepository.findByRazorpayOrderId(razorpayOrderId);
  if (!payment) return { handled: false, reason: 'Unknown payment' };

  if (FINAL_PAYMENT_STATUSES.includes(payment.status)) {
    return { handled: false, reason: `Payment already ${payment.status}` };
  }

  const moved = await paymentRepository.conditionalStatusUpdate({
    id: payment.id,
    fromStatuses: ['PENDING'],
    status: 'FAILED',
    data: { razorpayPaymentId: paymentEntity?.id || payment.razorpayPaymentId || null },
  });
  if (moved === 0) return { handled: false, reason: 'Payment already settled' };

  if (payment.order.status !== 'PENDING_PAYMENT') {
    return { handled: true, reason: `Order already ${payment.order.status}` };
  }

  await orderWorkflowService.transition({
    orderId: payment.orderId,
    to: 'PAYMENT_FAILED',
    actor: { role: 'SYSTEM' },
    note: paymentEntity?.error_description || 'Payment failed',
    extra: { expectedFrom: 'PENDING_PAYMENT' },
  });

  return { handled: true };
}

async function handleRefundProcessed(body) {
  const { refundEntity } = extractEntities(body);
  const razorpayPaymentId = refundEntity?.payment_id;
  if (!razorpayPaymentId) return { handled: false, reason: 'No payment id in refund payload' };

  const payment = await paymentRepository.findByRazorpayPaymentId(razorpayPaymentId);
  if (!payment) return { handled: false, reason: 'Unknown payment' };
  if (payment.status === 'REFUNDED') return { handled: false, reason: 'Payment already REFUNDED' };

  const moved = await paymentRepository.conditionalStatusUpdate({
    id: payment.id,
    fromStatuses: ['SUCCESS'],
    status: 'REFUNDED',
    data: { refundId: refundEntity.id || payment.refundId || null },
  });
  if (moved === 0) return { handled: false, reason: 'Payment was not in a refundable state' };

  logger.info('refund processed', { paymentId: payment.id, refundId: refundEntity.id });
  return { handled: true };
}

// ------------------------------------------------------------------ refunds

/**
 * Start a full refund for an order. Called from the admin reject/cancel flows
 * AFTER the status transaction commits, so a gateway failure cannot roll the
 * status back — it is logged and the payment is left SUCCESS for a retry.
 *
 * @returns {Promise<{ refunded: boolean, reason?: string, refundId?: string }>}
 */
async function refundOrder({ orderId, reason }) {
  const payment = await paymentRepository.findSuccessfulForOrder(orderId);
  if (!payment) return { refunded: false, reason: 'Nothing was paid for this order' };
  if (!payment.razorpayPaymentId) {
    return { refunded: false, reason: 'No gateway payment id to refund against' };
  }

  try {
    const result = await razorpayClient.refund({
      razorpayPaymentId: payment.razorpayPaymentId,
      amountPaise: toRazorpayAmount(payment.amount),
      notes: { orderId: String(orderId), reason: reason || 'Order ended' },
    });
    await paymentRepository.update(payment.id, { refundId: result.id });
    logger.info('refund requested', { orderId, paymentId: payment.id, refundId: result.id });
    return { refunded: true, refundId: result.id };
  } catch (err) {
    // The order's status change already committed; this is logged for a retry.
    logger.error('refund failed', { orderId, paymentId: payment.id, message: err.message });
    return { refunded: false, reason: err.message };
  }
}

function getPaymentsForOrder(orderId) {
  return paymentRepository.findManyForOrder(orderId);
}

module.exports = {
  FINAL_PAYMENT_STATUSES,
  createGatewayOrder,
  recordPayment,
  createCheckout,
  verifyCheckoutSignature,
  retryPayment,
  handleWebhook,
  refundOrder,
  getPaymentsForOrder,
  webhookSecretConfigured: () => Boolean(env.RAZORPAY_WEBHOOK_SECRET),
};
