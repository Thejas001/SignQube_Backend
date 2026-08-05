const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const productService = require("../services/productService");

const getProducts = asyncHandler(async (req, res) => {
  const products = await productService.getProducts();
  return sendSuccess(res, "Products fetched successfully", products);
});

const getProductById = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  return sendSuccess(res, "Product fetched successfully", product);
});

const getProductDetailsWithPricing = asyncHandler(async (req, res) => {
  const product = await productService.getProductDetailsWithPricing(req.params.publicId);
  return res.json(product);
});

module.exports = {
  getProducts,
  getProductById,
  getProductDetailsWithPricing,
};
