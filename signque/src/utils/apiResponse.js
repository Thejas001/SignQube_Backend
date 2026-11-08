'use strict';

/**
 * Every response in the API has this shape:
 *   { success, message, data, error: { code, details } | null }
 */

function ok(res, data = null, message = 'OK', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    error: null,
  });
}

function created(res, data = null, message = 'Created') {
  return ok(res, data, message, 201);
}

function noContent(res, message = 'Deleted') {
  return ok(res, null, message, 200);
}

function fail(res, { statusCode = 500, message = 'Something went wrong', code = 'INTERNAL_ERROR', details = null }) {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    error: { code, details },
  });
}

/** Shape for every paginated list endpoint. */
function paginated(res, items, { page, pageSize, total }, message = 'OK') {
  return ok(res, {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
    },
  }, message);
}

module.exports = { ok, created, noContent, fail, paginated };
