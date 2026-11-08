'use strict';

/**
 * The ONLY place an error becomes an HTTP response.
 *
 * AppError subclasses carry their own status and code. Everything else — Prisma
 * errors, multer errors, bugs — is mapped here, and an unexpected error never
 * leaks its internals to the client.
 */

const { Prisma } = require('@prisma/client');
const multer = require('multer');

const env = require('../config/env');
const logger = require('../utils/logger');
const { fail } = require('../utils/apiResponse');
const { AppError } = require('../utils/errors');

/** Prisma error codes worth a specific message. */
function fromPrisma(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return {
          statusCode: 409,
          code: 'DUPLICATE',
          message: 'That value is already taken',
          details: { fields: err.meta?.target ?? null },
        };
      case 'P2003':
        return {
          statusCode: 409,
          code: 'FOREIGN_KEY',
          message: 'That related record does not exist',
          details: { field: err.meta?.field_name ?? null },
        };
      case 'P2025':
        return { statusCode: 404, code: 'NOT_FOUND', message: 'Record not found', details: null };
      default:
        return null;
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return { statusCode: 400, code: 'BAD_REQUEST', message: 'The request could not be processed', details: null };
  }
  return null;
}

function fromMulter(err) {
  if (!(err instanceof multer.MulterError)) return null;
  const message =
    err.code === 'LIMIT_FILE_SIZE'
      ? 'That file is too large'
      : err.code === 'LIMIT_UNEXPECTED_FILE'
        ? `Unexpected file field "${err.field}"`
        : 'That upload could not be accepted';
  return { statusCode: 422, code: 'UPLOAD_ERROR', message, details: { reason: err.code } };
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // A CHECK constraint fired — the DB caught a value the API should have.
  const raw = String(err?.message || '');
  const checkViolation = raw.includes('violates check constraint');

  let mapped =
    err instanceof AppError
      ? {
          statusCode: err.statusCode,
          code: err.code,
          message: err.message,
          details: err.details,
        }
      : fromMulter(err) || fromPrisma(err);

  if (!mapped && checkViolation) {
    mapped = {
      statusCode: 422,
      code: 'CONSTRAINT_VIOLATION',
      message: 'That value is not allowed',
      details: null,
    };
  }

  if (!mapped) {
    mapped = {
      statusCode: err?.statusCode || 500,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on our side',
      details: env.isProduction ? null : { reason: raw },
    };
  }

  const logMeta = {
    method: req.method,
    path: req.originalUrl,
    statusCode: mapped.statusCode,
    code: mapped.code,
    userId: req.user?.id ?? null,
  };

  if (mapped.statusCode >= 500) {
    logger.error(mapped.message, { ...logMeta, stack: err?.stack });
  } else {
    logger.warn(mapped.message, logMeta);
  }

  return fail(res, mapped);
}

module.exports = errorHandler;
