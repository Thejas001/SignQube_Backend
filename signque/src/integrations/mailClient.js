'use strict';

/**
 * SMTP email through Nodemailer.
 *
 * A send that fails must never roll a status change back — notificationService
 * calls this after the transaction has committed and records FAILED on error.
 */

const nodemailer = require('nodemailer');

const env = require('../config/env');
const logger = require('../utils/logger');
const templates = require('./mail/templates');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return transporter;
}

/**
 * @param {{ to: string, title: string, statusLine: string, body: string,
 *           orderNumber?: string, orderId?: number, role?: string }} args
 * @returns {Promise<{ messageId: string }>}
 */
async function sendOrderMail({ to, title, statusLine, body, orderNumber, orderId, role }) {
  const { subject, html, text } = templates.render({ title, statusLine, body, orderNumber, orderId, role });

  // In tests nothing leaves the process.
  if (env.isTest) {
    logger.debug('mail suppressed in test', { to, subject });
    return { messageId: 'test-suppressed' };
  }

  const info = await getTransporter().sendMail({
    from: env.MAIL_FROM,
    to,
    subject,
    text,
    html,
  });
  logger.info('mail sent', { to, subject, messageId: info.messageId });
  return { messageId: info.messageId };
}

module.exports = { sendOrderMail, getTransporter };
