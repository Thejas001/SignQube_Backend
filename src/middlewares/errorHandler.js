const { ZodError } = require("zod");
const { Prisma } = require("@prisma/client");
const multer = require("multer");
const { sendError } = require("../utils/apiResponse");

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, error);

  if (error instanceof ZodError) {
    const issues = error.errors.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));

    return sendError(
      res,
      issues[0]?.message ? `Validation failed: ${issues[0].message}` : "Validation failed",
      issues,
      400
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return sendError(res, "Database request failed", error.message, 400);
  }

  if (error instanceof multer.MulterError) {
    return sendError(res, "File upload failed", error.message, 400);
  }

  if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
    return sendError(res, "Invalid or expired token", error.message, 401);
  }

  const statusCode = error.statusCode || 500;
  const errorDetails = error.error || error.message || "Internal server error";

  return sendError(
    res,
    statusCode >= 500 ? "Something went wrong" : error.message,
    errorDetails,
    statusCode
  );
}

module.exports = errorHandler;
