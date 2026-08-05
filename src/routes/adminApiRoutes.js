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

module.exports = router;
