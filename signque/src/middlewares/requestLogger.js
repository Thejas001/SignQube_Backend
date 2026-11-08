'use strict';

/**
 * Request logs through morgan, routed into our logger so everything shares one
 * format. The Authorization header and cookies are never part of the line.
 */

const morgan = require('morgan');
const env = require('../config/env');
const logger = require('../utils/logger');

const format = ':method :url :status :res[content-length] - :response-time ms';

module.exports = morgan(format, {
  skip: () => env.isTest,
  stream: {
    write: (line) => logger.info(line.trim()),
  },
});
