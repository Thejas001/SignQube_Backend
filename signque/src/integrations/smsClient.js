'use strict';

/**
 * SMS behind an interface. The only implementation today is a console stub —
 * swap `send` for a real gateway without touching notificationService.
 */

const logger = require('../utils/logger');
const env = require('../config/env');

/**
 * @param {{ to: string, message: string }} args
 * @returns {Promise<{ providerId: string, stub: boolean }>}
 */
async function send({ to, message }) {
  if (!to) throw new Error('SMS needs a phone number');
  if (!env.isTest) {
    logger.info('sms (stub, not actually sent)', { to, length: message.length });
  }
  return { providerId: `stub-${Date.now()}`, stub: true };
}

module.exports = { send };
