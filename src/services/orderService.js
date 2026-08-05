const { PaymentStatus } = require("@prisma/client");
const prisma = require("../prisma/client");
const AppError = require("../utils/appError");
const { calculateCartTotals, calculateLineTotal, toMoney } = require("../utils/price");
const { generateOrderNumber } = require("../utils/order");
const {
  createRazorpayOrder,
  getRazorpayConfig,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
} = require("../utils/razorpay");

function normalizeOrder(order) {
  return {
    ...order,
    subtotal: Number(order.subtotal),
    shippingFee: Number(order.shippingFee),
    totalAmount: Number(order.totalAmount),
    items: order.items.map((item) => ({
      ...item,
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
    })),
    payments: order.payments.map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
    })),
  };
}

function buildOrderInclude() {
  return {
    address: true,
    items: true,
    payments: true,
  };
}

function buildCheckoutPayload(order, payment) {
  if (!payment?.gatewayOrderId) {
    return null;
  }

  const { keyId, currency, companyName } = getRazorpayConfig();

  return {
    key: keyId,
    amount: Math.round(Number(payment.amount) * 100),
    currency,
    name: companyName,
    description: `Payment for order ${order.orderNumber}`,
    orderId: payment.gatewayOrderId,
    orderNumber: order.orderNumber,
    prefill: {
      name: order.address?.fullName || "",
      contact: order.address?.phone || "",
    },
    notes: {
      appOrderId: order.id,
      orderNumber: order.orderNumber,
    },
  };
}

async function findOrderWithPayment(where) {
  const order = await prisma.order.findFirst({
    where,
    include: {
      address: true,
      items: {
        include: {
          customization: true,
          product: true,
        },
      },
      payments: true,
    },
  });

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  return order;
}

async function createOrder(userId, payload) {
  const address = await prisma.address.findFirst({
    where: {
      id: payload.addressId,
      userId,
    },
  });

  if (!address) {
    throw new AppError("Address not found", 404);
  }

  const cartItems = await prisma.cartItem.findMany({
    where: { userId },
    include: {
      product: true,
      customization: true,
    },
  });

  if (cartItems.length === 0) {
    throw new AppError("Cart is empty", 400);
  }

  const inactiveItem = cartItems.find((item) => !item.product.isActive);

  if (inactiveItem) {
    throw new AppError("One or more items in the cart are no longer available", 400);
  }

  const pricedItems = cartItems.map((item) => ({
    ...item,
    unitPrice: Number(item.product.basePrice),
    lineTotal: calculateLineTotal(item.product.basePrice, item.quantity),
  }));

  const totals = calculateCartTotals(pricedItems);
  const orderNumber = generateOrderNumber();
  const needsOnlinePayment = payload.paymentMethod !== "COD";

  let razorpayOrder = null;

  if (needsOnlinePayment) {
    razorpayOrder = await createRazorpayOrder({
      amountInPaise: Math.round(totals.totalAmount * 100),
      receipt: orderNumber,
      notes: {
        userId,
        addressId: payload.addressId,
      },
    });
  }

  const order = await prisma.$transaction(async (tx) => {
    const createdOrder = await tx.order.create({
      data: {
        userId,
        addressId: payload.addressId,
        orderNumber,
        status: "PENDING",
        paymentMethod: payload.paymentMethod,
        subtotal: toMoney(totals.subtotal),
        shippingFee: toMoney(totals.shippingFee),
        totalAmount: toMoney(totals.totalAmount),
        items: {
          create: pricedItems.map((item) => ({
            productId: item.productId,
            customizationId: item.customizationId,
            productName: item.product.title,
            unitPrice: toMoney(item.unitPrice),
            quantity: item.quantity,
            lineTotal: toMoney(item.lineTotal),
          })),
        },
        payments: {
          create: [
            {
              method: payload.paymentMethod,
              status: PaymentStatus.PENDING,
              transactionRef: razorpayOrder?.id || null,
              gatewayOrderId: razorpayOrder?.id || null,
              amount: toMoney(totals.totalAmount),
              paidAt: null,
            },
          ],
        },
      },
      include: buildOrderInclude(),
    });

    await tx.cartItem.deleteMany({
      where: { userId },
    });

    return createdOrder;
  });

  const normalizedOrder = normalizeOrder(order);

  return {
    ...normalizedOrder,
    paymentSession: buildCheckoutPayload(normalizedOrder, normalizedOrder.payments[0]),
  };
}

async function getOrders(userId) {
  const orders = await prisma.order.findMany({
    where: { userId },
    include: {
      address: true,
      items: {
        include: {
          customization: true,
        },
      },
      payments: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return orders.map(normalizeOrder);
}

async function getOrderById(userId, orderId) {
  const order = await findOrderWithPayment({
    id: orderId,
    userId,
  });

  const normalizedOrder = normalizeOrder(order);

  return {
    ...normalizedOrder,
    paymentSession: buildCheckoutPayload(normalizedOrder, normalizedOrder.payments[0]),
  };
}

async function verifyOrderPayment(userId, orderId, payload) {
  const order = await findOrderWithPayment({
    id: orderId,
    userId,
  });
  const payment = order.payments[0];

  if (!payment) {
    throw new AppError("Payment record not found for order", 404);
  }

  if (payment.method === "COD") {
    throw new AppError("COD orders do not support Razorpay verification", 400);
  }

  if (payment.gatewayOrderId !== payload.razorpayOrderId) {
    throw new AppError("Razorpay order mismatch", 400);
  }

  const isSignatureValid = verifyRazorpayPaymentSignature(payload);

  if (!isSignatureValid) {
    throw new AppError("Invalid Razorpay payment signature", 400);
  }

  const updatedOrder = await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.SUCCESS,
        transactionRef: payload.razorpayPaymentId,
        gatewayPaymentId: payload.razorpayPaymentId,
        gatewaySignature: payload.razorpaySignature,
        paidAt: new Date(),
      },
    });

    return tx.order.update({
      where: { id: order.id },
      data: {
        status: "PROCESSING",
      },
      include: {
        address: true,
        items: {
          include: {
            customization: true,
            product: true,
          },
        },
        payments: true,
      },
    });
  });

  return normalizeOrder(updatedOrder);
}

function parseWebhookEvent(rawBodyBuffer) {
  try {
    return JSON.parse(rawBodyBuffer.toString("utf8"));
  } catch (error) {
    throw new AppError("Invalid Razorpay webhook payload", 400);
  }
}

async function handleRazorpayWebhook(rawBodyBuffer, signature) {
  const rawBody = rawBodyBuffer.toString("utf8");

  if (!signature) {
    throw new AppError("Missing Razorpay webhook signature", 400);
  }

  const isSignatureValid = verifyRazorpayWebhookSignature(rawBody, signature);

  if (!isSignatureValid) {
    throw new AppError("Invalid Razorpay webhook signature", 400);
  }

  const event = parseWebhookEvent(rawBodyBuffer);
  const paymentEntity = event.payload?.payment?.entity || null;
  const orderEntity = event.payload?.order?.entity || null;
  const refundEntity = event.payload?.refund?.entity || null;
  const gatewayOrderId = paymentEntity?.order_id || orderEntity?.id || refundEntity?.notes?.razorpay_order_id;
  const gatewayPaymentId = paymentEntity?.id || refundEntity?.payment_id || null;

  if (!gatewayOrderId && !gatewayPaymentId) {
    return { processed: false, reason: "No Razorpay identifiers in webhook payload" };
  }

  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        gatewayOrderId ? { gatewayOrderId } : undefined,
        gatewayPaymentId ? { gatewayPaymentId } : undefined,
      ].filter(Boolean),
    },
    include: {
      order: true,
    },
  });

  if (!payment) {
    return { processed: false, reason: "Matching payment not found" };
  }

  const updateData = {
    gatewayOrderId: gatewayOrderId || payment.gatewayOrderId,
    gatewayPaymentId: gatewayPaymentId || payment.gatewayPaymentId,
  };
  let orderStatus = payment.order.status;

  if (event.event === "payment.failed") {
    updateData.status = PaymentStatus.FAILED;
  }

  if (event.event === "refund.processed") {
    updateData.status = PaymentStatus.REFUNDED;
  }

  if (event.event === "payment.captured" || event.event === "order.paid") {
    updateData.status = PaymentStatus.SUCCESS;
    updateData.transactionRef = gatewayPaymentId || payment.transactionRef;
    updateData.paidAt = payment.paidAt || new Date();
    orderStatus = "PROCESSING";
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: updateData,
    });

    if (orderStatus !== payment.order.status) {
      await tx.order.update({
        where: { id: payment.orderId },
        data: { status: orderStatus },
      });
    }
  });

  return {
    processed: true,
    event: event.event,
    paymentId: payment.id,
    orderId: payment.orderId,
  };
}

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  verifyOrderPayment,
  handleRazorpayWebhook,
};
