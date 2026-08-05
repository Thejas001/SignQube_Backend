const prisma = require("../prisma/client");
const AppError = require("../utils/appError");
const { calculateCartTotals } = require("../utils/price");
const { getProductLookupWhere } = require("../utils/productIdentifier");

const cartInclude = {
  product: true,
  customization: true,
};

function transformCartItem(item) {
  return {
    ...item,
    unitPrice: Number(item.unitPrice),
    product: {
      ...item.product,
      basePrice: Number(item.product.basePrice),
    },
  };
}

async function getCart(userId) {
  const items = await prisma.cartItem.findMany({
    where: { userId },
    include: cartInclude,
    orderBy: { createdAt: "desc" },
  });

  const normalizedItems = items.map(transformCartItem);

  return {
    items: normalizedItems,
    totals: calculateCartTotals(normalizedItems),
  };
}

async function addCartItem(userId, payload) {
  const product = await prisma.product.findFirst({
    where: {
      isActive: true,
      ...getProductLookupWhere(payload.productId),
    },
  });

  if (!product) {
    throw new AppError("Product not found", 404);
  }

  if (payload.customizationId) {
    const customization = await prisma.customization.findFirst({
      where: {
        id: payload.customizationId,
        userId,
        productId: product.id,
      },
    });

    if (!customization) {
      throw new AppError("Customization not found for this user and product", 404);
    }
  }

  await prisma.cartItem.create({
    data: {
      userId,
      productId: product.id,
      customizationId: payload.customizationId || null,
      quantity: payload.quantity,
      unitPrice: product.basePrice,
    },
  });

  return getCart(userId);
}

async function updateCartItem(userId, cartItemId, payload) {
  const item = await prisma.cartItem.findFirst({
    where: {
      id: cartItemId,
      userId,
    },
  });

  if (!item) {
    throw new AppError("Cart item not found", 404);
  }

  await prisma.cartItem.update({
    where: { id: cartItemId },
    data: { quantity: payload.quantity },
  });

  return getCart(userId);
}

async function removeCartItem(userId, cartItemId) {
  const item = await prisma.cartItem.findFirst({
    where: {
      id: cartItemId,
      userId,
    },
  });

  if (!item) {
    throw new AppError("Cart item not found", 404);
  }

  await prisma.cartItem.delete({ where: { id: cartItemId } });
  return getCart(userId);
}

async function clearCart(userId) {
  await prisma.cartItem.deleteMany({
    where: { userId },
  });

  return {
    items: [],
    totals: calculateCartTotals([]),
  };
}

module.exports = {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
};
