const express = require("express");
const adminController = require("../controllers/adminController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminRoleMiddleware = require("../middlewares/adminRoleMiddleware");
const validate = require("../middlewares/validate");
const {
  adminLoginSchema,
  adminOrderIdParamSchema,
  adminOrderQuerySchema,
  adminOrderStatusSchema,
  adminProductCreateSchema,
  adminProductIdParamSchema,
  adminProductUpdateSchema,
  adminConversationQuerySchema,
  adminConversationIdParamSchema,
  adminConversationReplySchema,
  adminTestChatSchema,
  adminAgentSettingsUpdateSchema,
  adminAgentMetricsQuerySchema,
} = require("../validators/adminValidators");

const router = express.Router();

router.post("/login", validate(adminLoginSchema), adminController.login);

router.use(authMiddleware, adminRoleMiddleware);

router.get("/me", adminController.me);
router.get("/insights", adminController.getInsights);
router.get("/orders", validate(adminOrderQuerySchema), adminController.getOrders);
router.get("/orders/:id", validate(adminOrderIdParamSchema), adminController.getOrderById);
router.patch(
  "/orders/:id/status",
  validate(adminOrderStatusSchema),
  adminController.updateOrderStatus
);
router.get("/products", adminController.getProducts);
router.post("/products", validate(adminProductCreateSchema), adminController.createProduct);
router.patch(
  "/products/:id",
  validate(adminProductUpdateSchema),
  adminController.updateProduct
);

router.get(
  "/conversations",
  validate(adminConversationQuerySchema),
  adminController.getConversations
);
router.get(
  "/conversations/:id",
  validate(adminConversationIdParamSchema),
  adminController.getConversationById
);
router.post(
  "/conversations/:id/takeover",
  validate(adminConversationIdParamSchema),
  adminController.takeoverConversation
);
router.post(
  "/conversations/:id/release",
  validate(adminConversationIdParamSchema),
  adminController.releaseConversation
);
router.post(
  "/conversations/:id/reply",
  validate(adminConversationReplySchema),
  adminController.replyToConversation
);
router.post(
  "/conversations/:id/reengage",
  validate(adminConversationIdParamSchema),
  adminController.reengageConversation
);

router.post("/test-chat", validate(adminTestChatSchema), adminController.sendTestChatMessage);

router.get("/agent-settings", adminController.getAgentSettings);
router.get("/agent-metrics", validate(adminAgentMetricsQuerySchema), adminController.getAgentMetrics);
router.put(
  "/agent-settings",
  validate(adminAgentSettingsUpdateSchema),
  adminController.updateAgentSettings
);

module.exports = router;
