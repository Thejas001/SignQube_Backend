const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const orderController = require("../controllers/orderController");
const {
  createOrderSchema,
  orderIdParamSchema,
  verifyPaymentSchema,
} = require("../validators/orderValidators");

const router = express.Router();

router.use(authMiddleware);
router.post("/", validate(createOrderSchema), orderController.createOrder);
router.post("/:id/verify-payment", validate(verifyPaymentSchema), orderController.verifyPayment);
router.get("/", orderController.getOrders);
router.get("/:id", validate(orderIdParamSchema), orderController.getOrderById);

module.exports = router;
