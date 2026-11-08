'use strict';

/** Prisma access for design versions and design reviews. */

const { db } = require('./prisma');

const USER_BRIEF = { id: true, name: true, email: true, role: true };

/** Statuses a customer is allowed to see (never an admin-rejected version). */
const CUSTOMER_VISIBLE_STATUSES = ['SENT_TO_CUSTOMER', 'CUSTOMER_APPROVED', 'CHANGES_REQUESTED'];

function createVersion(data, tx) {
  return db(tx).designVersion.create({ data });
}

function findById(id, tx) {
  return db(tx).designVersion.findUnique({ where: { id } });
}

/** Highest version number so far, 0 when the order has none. */
async function maxVersionNo(orderId, tx) {
  const row = await db(tx).designVersion.aggregate({
    where: { orderId },
    _max: { versionNo: true },
  });
  return row._max.versionNo || 0;
}

function findLatestForOrder(orderId, tx) {
  return db(tx).designVersion.findFirst({
    where: { orderId },
    orderBy: { versionNo: 'desc' },
    include: { designer: { select: USER_BRIEF }, reviews: { orderBy: { createdAt: 'asc' } } },
  });
}

/** The latest version the customer may see. */
function findLatestVisibleToCustomer(orderId, tx) {
  return db(tx).designVersion.findFirst({
    where: { orderId, status: { in: CUSTOMER_VISIBLE_STATUSES } },
    orderBy: { versionNo: 'desc' },
    include: { reviews: { orderBy: { createdAt: 'asc' } } },
  });
}

function findLatestApprovedForOrder(orderId, tx) {
  return db(tx).designVersion.findFirst({
    where: { orderId, status: 'CUSTOMER_APPROVED' },
    orderBy: { versionNo: 'desc' },
  });
}

function findAllForOrder(orderId, tx) {
  return db(tx).designVersion.findMany({
    where: { orderId },
    orderBy: { versionNo: 'asc' },
    include: {
      designer: { select: USER_BRIEF },
      reviews: { orderBy: { createdAt: 'asc' }, include: { reviewer: { select: USER_BRIEF } } },
    },
  });
}

function updateVersionStatus(id, status, tx) {
  return db(tx).designVersion.update({ where: { id }, data: { status } });
}

function createReview({ designVersionId, reviewerId, reviewerRole, decision, comment }, tx) {
  return db(tx).designReview.create({
    data: { designVersionId, reviewerId, reviewerRole, decision, comment: comment ?? null },
  });
}

/** Every review comment on an order, for the designer's job screen. */
function findReviewsForOrder(orderId, tx) {
  return db(tx).designReview.findMany({
    where: { designVersion: { orderId } },
    orderBy: { createdAt: 'asc' },
    include: { reviewer: { select: USER_BRIEF }, designVersion: { select: { id: true, versionNo: true } } },
  });
}

module.exports = {
  CUSTOMER_VISIBLE_STATUSES,
  createVersion,
  findById,
  maxVersionNo,
  findLatestForOrder,
  findLatestVisibleToCustomer,
  findLatestApprovedForOrder,
  findAllForOrder,
  updateVersionStatus,
  createReview,
  findReviewsForOrder,
};
