'use strict';

/**
 * The one PrismaClient for the process. Only files in repositories/ import this
 * — services compose transactions by passing the `tx` client down.
 */

// Load and validate the environment BEFORE @prisma/client, which reads the
// root .env on import.
const env = require('../config/env');

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient({
  // Passed explicitly, so the client can only ever reach the database our
  // validated env names — never one picked up from a stray .env.
  datasources: { db: { url: env.DATABASE_URL } },
  log: env.isTest ? [] : [{ emit: 'event', level: 'warn' }, { emit: 'event', level: 'error' }],
});

if (!env.isTest) {
  prisma.$on('warn', (e) => logger.warn('prisma', { message: e.message }));
  prisma.$on('error', (e) => logger.error('prisma', { message: e.message }));
}

/** Repository helper: use the transaction client when the caller passed one. */
function db(tx) {
  return tx || prisma;
}

module.exports = { prisma, db };
