const prisma = require("../prisma/client");
const AppError = require("../utils/appError");

function normalizeDetailImages(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAttributes(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePricingRules(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeAddons(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePricing(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function normalizeUploadConfig(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function mapProductSummary(product) {
  return {
    id: product.id,
    publicId: product.publicId,
    title: product.title,
    description: product.description,
    imageUrl: product.imageUrl,
    basePrice: Number(product.basePrice),
    ProductID: product.publicId,
    ProductName: product.title,
    Description: product.description,
    ProductImage: product.imageUrl,
  };
}

function mapProductDetail(product) {
  return {
    ProductID: product.publicId,
    ProductName: product.title,
    Description: product.description,
    ProductImage: product.imageUrl,
    ProductDetailsImages: normalizeDetailImages(product.detailImages),
    Attributes: normalizeAttributes(product.attributes),
    Pricing: normalizePricing(product.pricing),
    PricingRules: normalizePricingRules(product.pricingRules),
    Addons: normalizeAddons(product.addons),
    UploadConfig: normalizeUploadConfig(product.uploadConfig),
  };
}

async function getProducts() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { publicId: "asc" },
  });

  return products.map(mapProductSummary);
}

async function getProductById(productId) {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      isActive: true,
    },
  });

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  return {
    ...product,
    basePrice: Number(product.basePrice),
  };
}

async function getProductDetailsWithPricing(publicId) {
  const product = await prisma.product.findFirst({
    where: {
      publicId,
      isActive: true,
    },
  });

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  return mapProductDetail(product);
}

module.exports = {
  getProducts,
  getProductById,
  getProductDetailsWithPricing,
};
