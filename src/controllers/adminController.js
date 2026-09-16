const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const adminService = require("../services/adminService");
const agentSettingsService = require("../services/agentSettingsService");
const aiAgentService = require("../services/aiAgentService");
const agentMetricsService = require("../services/agentMetricsService");

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

const getConversations = asyncHandler(async (req, res) => {
  const conversations = await adminService.listConversations(req.query);
  return sendSuccess(res, "Conversations fetched successfully", conversations);
});

const getConversationById = asyncHandler(async (req, res) => {
  const conversation = await adminService.getConversationById(req.params.id);
  return sendSuccess(res, "Conversation fetched successfully", conversation);
});

const takeoverConversation = asyncHandler(async (req, res) => {
  const conversation = await adminService.takeoverConversation(req.params.id);
  return sendSuccess(res, "Conversation taken over", conversation);
});

const releaseConversation = asyncHandler(async (req, res) => {
  const conversation = await adminService.releaseConversation(req.params.id);
  return sendSuccess(res, "Conversation released back to the AI agent", conversation);
});

const replyToConversation = asyncHandler(async (req, res) => {
  const message = await adminService.replyToConversation(req.params.id, req.body.message);
  return sendSuccess(res, "Reply sent", message, 201);
});

const reengageConversation = asyncHandler(async (req, res) => {
  const message = await adminService.reengageConversation(req.params.id);
  return sendSuccess(res, "Re-engagement template sent", message, 201);
});

const sendTestChatMessage = asyncHandler(async (req, res) => {
  const conversation = await aiAgentService.handleTestChatMessage(
    req.body.conversationId || null,
    req.body.message
  );
  return sendSuccess(res, "Test message processed", conversation);
});

const getAgentSettings = asyncHandler(async (req, res) => {
  const settings = await agentSettingsService.getAgentSettings();
  return sendSuccess(res, "Agent settings fetched successfully", settings);
});

const getAgentMetrics = asyncHandler(async (req, res) => {
  const metrics = await agentMetricsService.getAgentMetrics({
    days: req.query.days,
    includeTest: req.query.includeTest,
  });
  return sendSuccess(res, "Agent metrics fetched successfully", metrics);
});

const updateAgentSettings = asyncHandler(async (req, res) => {
  const settings = await agentSettingsService.updateAgentSettings(req.body);
  return sendSuccess(res, "Agent settings updated successfully", settings);
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
  getConversations,
  getConversationById,
  takeoverConversation,
  releaseConversation,
  replyToConversation,
  reengageConversation,
  sendTestChatMessage,
  getAgentSettings,
  getAgentMetrics,
  updateAgentSettings,
};
