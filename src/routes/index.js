const express = require("express");
const authRoutes = require("./authRoutes");
const productRoutes = require("./productRoutes");
const uploadRoutes = require("./uploadRoutes");
const customizationRoutes = require("./customizationRoutes");
const cartRoutes = require("./cartRoutes");
const addressRoutes = require("./addressRoutes");
const orderRoutes = require("./orderRoutes");
const adminApiRoutes = require("./adminApiRoutes");
const { sendSuccess } = require("../utils/apiResponse");

const router = express.Router();

router.get("/health", (req, res) => {
  return sendSuccess(res, "SIGNQUE backend is healthy", {
    uptime: process.uptime(),
  });
});

router.use("/auth", authRoutes);
router.use("/products", productRoutes);
router.use("/uploads", uploadRoutes);
router.use("/customizations", customizationRoutes);
router.use("/cart", cartRoutes);
router.use("/addresses", addressRoutes);
router.use("/orders", orderRoutes);
router.use("/admin", adminApiRoutes);

module.exports = router;
