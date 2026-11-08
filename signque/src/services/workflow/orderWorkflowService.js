'use strict';

/**
 * The ONE gateway for order status changes.
 *
 * Every status change in the system goes through `transition()`. No other code
 * writes Order.status. The guarantees it provides:
 *
 *  - the move must exist in transitions.js for the actor's role, else 409
 *    INVALID_TRANSITION;
 *  - ownership is checked for designers, printers and customers, else 403;
 *  - the write is an atomic conditional update, so two simultaneous clicks
 *    cannot both succeed — the loser gets 409 CONFLICT;
 *  - the status update, the history row and any related rows are written in one
 *    prisma.$transaction;
 *  - side effects (notifications, email, refunds) run only AFTER the
 *    transaction commits, and a failing side effect never rolls the status back.
 */

const { prisma } = require('../../repositories/prisma');
const orderRepository = require('../../repositories/orderRepository');
const logger = require('../../utils/logger');
const {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  InvalidTransitionError,
} = require('../../utils/errors');
const transitions = require('./transitions');

const CONFLICT_MESSAGE = 'Order was changed by someone else. Refresh and try again.';

/**
 * Ownership guard per role, as both a check and an extra WHERE clause on the
 * conditional update.
 *
 * @returns {{ ok: boolean, where: object }}
 */
function ownershipFor(order, actor) {
  switch (actor.role) {
    case 'DESIGNER':
      return {
        ok: order.assignedDesignerId === actor.id,
        where: { assignedDesignerId: actor.id },
      };
    case 'PRINTER':
      return {
        ok: order.assignedPrinterId === actor.id,
        where: { assignedPrinterId: actor.id },
      };
    case 'CUSTOMER':
      return { ok: order.customerId === actor.id, where: { customerId: actor.id } };
    case 'ADMIN':
    case 'SYSTEM':
      return { ok: true, where: {} };
    default:
      return { ok: false, where: {} };
  }
}

/**
 * Move an order to a new status.
 *
 * @param {object} args
 * @param {number} args.orderId
 * @param {string} args.to target OrderStatus
 * @param {{ id?: number, role: string }} args.actor role 'SYSTEM' for server-made changes
 * @param {string} [args.note] recorded on the history row
 * @param {object} [args.extra]
 * @param {string}   [args.extra.expectedFrom] refuse unless the order is in this status
 * @param {object}   [args.extra.data] extra Order columns written in the same update
 * @param {object}   [args.extra.where] extra guards for the conditional update
 * @param {Function} [args.extra.inTransaction] async (tx, ctx) => any — related rows
 * @param {Function} [args.extra.afterCommit] async (ctx) => any — side effects
 * @param {boolean}  [args.extra.skipOwnershipCheck] admin acting on someone else's order
 * @returns {Promise<{ order: object, from: string, to: string, result: any }>}
 */
async function transition({ orderId, to, actor, note = null, extra = {} }) {
  if (!actor || !actor.role) throw new ForbiddenError('No actor for this change');

  const {
    expectedFrom,
    data = {},
    where = {},
    inTransaction,
    afterCommit,
    skipOwnershipCheck = false,
  } = extra;

  const order = await orderRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');

  const from = order.status;

  if (expectedFrom && from !== expectedFrom) {
    throw new InvalidTransitionError(
      `This order is ${from}, not ${expectedFrom}. Refresh and try again.`,
      { from, expected: expectedFrom },
    );
  }

  // The move must be in the table for this role. An unknown move and a
  // wrong-role move are both 409 INVALID_TRANSITION, as specified.
  if (!transitions.isKnownTransition(from, to)) {
    throw new InvalidTransitionError(`An order cannot go from ${from} to ${to}`, {
      from,
      to,
      allowed: transitions.allowedFrom(from),
    });
  }
  if (!transitions.isAllowed(from, to, actor.role)) {
    throw new InvalidTransitionError(
      `A ${actor.role} cannot move an order from ${from} to ${to}`,
      { from, to, role: actor.role, allowedRoles: transitions.rolesFor(from, to) },
    );
  }

  // Ownership, before we touch anything.
  const ownership = ownershipFor(order, actor);
  if (!skipOwnershipCheck && !ownership.ok) {
    throw new ForbiddenError('This order is not assigned to you');
  }

  const guardWhere = { ...(skipOwnershipCheck ? {} : ownership.where), ...where };

  const committed = await prisma.$transaction(async (tx) => {
    // Atomic claim FIRST — it is the lock for everything that follows.
    const count = await orderRepository.conditionalStatusUpdate(
      { orderId, fromStatus: from, to, where: guardWhere, data },
      tx,
    );
    if (count === 0) throw new ConflictError(CONFLICT_MESSAGE, { from, to });

    await orderRepository.createHistory(
      {
        orderId,
        fromStatus: from,
        toStatus: to,
        changedByUserId: actor.role === 'SYSTEM' ? null : actor.id ?? null,
        note,
      },
      tx,
    );

    let result = null;
    if (typeof inTransaction === 'function') {
      result = await inTransaction(tx, { order, from, to, actor, note });
    }

    const updated = await orderRepository.findById(orderId, tx);
    return { order: updated, from, to, result };
  });

  logger.info('order transition', {
    orderId,
    orderNumber: committed.order.orderNumber,
    from,
    to,
    actorRole: actor.role,
    actorId: actor.role === 'SYSTEM' ? null : actor.id,
  });

  // Side effects only after the commit. A failure here must never undo the
  // status change, so it is logged and swallowed.
  if (typeof afterCommit === 'function') {
    try {
      await afterCommit(committed);
    } catch (err) {
      logger.error('after-commit side effect failed', {
        orderId,
        from,
        to,
        message: err.message,
      });
    }
  }

  return committed;
}

/**
 * Change an assignment without changing the status (admin reassigning a
 * designer or printer). Still atomic, and still writes a history row.
 *
 * @param {object} args
 * @param {number} args.orderId
 * @param {string[]} args.allowedStatuses statuses the order must be in
 * @param {object} args.data Order columns to set
 * @param {{ id: number, role: string }} args.actor
 * @param {string} args.note
 * @param {Function} [args.inTransaction]
 * @param {Function} [args.afterCommit]
 */
async function reassign({ orderId, allowedStatuses, data, actor, note, inTransaction, afterCommit }) {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');

  if (!allowedStatuses.includes(order.status)) {
    throw new InvalidTransitionError(
      `Cannot reassign while the order is ${order.status}`,
      { status: order.status, allowed: allowedStatuses },
    );
  }

  const committed = await prisma.$transaction(async (tx) => {
    const count = await orderRepository.conditionalFieldUpdate(
      { orderId, statusIn: allowedStatuses, data },
      tx,
    );
    if (count === 0) throw new ConflictError(CONFLICT_MESSAGE, { status: order.status });

    // The status does not move, so from and to are the same — the row records
    // who reassigned and why.
    await orderRepository.createHistory(
      {
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        changedByUserId: actor.id ?? null,
        note,
      },
      tx,
    );

    let result = null;
    if (typeof inTransaction === 'function') {
      result = await inTransaction(tx, { order, actor });
    }

    const updated = await orderRepository.findById(orderId, tx);
    return { order: updated, from: order.status, to: order.status, result };
  });

  logger.info('order reassigned', {
    orderId,
    orderNumber: committed.order.orderNumber,
    status: committed.order.status,
    actorId: actor.id,
  });

  if (typeof afterCommit === 'function') {
    try {
      await afterCommit(committed);
    } catch (err) {
      logger.error('after-commit side effect failed', { orderId, message: err.message });
    }
  }

  return committed;
}

/** What this actor could do to this order right now — drives the UI action panel. */
function availableActions(order, actor) {
  if (!order || !actor) return [];
  const ownership = ownershipFor(order, actor);
  if (!ownership.ok) return [];
  return transitions.allowedFrom(order.status, actor.role).map((r) => r.to);
}

module.exports = {
  transition,
  reassign,
  availableActions,
  ownershipFor,
  CONFLICT_MESSAGE,
};
