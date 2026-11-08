'use strict';

/**
 * Printing: the admin's print spec and assignment, the printer taking the job,
 * the production stages, and completion.
 *
 * Completion is only allowed from stage QUALITY_CHECK, and it moves the order
 * PRINTING → PRINT_COMPLETED → COMPLETED in the same request.
 */

const orderRepository = require('../repositories/orderRepository');
const printJobRepository = require('../repositories/printJobRepository');
const designRepository = require('../repositories/designRepository');
const userRepository = require('../repositories/userRepository');

const orderWorkflowService = require('./workflow/orderWorkflowService');
const notificationService = require('./notificationService');
const userService = require('./userService');
const uploadService = require('./uploadService');

const {
  MATERIAL_COLORS,
  THICKNESSES_MM,
  SHEET_SIZES,
  PRINTER_SETTABLE_STAGES,
} = require('../config/constants');
const {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
  InvalidTransitionError,
} = require('../utils/errors');

/**
 * Validate a print spec against the allowed sets. Rejects 7 mm, A5, RED and
 * anything else outside the lists in config/constants.js — the same lists the
 * Postgres CHECK constraint and the Prisma enums enforce.
 *
 * @param {{ color: any, thicknessMm: any, size: any }} spec
 * @returns {{ color: string, thicknessMm: number, size: string }}
 */
function validatePrintSpec({ color, thicknessMm, size }) {
  const details = {};

  if (!MATERIAL_COLORS.includes(color)) {
    details.color = { got: color, allowed: MATERIAL_COLORS };
  }

  const thickness = Number(thicknessMm);
  if (!Number.isInteger(thickness) || !THICKNESSES_MM.includes(thickness)) {
    details.thicknessMm = { got: thicknessMm, allowed: THICKNESSES_MM };
  }

  if (!SHEET_SIZES.includes(size)) {
    details.size = { got: size, allowed: SHEET_SIZES };
  }

  if (Object.keys(details).length > 0) {
    throw new ValidationError('That print spec is not allowed', details);
  }

  return { color, thicknessMm: thickness, size };
}

// -------------------------------------------------------------- admin assign

/**
 * Set the print spec and assign a printer: CUSTOMER_APPROVED → PRINT_ASSIGNED.
 * Creates the PrintJob row in the same transaction.
 */
async function assignPrinting({ orderId, printerId, color, thicknessMm, size, notes, actor }) {
  const spec = validatePrintSpec({ color, thicknessMm, size });
  const printer = await userService.requireActiveUserWithRole(printerId, 'PRINTER', 'Printing user');

  const existing = await printJobRepository.findByOrderId(orderId);
  if (existing) throw new ConflictError('This order already has a print job');

  // The printer needs something to print.
  const approved = await designRepository.findLatestApprovedForOrder(orderId);
  if (!approved) throw new ValidationError('No customer-approved design to print');

  let printJob = null;
  const committed = await orderWorkflowService.transition({
    orderId,
    to: 'PRINT_ASSIGNED',
    actor,
    note: `Print job assigned to ${printer.name} (${spec.color}, ${spec.thicknessMm} mm, ${spec.size})`,
    extra: {
      expectedFrom: 'CUSTOMER_APPROVED',
      data: { assignedPrinterId: printerId },
      inTransaction: async (tx) => {
        // The unique index on orderId is the backstop for a race here.
        try {
          printJob = await printJobRepository.create(
            {
              orderId,
              printerId,
              color: spec.color,
              thicknessMm: spec.thicknessMm,
              size: spec.size,
              stage: 'ASSIGNED',
              assignedById: actor.id,
              notes: notes || null,
            },
            tx,
          );
        } catch (err) {
          if (err && err.code === 'P2002') {
            throw new ConflictError('This order already has a print job');
          }
          throw err;
        }
        return printJob;
      },
      afterCommit: async ({ order }) => {
        await notificationService.printAssigned({ order, printer, spec });
      },
    },
  });

  return { order: committed.order, printJob };
}

/** Swap the printer without moving the status. Moves the job row too. */
async function reassignPrinter({ orderId, printerId, actor }) {
  const printer = await userService.requireActiveUserWithRole(printerId, 'PRINTER', 'Printing user');

  return orderWorkflowService.reassign({
    orderId,
    allowedStatuses: ['PRINT_ASSIGNED', 'PRINTING'],
    data: { assignedPrinterId: printerId },
    actor,
    note: `Printing user reassigned to ${printer.name}`,
    inTransaction: async (tx) => printJobRepository.reassignPrinter(orderId, printerId, tx),
    afterCommit: async ({ order }) => {
      const job = await printJobRepository.findByOrderId(orderId);
      await notificationService.printAssigned({
        order,
        printer,
        spec: { color: job.color, thicknessMm: job.thicknessMm, size: job.size },
      });
    },
  });
}

// ------------------------------------------------------------------- printer

/**
 * PRINT_ASSIGNED → PRINTING, and the job's stage moves ASSIGNED → CUTTING so
 * the board shows it in the first production column.
 */
async function takeJob({ orderId, printer }) {
  return orderWorkflowService.transition({
    orderId,
    to: 'PRINTING',
    actor: { id: printer.id, role: 'PRINTER' },
    note: 'Printing user took the job',
    extra: {
      expectedFrom: 'PRINT_ASSIGNED',
      inTransaction: async (tx) => {
        const moved = await printJobRepository.conditionalStageUpdate(
          {
            orderId,
            fromStages: ['ASSIGNED'],
            toStage: 'CUTTING',
            printerId: printer.id,
            data: { startedAt: new Date() },
          },
          tx,
        );
        if (moved === 0) {
          throw new ConflictError('This print job was already started. Refresh and try again.');
        }
        return { stage: 'CUTTING' };
      },
    },
  });
}

/**
 * Move the production stage. Forward through CUTTING → PRINTING →
 * QUALITY_CHECK, and back to CUTTING or PRINTING when a quality check fails.
 *
 * This does not change the order status — the order stays PRINTING throughout.
 */
async function updateStage({ orderId, printer, stage, notes }) {
  if (!PRINTER_SETTABLE_STAGES.includes(stage)) {
    throw new ValidationError('That production stage cannot be set', {
      got: stage,
      allowed: PRINTER_SETTABLE_STAGES,
    });
  }

  const order = await orderRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.assignedPrinterId !== printer.id) {
    throw new ForbiddenError('This print job is not assigned to you');
  }
  if (order.status !== 'PRINTING') {
    throw new InvalidTransitionError('The stage can only change while the order is printing', {
      status: order.status,
    });
  }

  const job = await printJobRepository.findByOrderId(orderId);
  if (!job) throw new NotFoundError('Print job not found');
  if (job.stage === 'DONE') throw new InvalidTransitionError('This print job is already done');

  const moved = await printJobRepository.conditionalStageUpdate({
    orderId,
    fromStages: PRINTER_SETTABLE_STAGES,
    toStage: stage,
    printerId: printer.id,
    data: notes !== undefined ? { notes: notes || null } : {},
  });
  if (moved === 0) {
    throw new ConflictError('This print job was changed by someone else. Refresh and try again.');
  }

  return printJobRepository.findByOrderIdFull(orderId);
}

/**
 * Mark the job done. Only allowed from stage QUALITY_CHECK.
 *
 * PRINTING → PRINT_COMPLETED, then PRINT_COMPLETED → COMPLETED in the same
 * request, and the customer is notified that the order is complete.
 */
async function completeJob({ orderId, printer }) {
  const job = await printJobRepository.findByOrderId(orderId);
  if (!job) throw new NotFoundError('Print job not found');
  if (job.printerId !== printer.id) throw new ForbiddenError('This print job is not assigned to you');

  if (job.stage !== 'QUALITY_CHECK') {
    throw new InvalidTransitionError(
      'A print job can only be completed from the quality check stage',
      { stage: job.stage, required: 'QUALITY_CHECK' },
    );
  }

  // Step 9: PRINTING → PRINT_COMPLETED, and the job row goes to DONE.
  await orderWorkflowService.transition({
    orderId,
    to: 'PRINT_COMPLETED',
    actor: { id: printer.id, role: 'PRINTER' },
    note: 'Printing finished and passed quality check',
    extra: {
      expectedFrom: 'PRINTING',
      inTransaction: async (tx) => {
        const moved = await printJobRepository.conditionalStageUpdate(
          {
            orderId,
            fromStages: ['QUALITY_CHECK'],
            toStage: 'DONE',
            printerId: printer.id,
            data: { completedAt: new Date() },
          },
          tx,
        );
        if (moved === 0) {
          throw new ConflictError('This print job was changed by someone else. Refresh and try again.');
        }
        return { stage: 'DONE' };
      },
    },
  });

  // Step 10: the system completes the order, in the same request.
  const completed = await orderWorkflowService.transition({
    orderId,
    to: 'COMPLETED',
    actor: { role: 'SYSTEM' },
    note: 'Order completed',
    extra: {
      expectedFrom: 'PRINT_COMPLETED',
      afterCommit: async ({ order }) => {
        const customer = await userRepository.findById(order.customerId);
        await notificationService.orderCompleted({ order, customer });
      },
    },
  });

  return { order: completed.order, printJob: await printJobRepository.findByOrderIdFull(orderId) };
}

/** The printer's own job board. */
async function listPrinterJobs({ printerId, stage }) {
  return orderRepository.listForPrinter({ printerId, stage });
}

/** One job: the approved design to download, the spec, product and quantity. */
async function getPrinterJob({ orderId, printerId }) {
  const order = await orderRepository.findByIdFull(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.assignedPrinterId !== printerId) {
    throw new ForbiddenError('This print job is not assigned to you');
  }

  const approved = await designRepository.findLatestApprovedForOrder(orderId);
  const design = approved ? await uploadService.presignFields(approved, [['fileKey', 'fileUrl']]) : null;

  const job = order.printJob;

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    customer: order.customer,
    items: order.items.map((item) => ({
      id: item.id,
      product: item.product,
      quantity: item.quantity,
    })),
    totalQuantity: order.items.reduce((sum, i) => sum + i.quantity, 0),
    design,
    printSpec: job
      ? { color: job.color, thicknessMm: job.thicknessMm, size: job.size, notes: job.notes }
      : null,
    printJob: job,
    canTake: order.status === 'PRINT_ASSIGNED',
    canUpdateStage: order.status === 'PRINTING' && job && job.stage !== 'DONE',
    canComplete: order.status === 'PRINTING' && job?.stage === 'QUALITY_CHECK',
    settableStages: PRINTER_SETTABLE_STAGES,
  };
}

/** The allowed option sets, for the admin's print spec form. */
function printOptions() {
  return {
    colors: MATERIAL_COLORS,
    thicknessesMm: THICKNESSES_MM,
    sizes: SHEET_SIZES,
    stages: PRINTER_SETTABLE_STAGES,
  };
}

module.exports = {
  validatePrintSpec,
  assignPrinting,
  reassignPrinter,
  takeJob,
  updateStage,
  completeJob,
  listPrinterJobs,
  getPrinterJob,
  printOptions,
};
