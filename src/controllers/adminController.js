const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const adminService = require("../services/adminService");

const login = asyncHandler(async (req, res) => {
  const result = await adminService.login(req.body);
  return sendSuccess(res, "Admin login successful", result);
});

const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, "Admin profile fetched successfully", req.user);
});

const getInsights = asyncHandler(async (req, res) => {
  const insights = await adminService.getInsights();
  return sendSuccess(res, "Admin insights fetched successfully", insights);
});

const getOrders = asyncHandler(async (req, res) => {
  const orders = await adminService.getOrders(req.query);
  return sendSuccess(res, "Admin orders fetched successfully", orders);
});

const getOrderById = asyncHandler(async (req, res) => {
  const order = await adminService.getOrderById(req.params.id);
  return sendSuccess(res, "Admin order fetched successfully", order);
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const order = await adminService.updateOrderStatus(req.params.id, req.body.status);
  return sendSuccess(res, "Order status updated successfully", order);
});

const getProducts = asyncHandler(async (req, res) => {
  const products = await adminService.getProducts();
  return sendSuccess(res, "Admin products fetched successfully", products);
});

const createProduct = asyncHandler(async (req, res) => {
  const product = await adminService.createProduct(req.body);
  return sendSuccess(res, "Product created successfully", product, 201);
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await adminService.updateProduct(req.params.id, req.body);
  return sendSuccess(res, "Product updated successfully", product);
});

module.exports = {
  login,
  me,
  getInsights,
  getOrders,
  getOrderById,
  updateOrderStatus,
  getProducts,
  createProduct,
  updateProduct,
};
