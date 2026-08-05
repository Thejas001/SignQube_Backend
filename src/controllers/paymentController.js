const asyncHandler = require("../utils/asyncHandler");
const orderService = require("../services/orderService");

const handleRazorpayWebhook = asyncHandler(async (req, res) => {
  const result = await orderService.handleRazorpayWebhook(
    req.body,
    req.headers["x-razorpay-signature"]
  );

  return res.status(200).json({
    success: true,
    message: "Razorpay webhook processed successfully",
    data: result,
    error: null,
  });
});

module.exports = {
  handleRazorpayWebhook,
};
