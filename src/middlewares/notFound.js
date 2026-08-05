const { sendError } = require("../utils/apiResponse");

function notFound(req, res) {
  return sendError(res, "Route not found", { path: req.originalUrl }, 404);
}

module.exports = notFound;
