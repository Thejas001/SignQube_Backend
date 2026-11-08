'use strict';

/** Wraps an async controller so a rejected promise reaches the error handler. */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
