'use strict';

/**
 * Notifications. Every event writes an IN_APP row and an EMAIL row, and sends
 * through the SMS stub when the recipient has a phone number.
 *
 * `dispatch` is always called AFTER the workflow transaction has committed. It
 * never throws: a failed email marks that notification FAILED and is logged,
 * because an email must not be able to undo a status change.
 */

const notificationRepository = require('../repositories/notificationRepository');
const userRepository = require('../repositories/userRepository');
const mailClient = require('../integrations/mailClient');
const smsClient = require('../integrations/smsClient');
const logger = require('../utils/logger');
const { NotFoundError } = require('../utils/errors');

/**
 * @typedef {object} Recipient
 * @property {number} id
 * @property {string} email
 * @property {string} role
 * @property {string|null} [phone]
 */

/**
 * Write and send one notification to one user.
 *
 * @param {object} args
 * @param {Recipient} args.user
 * @param {object} args.order  needs id and orderNumber
 * @param {string} args.type   NOTIFICATION_TYPE value
 * @param {string} args.title
 * @param {string} args.message
 * @param {string} [args.statusLine] shown as the chip in the email
 * @param {boolean} [args.sms] also push through the SMS stub
 */
async function notifyUser({ user, order, type, title, message, statusLine, sms = false }) {
  const orderId = order?.id ?? null;
  const orderNumber = order?.orderNumber;

  // In-app row: the user's bell. Written as SENT immediately — it is just a row.
  const inApp = await notificationRepository.create({
    userId: user.id,
    orderId,
    type,
    title,
    message,
    channel: 'IN_APP',
    status: 'SENT',
  });

  // Email row starts PENDING and is settled by the send below.
  const emailRow = await notificationRepository.create({
    userId: user.id,
    orderId,
    type,
    title,
    message,
    channel: 'EMAIL',
    status: 'PENDING',
  });

  try {
    await mailClient.sendOrderMail({
      to: user.email,
      title,
      statusLine: statusLine || title,
      body: message,
      orderNumber,
      orderId,
      role: user.role,
    });
    await notificationRepository.setStatus(emailRow.id, 'SENT');
  } catch (err) {
    logger.error('notification email failed', {
      notificationId: emailRow.id,
      userId: user.id,
      type,
      message: err.message,
    });
    await notificationRepository.setStatus(emailRow.id, 'FAILED').catch(() => {});
  }

  if (sms && user.phone) {
    const smsRow = await notificationRepository.create({
      userId: user.id,
      orderId,
      type,
      title,
      message,
      channel: 'SMS',
      status: 'PENDING',
    });
    try {
      await smsClient.send({ to: user.phone, message: `${title}: ${message}` });
      await notificationRepository.setStatus(smsRow.id, 'SENT');
    } catch (err) {
      logger.error('notification sms failed', { notificationId: smsRow.id, message: err.message });
      await notificationRepository.setStatus(smsRow.id, 'FAILED').catch(() => {});
    }
  }

  return { inAppId: inApp.id, emailId: emailRow.id };
}

/**
 * Fan out to several users. Never throws — one bad recipient does not stop the
 * others.
 *
 * @param {Recipient[]} users
 */
async function notifyMany(users, payload) {
  const results = await Promise.allSettled(
    (users || []).filter(Boolean).map((user) => notifyUser({ ...payload, user })),
  );
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) {
    logger.error('some notifications failed', {
      type: payload.type,
      failed: failed.length,
      of: results.length,
    });
  }
  return results;
}

/** Every active admin, as notification recipients. */
async function getAdmins() {
  return userRepository.findManyByRole('ADMIN');
}

async function notifyAdmins(payload) {
  const admins = await getAdmins();
  return notifyMany(admins, payload);
}

// --------------------------------------------------------------- the events
// One function per row of the notification table in the spec.

async function orderPlaced({ order, customer }) {
  await notifyAdmins({
    order,
    type: 'ORDER_PLACED',
    title: 'New order is waiting for review',
    statusLine: 'Status: Placed',
    message: `New order ${order.orderNumber} is waiting for review.`,
  });
  await notifyUser({
    user: customer,
    order,
    type: 'ORDER_RECEIVED',
    title: 'We received your order',
    statusLine: 'Status: Placed',
    message: `We received your order ${order.orderNumber}. Our team will review it shortly.`,
    sms: true,
  });
}

async function designerAssigned({ order, designer }) {
  await notifyUser({
    user: designer,
    order,
    type: 'DESIGNER_ASSIGNED',
    title: 'New design job',
    statusLine: 'Status: Design assigned',
    message: `New design job ${order.orderNumber}.`,
  });
}

async function designSubmitted({ order, versionNo }) {
  await notifyAdmins({
    order,
    type: 'DESIGN_SUBMITTED',
    title: 'A design is ready to check',
    statusLine: 'Status: Design submitted',
    message: `Design v${versionNo} for ${order.orderNumber} is ready to check.`,
  });
}

async function designSentBack({ order, designer, note }) {
  await notifyUser({
    user: designer,
    order,
    type: 'DESIGN_SENT_BACK',
    title: 'Changes needed on a design',
    statusLine: 'Status: Design in progress',
    message: `Changes needed on ${order.orderNumber}: ${note}`,
  });
}

async function designReadyForCustomer({ order, customer }) {
  await notifyUser({
    user: customer,
    order,
    type: 'DESIGN_READY_FOR_CUSTOMER',
    title: 'Your design is ready',
    statusLine: 'Status: Awaiting your approval',
    message: 'Your design is ready. Please review and approve.',
    sms: true,
  });
}

async function customerRequestedChanges({ order, designer, comment }) {
  const message = `Customer asked for changes on ${order.orderNumber}: ${comment}`;
  const payload = {
    order,
    type: 'CUSTOMER_REQUESTED_CHANGES',
    title: 'Customer asked for changes',
    statusLine: 'Status: Design in progress',
    message,
  };
  if (designer) await notifyUser({ ...payload, user: designer });
  await notifyAdmins(payload);
}

async function customerApproved({ order }) {
  await notifyAdmins({
    order,
    type: 'CUSTOMER_APPROVED',
    title: 'Design approved by the customer',
    statusLine: 'Status: Customer approved',
    message: `${order.orderNumber} design approved. Assign for printing.`,
  });
}

async function printAssigned({ order, printer, spec }) {
  await notifyUser({
    user: printer,
    order,
    type: 'PRINT_ASSIGNED',
    title: 'New print job',
    statusLine: 'Status: Print assigned',
    message: `New print job ${order.orderNumber} (${spec.color}, ${spec.thicknessMm} mm, ${spec.size}).`,
  });
}

async function orderCompleted({ order, customer }) {
  await notifyUser({
    user: customer,
    order,
    type: 'ORDER_COMPLETED',
    title: 'Your order is complete',
    statusLine: 'Status: Completed',
    message: `Your order ${order.orderNumber} is complete.`,
    sms: true,
  });
}

/** @param {'rejected'|'cancelled'} kind */
async function orderEnded({ order, customer, kind, reason }) {
  await notifyUser({
    user: customer,
    order,
    type: kind === 'rejected' ? 'ORDER_REJECTED' : 'ORDER_CANCELLED',
    title: `Your order was ${kind}`,
    statusLine: `Status: ${kind === 'rejected' ? 'Rejected' : 'Cancelled'}`,
    message: `Your order ${order.orderNumber} was ${kind}: ${reason}. A refund has been started.`,
    sms: true,
  });
}

// --------------------------------------------------------------- user-facing

async function listForUser({ userId, unreadOnly }) {
  const [items, unreadCount] = await Promise.all([
    notificationRepository.listForUser({ userId, unreadOnly }),
    notificationRepository.countUnread(userId),
  ]);
  return { items, unreadCount };
}

async function markRead({ id, userId }) {
  const count = await notificationRepository.markRead(id, userId);
  if (count === 0) throw new NotFoundError('Notification not found');
  return { id, isRead: true };
}

async function markAllRead(userId) {
  const { count } = await notificationRepository.markAllRead(userId);
  return { updated: count };
}

module.exports = {
  notifyUser,
  notifyMany,
  notifyAdmins,
  getAdmins,
  orderPlaced,
  designerAssigned,
  designSubmitted,
  designSentBack,
  designReadyForCustomer,
  customerRequestedChanges,
  customerApproved,
  printAssigned,
  orderCompleted,
  orderEnded,
  listForUser,
  markRead,
  markAllRead,
};
