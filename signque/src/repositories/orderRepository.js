'use strict';

/**
 * All Prisma access for orders, order items and status history.
 * No business rules — the workflow service decides what is allowed.
 */

const { db } = require('./prisma');
const { nextOrderNumber } = require('../utils/orderNumber');

const FINAL_STATUSES = ['COMPLETED', 'REJECTED', 'CANCELLED'];

const USER_BRIEF = { id: true, name: true, email: true, phone: true, role: true };

/** Everything an admin's order-detail screen needs. */
const FULL_INCLUDE = {
  customer: { select: USER_BRIEF },
  address: true,
  assignedDesigner: { select: USER_BRIEF },
  assignedPrinter: { select: USER_BRIEF },
  items: { include: { product: true, customization: true } },
  payments: { orderBy: { createdAt: 'asc' } },
  designVersions: {
    orderBy: { versionNo: 'asc' },
    include: {
      designer: { select: USER_BRIEF },
      reviews: { orderBy: { createdAt: 'asc' }, include: { reviewer: { select: USER_BRIEF } } },
    },
  },
  printJob: { include: { printer: { select: USER_BRIEF }, assignedBy: { select: USER_BRIEF } } },
  history: {
    orderBy: { createdAt: 'asc' },
    include: { changedByUser: { select: USER_BRIEF } },
  },
};

function nextNumber(tx) {
  return nextOrderNumber(db(tx));
}

/**
 * @param {{ orderNumber: string, customerId: number, addressId: number,
 *           subtotal: string, shippingFee: string, total: string,
 *           items: Array<{ productId: number, customizationId: number,
 *                          quantity: number, unitPrice: string, lineTotal: string }> }} data
 */
function create(data, tx) {
  const { items, ...order } = data;
  return db(tx).order.create({
    data: { ...order, items: { create: items } },
    include: { items: { include: { product: true, customization: true } }, address: true },
  });
}

function findById(id, tx) {
  return db(tx).order.findUnique({ where: { id } });
}

function findByIdFull(id, tx) {
  return db(tx).order.findUnique({ where: { id }, include: FULL_INCLUDE });
}

function findByOrderNumber(orderNumber, tx) {
  return db(tx).order.findUnique({ where: { orderNumber } });
}

/**
 * The atomic claim used by every transition. Returns the number of rows
 * changed — 0 means someone else moved the order first.
 *
 * @param {object} args
 * @param {number} args.orderId
 * @param {string} args.fromStatus the status we believe the order is in
 * @param {string} args.to the status to move to
 * @param {object} [args.where] extra guards, e.g. { assignedDesignerId: 7 }
 * @param {object} [args.data] extra columns to set in the same update
 * @returns {Promise<number>}
 */
async function conditionalStatusUpdate({ orderId, fromStatus, to, where = {}, data = {} }, tx) {
  const { count } = await db(tx).order.updateMany({
    where: { id: orderId, status: fromStatus, ...where },
    data: { status: to, ...data, updatedAt: new Date() },
  });
  return count;
}

/** Assignment changes that do not move the status (reassign designer/printer). */
async function conditionalFieldUpdate({ orderId, statusIn, data }, tx) {
  const { count } = await db(tx).order.updateMany({
    where: { id: orderId, status: { in: statusIn } },
    data: { ...data, updatedAt: new Date() },
  });
  return count;
}

function incrementRevisionCount(orderId, tx) {
  return db(tx).order.update({
    where: { id: orderId },
    data: { customerRevisionCount: { increment: 1 } },
  });
}

// ------------------------------------------------------------------ history

function createHistory({ orderId, fromStatus, toStatus, changedByUserId, note }, tx) {
  return db(tx).orderStatusHistory.create({
    data: { orderId, fromStatus, toStatus, changedByUserId: changedByUserId ?? null, note: note ?? null },
  });
}

function findHistory(orderId, tx) {
  return db(tx).orderStatusHistory.findMany({
    where: { orderId },
    orderBy: { createdAt: 'asc' },
    include: { changedByUser: { select: USER_BRIEF } },
  });
}

// -------------------------------------------------------------------- lists

/** The customer's own orders. */
async function listForCustomer({ customerId, status, page = 1, pageSize = 20 }, tx) {
  const where = { customerId, ...(status ? { status } : {}) };
  const client = db(tx);
  const [items, total] = await Promise.all([
    client.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { items: { include: { product: true } }, payments: { orderBy: { createdAt: 'desc' }, take: 1 } },
    }),
    client.order.count({ where }),
  ]);
  return { items, total };
}

/** The admin orders table: status, date range, designer, printer and search. */
async function listForAdmin({ status, search, designerId, printerId, from, to, page = 1, pageSize = 20 }, tx) {
  const where = {
    ...(status ? { status } : {}),
    ...(designerId ? { assignedDesignerId: designerId } : {}),
    ...(printerId ? { assignedPrinterId: printerId } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } }
      : {}),
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search, mode: 'insensitive' } },
            { customer: { name: { contains: search, mode: 'insensitive' } } },
            { customer: { phone: { contains: search } } },
          ],
        }
      : {}),
  };

  const client = db(tx);
  const [items, total] = await Promise.all([
    client.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: USER_BRIEF },
        assignedDesigner: { select: USER_BRIEF },
        assignedPrinter: { select: USER_BRIEF },
        items: { include: { product: true } },
      },
    }),
    client.order.count({ where }),
  ]);
  return { items, total };
}

/** A designer's jobs. `statuses` empty means all of their orders. */
function listForDesigner({ designerId, statuses }, tx) {
  return db(tx).order.findMany({
    where: {
      assignedDesignerId: designerId,
      ...(statuses && statuses.length ? { status: { in: statuses } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      customer: { select: USER_BRIEF },
      items: { include: { product: true, customization: true } },
      designVersions: { orderBy: { versionNo: 'desc' }, take: 1 },
    },
  });
}

/** A printer's jobs, optionally filtered by print stage. */
function listForPrinter({ printerId, stage }, tx) {
  return db(tx).order.findMany({
    where: {
      assignedPrinterId: printerId,
      ...(stage ? { printJob: { stage } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    include: {
      customer: { select: USER_BRIEF },
      items: { include: { product: true } },
      printJob: true,
    },
  });
}

// -------------------------------------------------------------- dashboard

/** Count of orders in each status. */
async function countByStatus(tx) {
  const rows = await db(tx).order.groupBy({ by: ['status'], _count: { _all: true } });
  return rows.reduce((acc, r) => {
    acc[r.status] = r._count._all;
    return acc;
  }, {});
}

/** Open (non-final) job counts grouped by designer and by printer. */
async function openJobsByAssignee(tx) {
  const client = db(tx);
  const [designers, printers] = await Promise.all([
    client.order.groupBy({
      by: ['assignedDesignerId'],
      where: { assignedDesignerId: { not: null }, status: { notIn: FINAL_STATUSES } },
      _count: { _all: true },
    }),
    client.order.groupBy({
      by: ['assignedPrinterId'],
      where: { assignedPrinterId: { not: null }, status: { notIn: FINAL_STATUSES } },
      _count: { _all: true },
    }),
  ]);
  return {
    designers: designers.map((d) => ({ userId: d.assignedDesignerId, openJobs: d._count._all })),
    printers: printers.map((p) => ({ userId: p.assignedPrinterId, openJobs: p._count._all })),
  };
}

module.exports = {
  FINAL_STATUSES,
  FULL_INCLUDE,
  USER_BRIEF,
  nextNumber,
  create,
  findById,
  findByIdFull,
  findByOrderNumber,
  conditionalStatusUpdate,
  conditionalFieldUpdate,
  incrementRevisionCount,
  createHistory,
  findHistory,
  listForCustomer,
  listForAdmin,
  listForDesigner,
  listForPrinter,
  countByStatus,
  openJobsByAssignee,
};
