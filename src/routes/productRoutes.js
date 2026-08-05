const express = require("express");
const productController = require("../controllers/productController");
const validate = require("../middlewares/validate");
const {
  productIdParamSchema,
  productPublicIdParamSchema,
} = require("../validators/productValidators");

const router = express.Router();

router.get("/", productController.getProducts);
router.get(
  "/details-with-pricing/:publicId",
  validate(productPublicIdParamSchema),
  productController.getProductDetailsWithPricing
);
router.get("/:id", validate(productIdParamSchema), productController.getProductById);

module.exports = router;
