const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const cartController = require("../controllers/cartController");
const {
  addCartItemSchema,
  updateCartItemSchema,
  cartItemIdParamSchema,
} = require("../validators/cartValidators");

const router = express.Router();

router.use(authMiddleware);
router.get("/", cartController.getCart);
router.post("/items", validate(addCartItemSchema), cartController.addCartItem);
router.patch("/items/:id", validate(updateCartItemSchema), cartController.updateCartItem);
router.delete("/items/:id", validate(cartItemIdParamSchema), cartController.removeCartItem);
router.delete("/", cartController.clearCart);

module.exports = router;
