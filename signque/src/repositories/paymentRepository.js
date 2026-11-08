'use strict';

/** Prisma access for payments and the webhook event ledger. */

const { db } = require('./prisma');

function create(data, tx) {
  return db(tx).payment.create({ data });
}

function findById(id, tx) {
  return db(tx).payment.findUnique({ where: { id } });
}

function findByRazorpayOrderId(razorpayOrderId, tx) {
  return db(tx).payment.findUnique({ where: { razorpayOrderId }, include: { order: true } });
}

function findByRazorpayPaymentId(razorpayPaymentId, tx) {
  return db(tx).payment.findFirst({ where: { razorpayPaymentId }, include: { order: true } });
}

function findLatestForOrder(orderId, tx) {
  return db(tx).payment.findFirst({ where: { orderId }, orderBy: { createdAt: 'desc' } });
}

function findSuccessfulForOrder(orderId, tx) {
  return db(tx).payment.findFirst({
    where: { orderId, status: 'SUCCESS' },
    orderBy: { createdAt: 'desc' },
  });
}

function findManyForOrder(orderId, tx) {
  return db(tx).payment.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' } });
}

function update(id, data, tx) {
  return db(tx).payment.update({ where: { id }, data });
}

/**
 * Guarded status change: only moves a payment that is still in one of
 * `fromStatuses`, so a redelivered or out-of-order webhook cannot overwrite a
 * final state.
 *
 * @returns {Promise<number>} rows changed
 */
async function conditionalStatusUpdate({ id, fromStatuses, status, data = {} }, tx) {
  const { count } = await db(tx).payment.updateMany({
    where: { id, status: { in: fromStatuses } },
    data: { status, ...data, updatedAt: new Date() },
  });
  return count;
}

// ------------------------------------------------------------ event ledger

/**
 * Record a webhook event. The unique constraint on razorpayEventId makes a
 * redelivered event a no-op: this returns null when the event was already seen.
 */
async function recordEventOnce({ razorpayEventId, eventType, payload }, tx) {
  try {
    return await db(tx).paymentEvent.create({ data: { razorpayEventId, eventType, payload } });
  } catch (err) {
    if (err && err.code === 'P2002') return null; // already processed
    throw err;
  }
}

function findEvent(razorpayEventId, tx) {
  return db(tx).paymentEvent.findUnique({ where: { razorpayEventId } });
}

module.exports = {
  create,
  findById,
  findByRazorpayOrderId,
  findByRazorpayPaymentId,
  findLatestForOrder,
  findSuccessfulForOrder,
  findManyForOrder,
  update,
  conditionalStatusUpdate,
  recordEventOnce,
  findEvent,
};
