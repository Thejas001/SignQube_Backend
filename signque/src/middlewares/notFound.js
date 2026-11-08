'use strict';

const { NotFoundError } = require('../utils/errors');

/** Anything that reached the end of the router is an unknown route. */
module.exports = function notFound(req, res, next) {
  next(new NotFoundError(`No route for ${req.method} ${req.originalUrl}`));
};
