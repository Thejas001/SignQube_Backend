const AppError = require("../utils/appError");

function adminRoleMiddleware(req, res, next) {
  if (!req.user || req.user.role !== "ADMIN") {
    return next(new AppError("Admin access required", 403));
  }

  return next();
}

module.exports = adminRoleMiddleware;
