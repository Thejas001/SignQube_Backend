const prisma = require("../prisma/client");
const AppError = require("../utils/appError");
const { getProductLookupWhere } = require("../utils/productIdentifier");

async function createCustomization(userId, payload) {
  const product = await prisma.product.findFirst({
    where: {
      isActive: true,
      ...getProductLookupWhere(payload.productId),
    },
  });

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  const customization = await prisma.customization.create({
    data: {
      userId,
      productId: product.id,
      uploadedImageUrl: payload.uploadedImageUrl,
      previewImageUrl: payload.previewImageUrl || null,
      quantity: payload.quantity,
      notes: payload.notes || null,
    },
    include: {
      product: true,
    },
  });

  return {
    ...customization,
    product: {
      ...customization.product,
      basePrice: Number(customization.product.basePrice),
    },
  };
}

module.exports = {
  createCustomization,
};
