class AppError extends Error {
  constructor(message, statusCode = 500, error = null) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.error = error;
  }
}

module.exports = AppError;
