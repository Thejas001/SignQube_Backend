'use strict';

/** Boot: validate env (on require), connect to the DB, start listening. */

const env = require('./config/env'); // exits the process if anything is invalid
const app = require('./app');
const { prisma } = require('./repositories/prisma');
const logger = require('./utils/logger');

async function start() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info('database connected');
  } catch (err) {
    logger.error('could not connect to the database', { message: err.message });
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    logger.info('SIGNQUE API listening', {
      port: env.PORT,
      env: env.NODE_ENV,
      docs: `http://localhost:${env.PORT}/docs`,
    });
  });

  const shutdown = async (signal) => {
    logger.info('shutting down', { signal });
    server.close(async () => {
      await prisma.$disconnect().catch(() => {});
      process.exit(0);
    });
    // Do not hang forever if a connection will not close.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled rejection', { reason: String(reason) });
  });
  process.on('uncaughtException', (err) => {
    logger.error('uncaught exception', { message: err.message, stack: err.stack });
    process.exit(1);
  });
}

start();
