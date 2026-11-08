'use strict';

/**
 * Designs: the designer taking and submitting jobs, the admin's check, and the
 * customer's approve / request-changes — including the revision limit.
 *
 * Every status change goes through orderWorkflowService.transition(), and the
 * design version, review row and status update land in one transaction.
 */

const env = require('../config/env');
const orderRepository = require('../repositories/orderRepository');
const designRepository = require('../repositories/designRepository');
const userRepository = require('../repositories/userRepository');

const orderWorkflowService = require('./workflow/orderWorkflowService');
const notificationService = require('./notificationService');
const uploadService = require('./uploadService');

const {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  ConflictError,
} = require('../utils/errors');

// ------------------------------------------------------------------ designer

/** DESIGN_ASSIGNED → DESIGN_IN_PROGRESS. Atomic, so only one claim wins. */
async function takeJob({ orderId, designer }) {
  return orderWorkflowService.transition({
    orderId,
    to: 'DESIGN_IN_PROGRESS',
    actor: { id: designer.id, role: 'DESIGNER' },
    note: 'Designer took the job',
    extra: { expectedFrom: 'DESIGN_ASSIGNED' },
  });
}

/**
 * Submit a design: DESIGN_IN_PROGRESS → DESIGN_SUBMITTED, with a new
 * DesignVersion at the next version number.
 *
 * The file is uploaded BEFORE the transaction — an upload must not hold a
 * database transaction open, and an orphaned S3 object is harmless.
 *
 * @param {{ orderId: number, designer: object, file: object, note?: string }} args
 */
async function submitDesign({ orderId, designer, file, note }) {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.assignedDesignerId !== designer.id) {
    throw new ForbiddenError('This order is not assigned to you');
  }

  // Validate the file before anything else, so a bad upload fails fast.
  uploadService.assertAllowed(file, 'design');

  const nextVersionNo = (await designRepository.maxVersionNo(orderId)) + 1;
  const stored = await uploadService.uploadDesignFile({ file, orderId, versionNo: nextVersionNo });

  let version = null;
  const committed = await orderWorkflowService.transition({
    orderId,
    to: 'DESIGN_SUBMITTED',
    actor: { id: designer.id, role: 'DESIGNER' },
    note: note ? `Design v${nextVersionNo} submitted: ${note}` : `Design v${nextVersionNo} submitted`,
    extra: {
      expectedFrom: 'DESIGN_IN_PROGRESS',
      inTransaction: async (tx) => {
        // The unique (orderId, versionNo) index is the backstop if two
        // submissions race — the loser's transaction fails and rolls back.
        try {
          version = await designRepository.createVersion(
            {
              orderId,
              designerId: designer.id,
              versionNo: nextVersionNo,
              fileUrl: stored.url,
              fileKey: stored.key,
              designerNote: note || null,
              status: 'SUBMITTED',
            },
            tx,
          );
        } catch (err) {
          if (err && err.code === 'P2002') {
            throw new ConflictError('Another version was submitted at the same time. Refresh and try again.');
          }
          throw err;
        }
        return version;
      },
      afterCommit: async ({ order: updated }) => {
        await notificationService.designSubmitted({ order: updated, versionNo: nextVersionNo });
      },
    },
  });

  return { order: committed.order, version };
}

/** The designer's own job list. */
async function listDesignerJobs({ designerId, statuses }) {
  const orders = await orderRepository.listForDesigner({ designerId, statuses });
  return Promise.all(
    orders.map(async (order) => ({
      ...order,
      items: await Promise.all(
        order.items.map(async (item) => ({
          ...item,
          customization: await uploadService.presignFields(item.customization, [['photoKey', 'photoUrl']]),
        })),
      ),
    })),
  );
}

/** One job: the customer photo, all of this designer's versions and every comment. */
async function getDesignerJob({ orderId, designerId }) {
  const order = await orderRepository.findByIdFull(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.assignedDesignerId !== designerId) {
    throw new ForbiddenError('This order is not assigned to you');
  }

  const items = await Promise.all(
    order.items.map(async (item) => ({
      ...item,
      customization: await uploadService.presignFields(item.customization, [['photoKey', 'photoUrl']]),
    })),
  );

  const versions = await Promise.all(
    order.designVersions.map((v) => uploadService.presignFields(v, [['fileKey', 'fileUrl']])),
  );

  const reviews = await designRepository.findReviewsForOrder(orderId);

  return {
    ...order,
    items,
    designVersions: versions,
    reviews,
    printSpec: order.printJob
      ? { color: order.printJob.color, thicknessMm: order.printJob.thicknessMm, size: order.printJob.size }
      : null,
    canTake: order.status === 'DESIGN_ASSIGNED',
    canSubmit: order.status === 'DESIGN_IN_PROGRESS',
  };
}

// --------------------------------------------------------------- admin check

/**
 * Admin approves the design: DESIGN_SUBMITTED → AWAITING_CUSTOMER_APPROVAL.
 * The latest version becomes SENT_TO_CUSTOMER, which is what makes it visible
 * to the customer.
 */
async function adminApproveDesign({ orderId, actor, comment }) {
  const latest = await designRepository.findLatestForOrder(orderId);
  if (!latest) throw new ValidationError('This order has no design to send');
  if (latest.status !== 'SUBMITTED') {
    throw new ValidationError('The latest design version is not awaiting review', {
      versionStatus: latest.status,
    });
  }

  return orderWorkflowService.transition({
    orderId,
    to: 'AWAITING_CUSTOMER_APPROVAL',
    actor,
    note: `Design v${latest.versionNo} sent to the customer`,
    extra: {
      expectedFrom: 'DESIGN_SUBMITTED',
      inTransaction: async (tx) => {
        await designRepository.updateVersionStatus(latest.id, 'SENT_TO_CUSTOMER', tx);
        return designRepository.createReview(
          {
            designVersionId: latest.id,
            reviewerId: actor.id,
            reviewerRole: 'ADMIN',
            decision: 'APPROVED',
            comment: comment || null,
          },
          tx,
        );
      },
      afterCommit: async ({ order }) => {
        const customer = await userRepository.findById(order.customerId);
        await notificationService.designReadyForCustomer({ order, customer });
      },
    },
  });
}

/**
 * Admin sends the design back with notes: DESIGN_SUBMITTED → DESIGN_IN_PROGRESS.
 * The version is marked ADMIN_REJECTED, so the customer never sees it.
 */
async function adminSendBackDesign({ orderId, note, actor }) {
  if (!note || !note.trim()) throw new ValidationError('A note is required when sending a design back');

  const latest = await designRepository.findLatestForOrder(orderId);
  if (!latest) throw new ValidationError('This order has no design to send back');

  return orderWorkflowService.transition({
    orderId,
    to: 'DESIGN_IN_PROGRESS',
    actor,
    note: `Sent back to the designer: ${note}`,
    extra: {
      expectedFrom: 'DESIGN_SUBMITTED',
      inTransaction: async (tx) => {
        await designRepository.updateVersionStatus(latest.id, 'ADMIN_REJECTED', tx);
        return designRepository.createReview(
          {
            designVersionId: latest.id,
            reviewerId: actor.id,
            reviewerRole: 'ADMIN',
            decision: 'CHANGES_REQUESTED',
            comment: note,
          },
          tx,
        );
      },
      afterCommit: async ({ order }) => {
        const designer = order.assignedDesignerId
          ? await userRepository.findById(order.assignedDesignerId)
          : null;
        if (designer) await notificationService.designSentBack({ order, designer, note });
      },
    },
  });
}

// ------------------------------------------------------------ customer review

/** The latest version this customer may see. */
async function getCustomerDesign({ orderId, customerId }) {
  const order = await orderRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.customerId !== customerId) throw new ForbiddenError('This is not your order');

  const version = await designRepository.findLatestVisibleToCustomer(orderId);
  if (!version) throw new NotFoundError('No design has been shared with you yet');

  const withUrl = await uploadService.presignFields(version, [['fileKey', 'fileUrl']]);
  const revisionsLeft = Math.max(0, env.MAX_FREE_REVISIONS - order.customerRevisionCount);

  return {
    version: withUrl,
    orderStatus: order.status,
    canApprove: order.status === 'AWAITING_CUSTOMER_APPROVAL',
    revisions: {
      used: order.customerRevisionCount,
      left: revisionsLeft,
      max: env.MAX_FREE_REVISIONS,
      canRequestChanges: order.status === 'AWAITING_CUSTOMER_APPROVAL' && revisionsLeft > 0,
    },
  };
}

/** Customer approves: AWAITING_CUSTOMER_APPROVAL → CUSTOMER_APPROVED. */
async function customerApproveDesign({ orderId, customer }) {
  const latest = await designRepository.findLatestVisibleToCustomer(orderId);
  if (!latest) throw new ValidationError('There is no design for you to approve');

  return orderWorkflowService.transition({
    orderId,
    to: 'CUSTOMER_APPROVED',
    actor: { id: customer.id, role: 'CUSTOMER' },
    note: `Customer approved design v${latest.versionNo}`,
    extra: {
      expectedFrom: 'AWAITING_CUSTOMER_APPROVAL',
      inTransaction: async (tx) => {
        await designRepository.updateVersionStatus(latest.id, 'CUSTOMER_APPROVED', tx);
        return designRepository.createReview(
          {
            designVersionId: latest.id,
            reviewerId: customer.id,
            reviewerRole: 'CUSTOMER',
            decision: 'APPROVED',
            comment: null,
          },
          tx,
        );
      },
      afterCommit: async ({ order }) => {
        await notificationService.customerApproved({ order });
      },
    },
  });
}

/**
 * Customer requests changes: AWAITING_CUSTOMER_APPROVAL → DESIGN_IN_PROGRESS,
 * and the revision counter goes up. Refused once MAX_FREE_REVISIONS is reached.
 */
async function customerRequestChanges({ orderId, customer, comment }) {
  if (!comment || !comment.trim()) {
    throw new ValidationError('A comment is required when requesting changes');
  }

  const order = await orderRepository.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.customerId !== customer.id) throw new ForbiddenError('This is not your order');

  if (order.customerRevisionCount >= env.MAX_FREE_REVISIONS) {
    throw new ForbiddenError(
      `You have used all ${env.MAX_FREE_REVISIONS} change requests. Contact support for more changes.`,
      { used: order.customerRevisionCount, max: env.MAX_FREE_REVISIONS },
    );
  }

  const latest = await designRepository.findLatestVisibleToCustomer(orderId);
  if (!latest) throw new ValidationError('There is no design to request changes on');

  return orderWorkflowService.transition({
    orderId,
    to: 'DESIGN_IN_PROGRESS',
    actor: { id: customer.id, role: 'CUSTOMER' },
    note: `Customer requested changes: ${comment}`,
    extra: {
      expectedFrom: 'AWAITING_CUSTOMER_APPROVAL',
      // The counter moves in the same atomic update as the status, and the
      // guard refuses the move once the limit is reached — so two parallel
      // requests cannot both slip past the limit.
      data: { customerRevisionCount: { increment: 1 } },
      where: { customerRevisionCount: { lt: env.MAX_FREE_REVISIONS } },
      inTransaction: async (tx) => {
        await designRepository.updateVersionStatus(latest.id, 'CHANGES_REQUESTED', tx);
        return designRepository.createReview(
          {
            designVersionId: latest.id,
            reviewerId: customer.id,
            reviewerRole: 'CUSTOMER',
            decision: 'CHANGES_REQUESTED',
            comment,
          },
          tx,
        );
      },
      afterCommit: async ({ order: updated }) => {
        const designer = updated.assignedDesignerId
          ? await userRepository.findById(updated.assignedDesignerId)
          : null;
        await notificationService.customerRequestedChanges({ order: updated, designer, comment });
      },
    },
  });
}

module.exports = {
  takeJob,
  submitDesign,
  listDesignerJobs,
  getDesignerJob,
  adminApproveDesign,
  adminSendBackDesign,
  getCustomerDesign,
  customerApproveDesign,
  customerRequestChanges,
};
