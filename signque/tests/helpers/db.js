'use strict';

/**
 * Test database helpers. The suite runs against a separate PostgreSQL database
 * (DATABASE_URL in .env.test) and truncates between tests rather than dropping
 * the schema, so the CHECK constraints and the order-number sequence stay in
 * place and are genuinely exercised.
 */

const bcrypt = require('bcrypt');
const env = require('../../src/config/env');
const { prisma } = require('../../src/repositories/prisma');

// Hard stop: this file TRUNCATEs every table, so refuse to run against
// anything that is not obviously a test database.
const DB_NAME = (() => {
  try {
    return new URL(env.DATABASE_URL).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
})();

if (!/_test$/.test(DB_NAME)) {
  throw new Error(
    `Refusing to run the test suite against database "${DB_NAME}". ` +
      'DATABASE_URL in .env.test must point at a database whose name ends in "_test".',
  );
}

/** Child tables first is unnecessary with CASCADE, but the order documents the graph. */
const TABLES = [
  'notifications',
  'order_status_history',
  'design_reviews',
  'design_versions',
  'print_jobs',
  'payment_events',
  'payments',
  'order_items',
  'orders',
  'customizations',
  'addresses',
  'products',
  'refresh_tokens',
  'users',
];

async function resetDatabase() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
  );
  // The order number sequence is a standalone object, so reset it too.
  await prisma.$executeRawUnsafe(`ALTER SEQUENCE "order_number_seq" RESTART WITH 1`);
}

async function disconnect() {
  await prisma.$disconnect();
}

// --------------------------------------------------------------- fixtures

const PASSWORD = 'Test@1234';
let passwordHashCache = null;

async function hashedPassword() {
  if (!passwordHashCache) passwordHashCache = await bcrypt.hash(PASSWORD, 12);
  return passwordHashCache;
}

let emailCounter = 0;

async function createUser({ role = 'CUSTOMER', name, email, phone = '+91 90000 00000', isActive = true } = {}) {
  emailCounter += 1;
  return prisma.user.create({
    data: {
      name: name || `${role.toLowerCase()}-${emailCounter}`,
      email: email || `${role.toLowerCase()}${emailCounter}@test.local`,
      phone,
      role,
      isActive,
      passwordHash: await hashedPassword(),
    },
  });
}

function createProduct({ title = 'Test frame', basePrice = '1000.00', isActive = true } = {}) {
  return prisma.product.create({ data: { title, basePrice, isActive } });
}

function createAddress(userId) {
  return prisma.address.create({
    data: {
      userId,
      fullName: 'Test Person',
      phone: '+91 90000 00000',
      line1: '1 Test Street',
      city: 'Pune',
      state: 'Maharashtra',
      pincode: '411001',
      isDefault: true,
    },
  });
}

function createCustomization({ userId, productId }) {
  return prisma.customization.create({
    data: {
      userId,
      productId,
      photoUrl: 'https://s3.test.local/photo.jpg',
      photoKey: `photos/${userId}/test.jpg`,
    },
  });
}

async function nextOrderNumber() {
  const rows = await prisma.$queryRaw`SELECT nextval('order_number_seq') AS seq`;
  return `SQ-${new Date().getFullYear()}-${String(rows[0].seq).padStart(6, '0')}`;
}

/**
 * Build an order directly in whatever status a test needs, with a history row,
 * bypassing the workflow — so a test can start from the status it is about.
 *
 * @param {object} args
 * @param {string} [args.status]
 * @param {number} args.customerId
 * @param {number} [args.designerId]
 * @param {number} [args.printerId]
 * @param {number} [args.customerRevisionCount]
 * @param {boolean} [args.withPaidPayment]
 */
async function createOrder({
  status = 'PLACED',
  customerId,
  designerId = null,
  printerId = null,
  customerRevisionCount = 0,
  quantity = 1,
  withPaidPayment = false,
  product,
} = {}) {
  const theProduct = product || (await createProduct());
  const address = await createAddress(customerId);
  const customization = await createCustomization({ userId: customerId, productId: theProduct.id });

  const unitPrice = Number(theProduct.basePrice).toFixed(2);
  const lineTotal = (Number(unitPrice) * quantity).toFixed(2);
  const total = (Number(lineTotal) + 99).toFixed(2);

  const order = await prisma.order.create({
    data: {
      orderNumber: await nextOrderNumber(),
      customerId,
      addressId: address.id,
      status,
      subtotal: lineTotal,
      shippingFee: '99.00',
      total,
      assignedDesignerId: designerId,
      assignedPrinterId: printerId,
      customerRevisionCount,
      items: {
        create: [
          { productId: theProduct.id, customizationId: customization.id, quantity, unitPrice, lineTotal },
        ],
      },
    },
    include: { items: true },
  });

  await prisma.orderStatusHistory.create({
    data: { orderId: order.id, fromStatus: null, toStatus: status, changedByUserId: customerId, note: 'fixture' },
  });

  if (withPaidPayment) {
    await prisma.payment.create({
      data: {
        orderId: order.id,
        razorpayOrderId: `order_fixture_${order.id}`,
        razorpayPaymentId: `pay_fixture_${order.id}`,
        amount: total,
        status: 'SUCCESS',
      },
    });
  }

  return { order, product: theProduct, address, customization };
}

function createDesignVersion({ orderId, designerId, versionNo = 1, status = 'SUBMITTED' }) {
  return prisma.designVersion.create({
    data: {
      orderId,
      designerId,
      versionNo,
      fileUrl: 'https://s3.test.local/design.png',
      fileKey: `designs/${orderId}/v${versionNo}-test.png`,
      status,
    },
  });
}

function createPrintJob({ orderId, printerId, assignedById, stage = 'ASSIGNED', color = 'WHITE', thicknessMm = 3, size = 'A4' }) {
  return prisma.printJob.create({
    data: { orderId, printerId, assignedById, stage, color, thicknessMm, size },
  });
}

module.exports = {
  prisma,
  PASSWORD,
  TABLES,
  resetDatabase,
  disconnect,
  createUser,
  createProduct,
  createAddress,
  createCustomization,
  createOrder,
  createDesignVersion,
  createPrintJob,
  nextOrderNumber,
};
