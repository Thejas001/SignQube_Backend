'use strict';

/**
 * Seed data. Idempotent — safe to run more than once.
 *
 * Creates the staff and customer accounts, four products, and one sample order
 * sitting at each of PLACED, DESIGN_SUBMITTED, AWAITING_CUSTOMER_APPROVAL and
 * PRINTING, with matching history rows, so every panel has something to show.
 */

const path = require('path');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');

require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;
const SHIPPING_FEE = Number(process.env.SHIPPING_FEE || 99);

const ACCOUNTS = [
  { email: 'admin@signque.in', name: 'Asha Admin', role: 'ADMIN', password: 'Admin@123', phone: '+91 98200 11111' },
  { email: 'designer1@signque.in', name: 'Dev Designer', role: 'DESIGNER', password: 'Designer@123', phone: '+91 98200 22221' },
  { email: 'designer2@signque.in', name: 'Divya Designer', role: 'DESIGNER', password: 'Designer@123', phone: '+91 98200 22222' },
  { email: 'printer1@signque.in', name: 'Pranav Printer', role: 'PRINTER', password: 'Printer@123', phone: '+91 98200 33331' },
  { email: 'customer@signque.in', name: 'Kiran Customer', role: 'CUSTOMER', password: 'Customer@123', phone: '+91 98200 44441' },
];

const PRODUCTS = [
  {
    title: 'Acrylic Photo Frame – Portrait',
    description: 'Crystal-clear acrylic frame in portrait orientation. Your photo UV-printed on 3 mm acrylic with polished edges.',
    basePrice: '799.00',
  },
  {
    title: 'Acrylic Photo Frame – Landscape',
    description: 'Wide landscape acrylic frame, ideal for group photos and scenery. UV-printed with a matte backing.',
    basePrice: '999.00',
  },
  {
    title: 'Acrylic Photo Frame – Square',
    description: 'Square acrylic frame for your favourite square crops. Free-standing with a concealed acrylic foot.',
    basePrice: '1299.00',
  },
  {
    title: 'Acrylic Wall Clock Frame',
    description: 'Your photo as a working wall clock. Silent sweep movement on 5 mm acrylic, ready to hang.',
    basePrice: '1999.00',
  },
];

/** Where each sample order should end up, and what to put on the way there. */
const SAMPLE_ORDERS = [
  { target: 'PLACED', productIndex: 0, quantity: 1 },
  { target: 'DESIGN_SUBMITTED', productIndex: 1, quantity: 1 },
  { target: 'AWAITING_CUSTOMER_APPROVAL', productIndex: 2, quantity: 2 },
  { target: 'PRINTING', productIndex: 3, quantity: 1 },
];

function money(value) {
  return Number(value).toFixed(2);
}

async function upsertUser(account) {
  const passwordHash = await bcrypt.hash(account.password, BCRYPT_ROUNDS);
  return prisma.user.upsert({
    where: { email: account.email },
    update: { name: account.name, role: account.role, phone: account.phone, isActive: true },
    create: {
      name: account.name,
      email: account.email,
      phone: account.phone,
      role: account.role,
      passwordHash,
    },
  });
}

async function upsertProduct(product) {
  const existing = await prisma.product.findFirst({ where: { title: product.title } });
  if (existing) {
    return prisma.product.update({
      where: { id: existing.id },
      data: { description: product.description, basePrice: product.basePrice, isActive: true },
    });
  }
  return prisma.product.create({ data: product });
}

async function nextOrderNumber() {
  const rows = await prisma.$queryRaw`SELECT nextval('order_number_seq') AS seq`;
  return `SQ-${new Date().getFullYear()}-${String(rows[0].seq).padStart(6, '0')}`;
}

/** Append a history row. The seed writes these directly — it is not the API. */
function history(orderId, fromStatus, toStatus, changedByUserId, note) {
  return prisma.orderStatusHistory.create({
    data: { orderId, fromStatus, toStatus, changedByUserId, note },
  });
}

async function buildSampleOrder({ target, productIndex, quantity }, ctx) {
  const { customer, address, products, admin, designers, printer } = ctx;
  const product = products[productIndex];

  const customization = await prisma.customization.create({
    data: {
      userId: customer.id,
      productId: product.id,
      // Seed photos are placeholder images, not real S3 objects. The key is
      // left empty on purpose: the API only replaces a stored URL with a
      // pre-signed one when there IS a key, so an empty key keeps the
      // placeholder visible instead of pointing at an object that is not
      // there. Real uploads always set both.
      photoUrl: 'https://placehold.co/1200x1600/e7e5e4/44403c/png?text=Customer+photo',
      photoKey: '',
    },
  });

  const unitPrice = money(product.basePrice);
  const lineTotal = money(Number(unitPrice) * quantity);
  const subtotal = lineTotal;
  const total = money(Number(subtotal) + SHIPPING_FEE);
  const orderNumber = await nextOrderNumber();

  const designer = designers[productIndex % designers.length];

  const order = await prisma.order.create({
    data: {
      orderNumber,
      customerId: customer.id,
      addressId: address.id,
      status: 'PENDING_PAYMENT',
      subtotal,
      shippingFee: money(SHIPPING_FEE),
      total,
      items: {
        create: [
          { productId: product.id, customizationId: customization.id, quantity, unitPrice, lineTotal },
        ],
      },
    },
  });

  await history(order.id, null, 'PENDING_PAYMENT', customer.id, 'Order created');

  // A settled payment, so the order looks genuinely paid.
  await prisma.payment.create({
    data: {
      orderId: order.id,
      razorpayOrderId: `order_seed_${order.id}`,
      razorpayPaymentId: `pay_seed_${order.id}`,
      amount: total,
      status: 'SUCCESS',
    },
  });

  await prisma.order.update({ where: { id: order.id }, data: { status: 'PLACED' } });
  await history(order.id, 'PENDING_PAYMENT', 'PLACED', null, 'Payment captured');
  if (target === 'PLACED') return order;

  // → DESIGN_ASSIGNED → DESIGN_IN_PROGRESS
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'DESIGN_ASSIGNED', assignedDesignerId: designer.id },
  });
  await history(order.id, 'PLACED', 'DESIGN_ASSIGNED', admin.id, `Assigned to ${designer.name}`);

  await prisma.order.update({ where: { id: order.id }, data: { status: 'DESIGN_IN_PROGRESS' } });
  await history(order.id, 'DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', designer.id, 'Designer took the job');

  // → DESIGN_SUBMITTED, with version 1
  const version = await prisma.designVersion.create({
    data: {
      orderId: order.id,
      designerId: designer.id,
      versionNo: 1,
      // Placeholder, with an empty key for the same reason as the photo above.
      fileUrl: 'https://placehold.co/1200x1600/1c1917/fafaf9/png?text=Design+v1',
      fileKey: '',
      designerNote: 'First draft — centred crop with a 10 mm white border.',
      status: 'SUBMITTED',
    },
  });
  await prisma.order.update({ where: { id: order.id }, data: { status: 'DESIGN_SUBMITTED' } });
  await history(order.id, 'DESIGN_IN_PROGRESS', 'DESIGN_SUBMITTED', designer.id, 'Design v1 submitted');
  if (target === 'DESIGN_SUBMITTED') return order;

  // → AWAITING_CUSTOMER_APPROVAL: the admin sends v1 to the customer
  await prisma.designVersion.update({ where: { id: version.id }, data: { status: 'SENT_TO_CUSTOMER' } });
  await prisma.designReview.create({
    data: {
      designVersionId: version.id,
      reviewerId: admin.id,
      reviewerRole: 'ADMIN',
      decision: 'APPROVED',
      comment: 'Looks good. Sending to the customer.',
    },
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'AWAITING_CUSTOMER_APPROVAL' },
  });
  await history(order.id, 'DESIGN_SUBMITTED', 'AWAITING_CUSTOMER_APPROVAL', admin.id, 'Design v1 sent to the customer');
  if (target === 'AWAITING_CUSTOMER_APPROVAL') return order;

  // → CUSTOMER_APPROVED
  await prisma.designVersion.update({ where: { id: version.id }, data: { status: 'CUSTOMER_APPROVED' } });
  await prisma.designReview.create({
    data: {
      designVersionId: version.id,
      reviewerId: customer.id,
      reviewerRole: 'CUSTOMER',
      decision: 'APPROVED',
      comment: null,
    },
  });
  await prisma.order.update({ where: { id: order.id }, data: { status: 'CUSTOMER_APPROVED' } });
  await history(order.id, 'AWAITING_CUSTOMER_APPROVAL', 'CUSTOMER_APPROVED', customer.id, 'Customer approved design v1');

  // → PRINT_ASSIGNED, with a print job
  await prisma.printJob.create({
    data: {
      orderId: order.id,
      printerId: printer.id,
      color: 'WHITE',
      thicknessMm: 5,
      size: 'A3',
      stage: 'CUTTING',
      assignedById: admin.id,
      notes: 'Polish all four edges.',
      startedAt: new Date(),
    },
  });
  await prisma.order.update({
    where: { id: order.id },
    data: { status: 'PRINT_ASSIGNED', assignedPrinterId: printer.id },
  });
  await history(order.id, 'CUSTOMER_APPROVED', 'PRINT_ASSIGNED', admin.id, `Print job assigned to ${printer.name} (WHITE, 5 mm, A3)`);

  // → PRINTING
  await prisma.order.update({ where: { id: order.id }, data: { status: 'PRINTING' } });
  await history(order.id, 'PRINT_ASSIGNED', 'PRINTING', printer.id, 'Printing user took the job');

  return order;
}

async function main() {
  // Accounts
  const users = {};
  for (const account of ACCOUNTS) {
    const user = await upsertUser(account);
    users[account.email] = user;
  }

  const admin = users['admin@signque.in'];
  const designers = [users['designer1@signque.in'], users['designer2@signque.in']];
  const printer = users['printer1@signque.in'];
  const customer = users['customer@signque.in'];

  // Products
  const products = [];
  for (const product of PRODUCTS) products.push(await upsertProduct(product));

  // The customer's address
  let address = await prisma.address.findFirst({ where: { userId: customer.id } });
  if (!address) {
    address = await prisma.address.create({
      data: {
        userId: customer.id,
        fullName: customer.name,
        phone: '+91 98200 44441',
        line1: '402, Sunbeam Residency',
        line2: 'Lane 5, Koregaon Park',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
        isDefault: true,
      },
    });
  }

  // Sample orders — only when there are none, so re-running does not pile them up.
  const existingOrders = await prisma.order.count();
  const created = [];
  if (existingOrders === 0) {
    for (const sample of SAMPLE_ORDERS) {
      const order = await buildSampleOrder(sample, {
        customer,
        address,
        products,
        admin,
        designers,
        printer,
      });
      created.push(`${order.orderNumber} → ${sample.target}`);
    }
  }

  /* eslint-disable no-console */
  console.log('\nSeed complete.\n');
  console.log('  Accounts (password in brackets):');
  for (const a of ACCOUNTS) console.log(`    ${a.role.padEnd(9)} ${a.email.padEnd(24)} [${a.password}]`);
  console.log(`\n  Products: ${products.length}`);
  console.log(
    created.length
      ? `  Sample orders:\n${created.map((c) => `    ${c}`).join('\n')}`
      : `  Sample orders: skipped (${existingOrders} already in the database)`,
  );
  console.log('');
}

main()
  .catch((err) => {
    /* eslint-disable no-console */
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
