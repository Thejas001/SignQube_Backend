function sendSuccess(res, message, data = null, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    error: null,
  });
}

function sendError(res, message, error = null, statusCode = 500) {
  return res.status(statusCode).json({
    success: false,
    message,
    data: null,
    error,
  });
}

module.exports = {
  sendSuccess,
  sendError,
};
