'use strict';

/**
 * Error types the services throw. Only middlewares/errorHandler.js turns these
 * into HTTP responses — nothing else formats an error.
 */

class AppError extends Error {
  /**
   * @param {string} message human-readable, safe to show the client
   * @param {number} statusCode HTTP status
   * @param {string} code stable machine code, e.g. INVALID_TRANSITION
   * @param {any} [details] extra context (field errors, allowed values…)
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, new.target);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', details = null) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'You are not allowed to do that', details = null) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Not found', details = null) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict', details = null) {
    super(message, 409, 'CONFLICT', details);
  }
}

/** Thrown when a status change is not allowed by the transition table. */
class InvalidTransitionError extends AppError {
  constructor(message = 'That status change is not allowed', details = null) {
    super(message, 409, 'INVALID_TRANSITION', details);
  }
}

class TooManyRequestsError extends AppError {
  constructor(message = 'Too many requests', details = null) {
    super(message, 429, 'TOO_MANY_REQUESTS', details);
  }
}

class BadRequestError extends AppError {
  constructor(message = 'Bad request', details = null) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

module.exports = {
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  InvalidTransitionError,
  TooManyRequestsError,
  BadRequestError,
};
