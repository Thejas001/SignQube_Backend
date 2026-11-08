'use strict';

/**
 * Orders: creation and totals, the customer's own views and timeline, and the
 * admin review actions (approve, reject, cancel, reassign designer).
 *
 * Every status change here goes through orderWorkflowService.transition().
 */

const env = require('../config/env');
const { prisma } = require('../repositories/prisma');
const orderRepository = require('../repositories/orderRepository');
const productRepository = require('../repositories/productRepository');
const customizationRepository = require('../repositories/customizationRepository');
const addressRepository = require('../repositories/addressRepository');
const userRepository = require('../repositories/userRepository');
const paymentRepository = require('../repositories/paymentRepository');
const designRepository = require('../repositories/designRepository');

const orderWorkflowService = require('./workflow/orderWorkflowService');
const notificationService = require('./notificationService');
const paymentService = require('./paymentService');
const userService = require('./userService');
const uploadService = require('./uploadService');

const { calculateOrderTotals } = require('../utils/price');
const { nextOrderNumber } = require('../utils/orderNumber');
const { PAGINATION } = require('../config/constants');
const {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} = require('../utils/errors');

// ------------------------------------------------------------------- create

/**
 * Create an order as PENDING_PAYMENT plus its Razorpay checkout order.
 *
 * Prices come from Product.basePrice and totals are recomputed here — anything
 * the client sent about money is ignored.
 *
 * @param {object} args
 * @param {number} args.customerId
 * @param {number} args.addressId
 * @param {Array<{ productId: number, customizationId: number, quantity: number }>} args.items
 * @returns {Promise<{ order: object, razorpay: object }>}
 */
async function createOrder({ customerId, addressId, items }) {
  const address = await addressRepository.findOwnedById(addressId, customerId);
  if (!address) throw new NotFoundError('Address not found');

  // Products must exist and be active.
  const productIds = [...new Set(items.map((i) => i.productId))];
  const products = await productRepository.findActiveByIds(productIds);
  const productsById = new Map(products.map((p) => [p.id, p]));
  const missingProduct = productIds.find((id) => !productsById.has(id));
  if (missingProduct) {
    throw new ValidationError('A product in your order is unavailable', { productId: missingProduct });
  }

  // Customizations must belong to this customer and match the product.
  const customizationIds = [...new Set(items.map((i) => i.customizationId))];
  const customizations = await customizationRepository.findOwnedByIds(customizationIds, customerId);
  const customizationsById = new Map(customizations.map((c) => [c.id, c]));
  for (const item of items) {
    const customization = customizationsById.get(item.customizationId);
    if (!customization) {
      throw new NotFoundError('Uploaded photo not found for one of your items', {
        customizationId: item.customizationId,
      });
    }
    if (customization.productId !== item.productId) {
      throw new ValidationError('That photo was uploaded for a different product', {
        customizationId: item.customizationId,
      });
    }
  }

  // Server-side totals from basePrice.
  const priced = calculateOrderTotals(
    items.map((i) => ({ unitPrice: productsById.get(i.productId).basePrice, quantity: i.quantity })),
    env.SHIPPING_FEE,
  );

  // The order number comes from the sequence before the transaction, so it can
  // be used as the Razorpay receipt.
  const orderNumber = await nextOrderNumber(prisma);

  // The gateway call happens before any DB write, so a gateway failure leaves
  // nothing behind. An unpaid Razorpay order left over is harmless.
  let gateway;
  try {
    gateway = await paymentService.createGatewayOrder({ orderNumber, total: priced.total });
  } catch (err) {
    throw new ValidationError(`Could not start payment: ${err.message}`);
  }

  // Order, items, Payment row and the first history row: one transaction.
  const created = await prisma.$transaction(async (tx) => {
    const order = await orderRepository.create(
      {
        orderNumber,
        customerId,
        addressId,
        subtotal: priced.subtotal,
        shippingFee: priced.shippingFee,
        total: priced.total,
        items: items.map((item, index) => ({
          productId: item.productId,
          customizationId: item.customizationId,
          quantity: priced.lines[index].quantity,
          unitPrice: priced.lines[index].unitPrice,
          lineTotal: priced.lines[index].lineTotal,
        })),
      },
      tx,
    );

    await paymentService.recordPayment(
      { orderId: order.id, razorpayOrderId: gateway.razorpayOrderId, amount: priced.total },
      tx,
    );

    await orderRepository.createHistory(
      {
        orderId: order.id,
        fromStatus: null,
        toStatus: 'PENDING_PAYMENT',
        changedByUserId: customerId,
        note: 'Order created',
      },
      tx,
    );

    return order;
  });

  return { order: created, razorpay: gateway.checkout };
}

// ------------------------------------------------------- customer order views

const CUSTOMER_STEPS = [
  { key: 'PLACED', label: 'Order placed' },
  { key: 'IN_REVIEW', label: 'In review' },
  { key: 'DESIGNING', label: 'Designing' },
  { key: 'YOUR_APPROVAL', label: 'Your approval' },
  { key: 'PRINTING', label: 'Printing' },
  { key: 'COMPLETED', label: 'Completed' },
];

/** Which of the 6 customer-facing steps the order is on. -1 = not placed yet. */
function currentStepIndex(status) {
  switch (status) {
    case 'PENDING_PAYMENT':
    case 'PAYMENT_FAILED':
      return -1;
    case 'PLACED':
      return 1;
    case 'DESIGN_ASSIGNED':
    case 'DESIGN_IN_PROGRESS':
    case 'DESIGN_SUBMITTED':
      return 2;
    case 'AWAITING_CUSTOMER_APPROVAL':
      return 3;
    case 'CUSTOMER_APPROVED':
    case 'PRINT_ASSIGNED':
    case 'PRINTING':
    case 'PRINT_COMPLETED':
      return 4;
    case 'COMPLETED':
      return 5;
    case 'REJECTED':
    case 'CANCELLED':
      return -2;
    default:
      return -1;
  }
}

/** The 6-step tracker the customer sees. */
function buildProgress(status) {
  const index = currentStepIndex(status);
  const ended = index === -2;
  return {
    ended,
    endedStatus: ended ? status : null,
    currentIndex: index,
    steps: CUSTOMER_STEPS.map((step, i) => ({
      ...step,
      state: ended ? 'stopped' : i < index ? 'done' : i === index ? 'current' : 'todo',
    })),
  };
}

/** Human-readable timeline from the history rows. */
const STATUS_LABEL = {
  PENDING_PAYMENT: 'Waiting for payment',
  PAYMENT_FAILED: 'Payment failed',
  PLACED: 'Order placed',
  DESIGN_ASSIGNED: 'Designer assigned',
  DESIGN_IN_PROGRESS: 'Design in progress',
  DESIGN_SUBMITTED: 'Design submitted for review',
  AWAITING_CUSTOMER_APPROVAL: 'Waiting for your approval',
  CUSTOMER_APPROVED: 'Design approved',
  PRINT_ASSIGNED: 'Sent to printing',
  PRINTING: 'Printing',
  PRINT_COMPLETED: 'Printing finished',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

function buildTimeline(history) {
  return history.map((row) => ({
    id: row.id,
    at: row.createdAt,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    label:
      row.fromStatus === row.toStatus
        ? row.note || 'Assignment updated'
        : STATUS_LABEL[row.toStatus] || row.toStatus,
    note: row.note,
    by: row.changedByUser ? { name: row.changedByUser.name, role: row.changedByUser.role } : null,
  }));
}

async function listMine({ customerId, status, page = 1, pageSize = PAGINATION.defaultPageSize }) {
  const { items, total } = await orderRepository.listForCustomer({ customerId, status, page, pageSize });
  return {
    items: items.map((order) => ({
      ...order,
      progress: buildProgress(order.status),
      statusLabel: STATUS_LABEL[order.status] || order.status,
    })),
    pagination: { page, pageSize, total },
  };
}

/** One of the customer's own orders: items, the visible design, and a timeline. */
async function getMine({ orderId, customerId }) {
  const order = await orderRepository.findByIdFull(orderId);
  if (!order) throw new NotFoundError('Order not found');
  if (order.customerId !== customerId) throw new ForbiddenError('This is not your order');

  // A customer only ever sees a version the admin sent to them.
  const visible = await designRepository.findLatestVisibleToCustomer(orderId);
  const design = visible
    ? await uploadService.presignFields(visible, [['fileKey', 'fileUrl']])
    : null;

  const items = await Promise.all(
    order.items.map(async (item) => ({
      ...item,
      customization: await uploadService.presignFields(item.customization, [['photoKey', 'photoUrl']]),
    })),
  );

  const revisionsUsed = order.customerRevisionCount;
  const revisionsLeft = Math.max(0, env.MAX_FREE_REVISIONS - revisionsUsed);

  return {
    ...order,
    items,
    design,
    payments: order.payments.map((p) => ({
      id: p.id,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt,
    })),
    progress: buildProgress(order.status),
    statusLabel: STATUS_LABEL[order.status] || order.status,
    timeline: buildTimeline(order.history),
    revisions: {
      used: revisionsUsed,
      left: revisionsLeft,
      max: env.MAX_FREE_REVISIONS,
      canRequestChanges: revisionsLeft > 0,
    },
    canApproveDesign: order.status === 'AWAITING_CUSTOMER_APPROVAL',
    canRetryPayment: order.status === 'PAYMENT_FAILED',
  };
}

// ------------------------------------------------------------- admin actions

/** Approve the photo and assign a designer: PLACED → DESIGN_ASSIGNED. */
async function adminApprove({ orderId, designerId, actor, note }) {
  const designer = await userService.requireActiveUserWithRole(designerId, 'DESIGNER', 'Designer');

  return orderWorkflowService.transition({
    orderId,
    to: 'DESIGN_ASSIGNED',
    actor,
    note: note || `Assigned to ${designer.name}`,
    extra: {
      expectedFrom: 'PLACED',
      data: { assignedDesignerId: designerId },
      afterCommit: async ({ order }) => {
        await notificationService.designerAssigned({ order, designer });
      },
    },
  });
}

/** Reject with a reason: PLACED → REJECTED, plus a full refund. */
async function adminReject({ orderId, reason, actor }) {
  return orderWorkflowService.transition({
    orderId,
    to: 'REJECTED',
    actor,
    note: reason,
    extra: {
      expectedFrom: 'PLACED',
      data: { rejectReason: reason },
      afterCommit: async ({ order }) => {
        await paymentService.refundOrder({ orderId: order.id, reason });
        const customer = await userRepository.findById(order.customerId);
        await notificationService.orderEnded({ order, customer, kind: 'rejected', reason });
      },
    },
  });
}

/** Cancel from any non-final status, with a refund when the order was paid. */
async function adminCancel({ orderId, reason, actor }) {
  return orderWorkflowService.transition({
    orderId,
    to: 'CANCELLED',
    actor,
    note: reason,
    extra: {
      data: { cancelReason: reason },
      afterCommit: async ({ order }) => {
        await paymentService.refundOrder({ orderId: order.id, reason });
        const customer = await userRepository.findById(order.customerId);
        await notificationService.orderEnded({ order, customer, kind: 'cancelled', reason });
      },
    },
  });
}

/** Swap the designer without moving the status. Writes a history row. */
async function adminReassignDesigner({ orderId, designerId, actor }) {
  const designer = await userService.requireActiveUserWithRole(designerId, 'DESIGNER', 'Designer');

  return orderWorkflowService.reassign({
    orderId,
    allowedStatuses: ['DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS'],
    data: { assignedDesignerId: designerId },
    actor,
    note: `Designer reassigned to ${designer.name}`,
    afterCommit: async ({ order }) => {
      await notificationService.designerAssigned({ order, designer });
    },
  });
}

// ---------------------------------------------------------- admin order views

async function adminList(filters) {
  const page = filters.page || 1;
  const pageSize = Math.min(filters.pageSize || PAGINATION.defaultPageSize, PAGINATION.maxPageSize);
  const { items, total } = await orderRepository.listForAdmin({ ...filters, page, pageSize });
  return {
    items: items.map((o) => ({ ...o, statusLabel: STATUS_LABEL[o.status] || o.status })),
    pagination: { page, pageSize, total },
  };
}

/** Full admin detail: versions, reviews, print job, payments and history. */
async function adminGet(orderId) {
  const order = await orderRepository.findByIdFull(orderId);
  if (!order) throw new NotFoundError('Order not found');

  const items = await Promise.all(
    order.items.map(async (item) => ({
      ...item,
      customization: await uploadService.presignFields(item.customization, [['photoKey', 'photoUrl']]),
    })),
  );

  const designVersions = await Promise.all(
    order.designVersions.map((v) => uploadService.presignFields(v, [['fileKey', 'fileUrl']])),
  );

  return {
    ...order,
    items,
    designVersions,
    statusLabel: STATUS_LABEL[order.status] || order.status,
    timeline: buildTimeline(order.history),
    availableActions: orderWorkflowService.availableActions(order, { role: 'ADMIN' }),
    revisions: {
      used: order.customerRevisionCount,
      max: env.MAX_FREE_REVISIONS,
      left: Math.max(0, env.MAX_FREE_REVISIONS - order.customerRevisionCount),
    },
  };
}

/** Status counts plus open jobs per designer and per printer. */
async function adminDashboard() {
  const [byStatus, load, designers, printers] = await Promise.all([
    orderRepository.countByStatus(),
    orderRepository.openJobsByAssignee(),
    userRepository.findManyByRole('DESIGNER'),
    userRepository.findManyByRole('PRINTER'),
  ]);

  const designerCounts = new Map(load.designers.map((d) => [d.userId, d.openJobs]));
  const printerCounts = new Map(load.printers.map((p) => [p.userId, p.openJobs]));

  // Every status appears, including the ones with no orders, so the UI can show
  // a card per status without guessing.
  const statusCounts = Object.keys(STATUS_LABEL).reduce((acc, status) => {
    acc[status] = byStatus[status] || 0;
    return acc;
  }, {});

  return {
    statusCounts,
    totalOrders: Object.values(statusCounts).reduce((a, b) => a + b, 0),
    designers: designers.map((d) => ({
      id: d.id,
      name: d.name,
      email: d.email,
      openJobs: designerCounts.get(d.id) || 0,
    })),
    printers: printers.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      openJobs: printerCounts.get(p.id) || 0,
    })),
  };
}

module.exports = {
  CUSTOMER_STEPS,
  STATUS_LABEL,
  createOrder,
  buildProgress,
  buildTimeline,
  currentStepIndex,
  listMine,
  getMine,
  adminApprove,
  adminReject,
  adminCancel,
  adminReassignDesigner,
  adminList,
  adminGet,
  adminDashboard,
};
