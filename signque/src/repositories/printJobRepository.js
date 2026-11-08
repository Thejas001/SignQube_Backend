'use strict';

/** Prisma access for print jobs. */

const { db } = require('./prisma');

const USER_BRIEF = { id: true, name: true, email: true, role: true };

function create(data, tx) {
  return db(tx).printJob.create({ data });
}

function findByOrderId(orderId, tx) {
  return db(tx).printJob.findUnique({ where: { orderId } });
}

function findByOrderIdFull(orderId, tx) {
  return db(tx).printJob.findUnique({
    where: { orderId },
    include: { printer: { select: USER_BRIEF }, assignedBy: { select: USER_BRIEF } },
  });
}

function update(orderId, data, tx) {
  return db(tx).printJob.update({ where: { orderId }, data });
}

/**
 * Stage change guarded on the stage we believe the job is in and on the owning
 * printer, so two printers cannot both move it.
 *
 * @returns {Promise<number>} rows changed; 0 means someone else got there first
 */
async function conditionalStageUpdate({ orderId, fromStages, toStage, printerId, data = {} }, tx) {
  const { count } = await db(tx).printJob.updateMany({
    where: { orderId, printerId, stage: { in: fromStages } },
    data: { stage: toStage, ...data, updatedAt: new Date() },
  });
  return count;
}

/** Reassigning a printer also moves the job row to the new owner. */
function reassignPrinter(orderId, printerId, tx) {
  return db(tx).printJob.update({ where: { orderId }, data: { printerId } });
}

module.exports = {
  create,
  findByOrderId,
  findByOrderIdFull,
  update,
  conditionalStageUpdate,
  reassignPrinter,
};
