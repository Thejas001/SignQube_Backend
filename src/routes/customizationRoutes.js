const express = require("express");
const authMiddleware = require("../middlewares/authMiddleware");
const validate = require("../middlewares/validate");
const customizationController = require("../controllers/customizationController");
const { createCustomizationSchema } = require("../validators/customizationValidators");

const router = express.Router();

router.post(
  "/",
  authMiddleware,
  validate(createCustomizationSchema),
  customizationController.createCustomization
);

module.exports = router;
