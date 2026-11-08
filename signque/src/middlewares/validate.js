'use strict';

/**
 * Zod validation. Replaces req.body / req.query / req.params with the parsed
 * (coerced, stripped) values, so controllers never see an unvalidated field.
 *
 *   router.post('/', validate({ body: createOrderSchema }), controller.create)
 */

const { ValidationError } = require('../utils/errors');

function formatIssues(issues) {
  return issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * @param {{ body?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny,
 *           params?: import('zod').ZodTypeAny }} schemas
 */
function validate(schemas) {
  return function validator(req, res, next) {
    const allIssues = [];

    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) {
        // query and params are getters on newer Express; assign defensively.
        try {
          req[part] = result.data;
        } catch {
          Object.defineProperty(req, part, { value: result.data, writable: true, configurable: true });
        }
      } else {
        allIssues.push(...formatIssues(result.error.issues).map((i) => ({ ...i, in: part })));
      }
    }

    if (allIssues.length > 0) {
      return next(new ValidationError('Some fields are invalid', allIssues));
    }
    return next();
  };
}

module.exports = validate;
