const bcrypt = require("bcrypt");
const { OrderStatus } = require("@prisma/client");
const prisma = require("../prisma/client");
const AppError = require("../utils/appError");
const { signAccessToken, signRefreshToken } = require("../utils/jwt");
const { parseExpiryToDate } = require("../utils/token");
const env = require("../config/env");
const crypto = require("crypto");

function toNumber(value) {
  return value == null ? null : Number(value);
}

function normalizeProduct(product) {
  return {
    ...product,
    basePrice: toNumber(product.basePrice),
    detailImages: Array.isArray(product.detailImages) ? product.detailImages : [],
    attributes: Array.isArray(product.attributes) ? product.attributes : [],
    pricing: product.pricing && typeof product.pricing === "object" ? product.pricing : null,
    pricingRules: Array.isArray(product.pricingRules) ? product.pricingRules : [],
    addons: Array.isArray(product.addons) ? product.addons : [],
    uploadConfig:
      product.uploadConfig && typeof product.uploadConfig === "object" ? product.uploadConfig : null,
  };
}

function normalizeOrder(order) {
  return {
    ...order,
    subtotal: toNumber(order.subtotal),
    shippingFee: toNumber(order.shippingFee),
    totalAmount: toNumber(order.totalAmount),
    items: order.items.map((item) => ({
      ...item,
      unitPrice: toNumber(item.unitPrice),
      lineTotal: toNumber(item.lineTotal),
    })),
    payments: order.payments.map((payment) => ({
      ...payment,
      amount: toNumber(payment.amount),
    })),
  };
}

function normalizeOrderSummary(order) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    totalAmount: toNumber(order.totalAmount),
    createdAt: order.createdAt,
  };
}

async function issueAdminTokens(userId) {
  const tokenId = crypto.randomUUID();
  const accessToken = signAccessToken({ userId, tokenId });
  const refreshToken = signRefreshToken({ userId, tokenId });

  await prisma.refreshToken.create({
    data: {
      userId,
      token: refreshToken,
      expiresAt: parseExpiryToDate(env.refreshTokenExpiresIn),
    },
  });

  return { accessToken, refreshToken };
}

async function login(payload) {
  const user = await prisma.user.findUnique({
    where: { email: payload.email.toLowerCase() },
  });

  if (!user || user.role !== "ADMIN") {
    throw new AppError("Invalid admin credentials", 401);
  }

  const isPasswordValid = await bcrypt.compare(payload.password, user.passwordHash);

  if (!isPasswordValid) {
    throw new AppError("Invalid admin credentials", 401);
  }

  const tokens = await issueAdminTokens(user.id);

  return {
    ...tokens,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  };
}

async function getInsights() {
  const [
    orderCount,
    productCount,
    activeProductCount,
    totalRevenue,
    pendingOrderCount,
    recentOrders,
    statusGroups,
    dailySales,
    topProducts,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.product.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.order.aggregate({
      _sum: { totalAmount: true },
    }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.order.groupBy({
      by: ["status"],
      _count: { status: true },
    }),
    prisma.order.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      select: {
        createdAt: true,
        totalAmount: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.orderItem.groupBy({
      by: ["productName"],
      _sum: {
        quantity: true,
        lineTotal: true,
      },
      orderBy: {
        _sum: {
          lineTotal: "desc",
        },
      },
      take: 5,
    }),
  ]);

  const revenueValue = toNumber(totalRevenue._sum.totalAmount) || 0;
  const averageOrderValue = orderCount > 0 ? revenueValue / orderCount : 0;

  const salesByDay = Object.values(
    dailySales.reduce((accumulator, order) => {
      const label = order.createdAt.toISOString().slice(0, 10);

      if (!accumulator[label]) {
        accumulator[label] = { date: label, revenue: 0, orders: 0 };
      }

      accumulator[label].revenue += toNumber(order.totalAmount) || 0;
      accumulator[label].orders += 1;
      return accumulator;
    }, {})
  );

  return {
    metrics: {
      orderCount,
      productCount,
      activeProductCount,
      pendingOrderCount,
      totalRevenue: revenueValue,
      averageOrderValue,
    },
    orderStatusBreakdown: statusGroups.map((group) => ({
      status: group.status,
      count: group._count.status,
    })),
    salesByDay,
    topProducts: topProducts.map((product) => ({
      productName: product.productName,
      quantitySold: product._sum.quantity || 0,
      revenue: toNumber(product._sum.lineTotal) || 0,
    })),
    recentOrders: recentOrders.map((order) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      status: order.status,
      totalAmount: toNumber(order.totalAmount),
      createdAt: order.createdAt,
      user: order.user,
    })),
  };
}

async function getOrders(filters = {}) {
  const where = {};
  const page = Math.max(Number(filters.page) || 1, 1);
  const limit = Math.min(Math.max(Number(filters.limit) || 10, 1), 50);
  const skip = (page - 1) * limit;

  if (filters.status && filters.status !== "ALL") {
    where.status = filters.status;
  }

  if (filters.search) {
    where.OR = [
      { orderNumber: { contains: filters.search, mode: "insensitive" } },
      { user: { name: { contains: filters.search, mode: "insensitive" } } },
      { user: { email: { contains: filters.search, mode: "insensitive" } } },
    ];
  }

  const [totalItems, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
          },
        },
        address: true,
        items: true,
        payments: true,
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
  ]);

  return {
    items: orders.map(normalizeOrder),
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.max(Math.ceil(totalItems / limit), 1),
      hasNextPage: skip + orders.length < totalItems,
      hasPreviousPage: page > 1,
    },
  };
}

async function getOrderById(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      address: true,
      items: {
        include: {
          product: true,
          customization: true,
        },
      },
      payments: true,
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  const previousOrders = await prisma.order.findMany({
    where: {
      userId: order.userId,
      NOT: { id: order.id },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalAmount: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 6,
  });

  return {
    ...normalizeOrder(order),
    previousOrders: previousOrders.map(normalizeOrderSummary),
  };
}

async function updateOrderStatus(orderId, status) {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError("Order not found", 404);
  }

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
      address: true,
      items: true,
      payments: true,
    },
  });

  return normalizeOrder(order);
}

async function getProducts() {
  const products = await prisma.product.findMany({
    include: {
      _count: {
        select: {
          orderItems: true,
          cartItems: true,
          customizations: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return products.map(normalizeProduct);
}

async function createProduct(payload) {
  const product = await prisma.product.create({
    data: {
      title: payload.title,
      description: payload.description || null,
      basePrice: payload.basePrice,
      imageUrl: payload.imageUrl || null,
      detailImages: payload.detailImages,
      attributes: payload.attributes,
      pricing: payload.pricing,
      pricingRules: payload.pricingRules,
      addons: payload.addons,
      uploadConfig: payload.uploadConfig,
      isActive: payload.isActive,
    },
  });

  return normalizeProduct(product);
}

async function updateProduct(productId, payload) {
  const existing = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });

  if (!existing) {
    throw new AppError("Product not found", 404);
  }

  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(payload.title !== undefined ? { title: payload.title } : {}),
      ...(payload.description !== undefined ? { description: payload.description || null } : {}),
      ...(payload.basePrice !== undefined ? { basePrice: payload.basePrice } : {}),
      ...(payload.imageUrl !== undefined ? { imageUrl: payload.imageUrl || null } : {}),
      ...(payload.detailImages !== undefined ? { detailImages: payload.detailImages } : {}),
      ...(payload.attributes !== undefined ? { attributes: payload.attributes } : {}),
      ...(payload.pricing !== undefined ? { pricing: payload.pricing } : {}),
      ...(payload.pricingRules !== undefined ? { pricingRules: payload.pricingRules } : {}),
      ...(payload.addons !== undefined ? { addons: payload.addons } : {}),
      ...(payload.uploadConfig !== undefined ? { uploadConfig: payload.uploadConfig } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
    },
  });

  return normalizeProduct(product);
}

module.exports = {
  login,
  getInsights,
  getOrders,
  getOrderById,
  updateOrderStatus,
  getProducts,
  createProduct,
  updateProduct,
  orderStatuses: Object.values(OrderStatus),
};
