const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const orderService = require("../services/orderService");

const createOrder = asyncHandler(async (req, res) => {
  const order = await orderService.createOrder(req.user.id, req.body);
  return sendSuccess(res, "Order created successfully", order, 201);
});

const verifyPayment = asyncHandler(async (req, res) => {
  const order = await orderService.verifyOrderPayment(req.user.id, req.params.id, req.body);
  return sendSuccess(res, "Payment verified successfully", order);
});

const getOrders = asyncHandler(async (req, res) => {
  const orders = await orderService.getOrders(req.user.id);
  return sendSuccess(res, "Orders fetched successfully", orders);
});

const getOrderById = asyncHandler(async (req, res) => {
  const order = await orderService.getOrderById(req.user.id, req.params.id);
  return sendSuccess(res, "Order fetched successfully", order);
});

module.exports = {
  createOrder,
  verifyPayment,
  getOrders,
  getOrderById,
};
