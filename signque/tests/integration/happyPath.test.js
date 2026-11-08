'use strict';

/**
 * The full journey over HTTP: register → pay → admin review → design →
 * customer approval → printing → COMPLETED, plus the send-back loop and the
 * customer change-request loop.
 *
 * Real Express, real Prisma, real Postgres. Only S3, Razorpay's network calls
 * and SMTP are mocked.
 */

const api = require('../helpers/api');
const db = require('../helpers/db');

const { prisma } = db;

let admin;
let designer;
let designer2;
let printer;
let product;

beforeEach(async () => {
  await db.resetDatabase();
  admin = await db.createUser({ role: 'ADMIN', name: 'Asha Admin' });
  designer = await db.createUser({ role: 'DESIGNER', name: 'Dev Designer' });
  designer2 = await db.createUser({ role: 'DESIGNER', name: 'Divya Designer' });
  printer = await db.createUser({ role: 'PRINTER', name: 'Pranav Printer' });
  product = await db.createProduct({ title: 'Acrylic Photo Frame – Portrait', basePrice: '799.00' });
});

afterAll(async () => {
  await db.disconnect();
});

/** Register a customer over the API and keep their token. */
async function registerCustomer(email = 'buyer@test.local') {
  const res = await api
    .api()
    .post('/api/auth/register')
    .send({ name: 'Kiran Customer', email, phone: '+91 90000 12345', password: 'Customer@123' })
    .expect(201);

  const { user, accessToken } = api.data(res);
  return { user, auth: ['Authorization', `Bearer ${accessToken}`] };
}

/** Upload a photo, attach it to the product, add an address, place the order. */
async function placeOrder(customer, { quantity = 1 } = {}) {
  const upload = api.data(
    await api
      .api()
      .post('/api/uploads/photo')
      .set(...customer.auth)
      .attach('photo', Buffer.from('fake-jpeg-bytes'), {
        filename: 'family.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201),
  );

  const { customization } = api.data(
    await api
      .api()
      .post('/api/customizations')
      .set(...customer.auth)
      .send({ productId: product.id, photoUrl: upload.url, photoKey: upload.key })
      .expect(201),
  );

  const { address } = api.data(
    await api
      .api()
      .post('/api/addresses')
      .set(...customer.auth)
      .send({
        fullName: 'Kiran Customer',
        phone: '+91 90000 12345',
        line1: '402, Sunbeam Residency',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
      })
      .expect(201),
  );

  const created = api.data(
    await api
      .api()
      .post('/api/orders')
      .set(...customer.auth)
      .send({
        addressId: address.id,
        items: [{ productId: product.id, customizationId: customization.id, quantity }],
      })
      .expect(201),
  );

  return { ...created, address, customization };
}

/** Drive the order to PLACED with a signed payment.captured webhook. */
async function payForOrder(order, razorpay) {
  const res = await api.postWebhook({
    eventId: `evt_capture_${order.id}`,
    body: api.paymentCapturedBody({
      razorpayOrderId: razorpay.orderId,
      razorpayPaymentId: `pay_test_${order.id}`,
      amountPaise: razorpay.amount,
    }),
  });
  expect(res.status).toBe(200);
  return res;
}

/** Submit a design as the assigned designer. */
async function submitDesign(designerUser, orderId, note) {
  return api.data(
    await api
      .api()
      .post(`/api/designer/jobs/${orderId}/submit`)
      .set(...api.authFor(designerUser))
      .field('note', note)
      .attach('file', Buffer.from('fake-png-bytes'), {
        filename: 'design.png',
        contentType: 'image/png',
      })
      .expect(201),
  );
}

// ---------------------------------------------------------------------------

describe('the happy path, register to COMPLETED', () => {
  it('walks the whole workflow', async () => {
    // --- 1. register, upload, order -----------------------------------------
    const customer = await registerCustomer();
    const { order, razorpay } = await placeOrder(customer);

    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.orderNumber).toMatch(/^SQ-\d{4}-\d{6}$/);
    // Totals computed on the server: 799.00 + 99.00 shipping.
    expect(order.subtotal).toBe('799');
    expect(order.total).toBe('898');
    expect(razorpay.amount).toBe(89800);
    expect(razorpay.keyId).toBeTruthy();

    // --- 2. payment captured by webhook → PLACED ----------------------------
    await payForOrder(order, razorpay);

    let fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('PLACED');

    const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    expect(payment.status).toBe('SUCCESS');

    // The admin and the customer were both notified.
    const placedNotifications = await prisma.notification.findMany({
      where: { orderId: order.id, channel: 'IN_APP' },
    });
    expect(placedNotifications.map((n) => n.userId)).toEqual(
      expect.arrayContaining([admin.id, customer.user.id]),
    );

    // --- 3. admin approves and assigns a designer ---------------------------
    const approved = api.data(
      await api
        .api()
        .post(`/api/admin/orders/${order.id}/approve`)
        .set(...api.authFor(admin))
        .send({ designerId: designer.id })
        .expect(200),
    );
    expect(approved.order.status).toBe('DESIGN_ASSIGNED');
    expect(approved.order.assignedDesignerId).toBe(designer.id);

    // --- 4. designer takes the job and submits ------------------------------
    const jobs = api.data(
      await api
        .api()
        .get('/api/designer/jobs?status=DESIGN_ASSIGNED')
        .set(...api.authFor(designer))
        .expect(200),
    );
    expect(jobs.jobs).toHaveLength(1);
    expect(jobs.jobs[0].id).toBe(order.id);

    await api
      .api()
      .post(`/api/designer/jobs/${order.id}/take`)
      .set(...api.authFor(designer))
      .expect(200);

    const submitted = await submitDesign(designer, order.id, 'Centred crop with a 10 mm border');
    expect(submitted.order.status).toBe('DESIGN_SUBMITTED');
    expect(submitted.version.versionNo).toBe(1);

    // --- 5. admin sends the design to the customer -------------------------
    const sent = api.data(
      await api
        .api()
        .post(`/api/admin/orders/${order.id}/design/approve`)
        .set(...api.authFor(admin))
        .send({})
        .expect(200),
    );
    expect(sent.order.status).toBe('AWAITING_CUSTOMER_APPROVAL');

    // --- 6. the customer sees it and approves ------------------------------
    const design = api.data(
      await api
        .api()
        .get(`/api/orders/${order.id}/design`)
        .set(...customer.auth)
        .expect(200),
    );
    expect(design.version.versionNo).toBe(1);
    expect(design.version.fileUrl).toMatch(/^https:\/\/s3\.test\.local\//);
    expect(design.canApprove).toBe(true);
    expect(design.revisions).toMatchObject({ used: 0, left: 3, canRequestChanges: true });

    const customerApproved = api.data(
      await api
        .api()
        .post(`/api/orders/${order.id}/design/approve`)
        .set(...customer.auth)
        .expect(200),
    );
    expect(customerApproved.order.status).toBe('CUSTOMER_APPROVED');

    // --- 7. admin sets the print spec and assigns a printer ----------------
    const printJobResult = api.data(
      await api
        .api()
        .post(`/api/admin/orders/${order.id}/print-job`)
        .set(...api.authFor(admin))
        .send({
          printerId: printer.id,
          color: 'BLACK',
          thicknessMm: 5,
          size: 'A3',
          notes: 'Polish all four edges',
        })
        .expect(201),
    );
    expect(printJobResult.order.status).toBe('PRINT_ASSIGNED');
    expect(printJobResult.printJob).toMatchObject({ color: 'BLACK', thicknessMm: 5, size: 'A3' });

    // --- 8. printer takes it and works through the stages ------------------
    const taken = api.data(
      await api
        .api()
        .post(`/api/printer/jobs/${order.id}/take`)
        .set(...api.authFor(printer))
        .expect(200),
    );
    expect(taken.order.status).toBe('PRINTING');

    const printerView = api.data(
      await api
        .api()
        .get(`/api/printer/jobs/${order.id}`)
        .set(...api.authFor(printer))
        .expect(200),
    );
    expect(printerView.job.printSpec).toMatchObject({ color: 'BLACK', thicknessMm: 5, size: 'A3' });
    expect(printerView.job.design.fileUrl).toMatch(/^https:\/\/s3\.test\.local\//);
    expect(printerView.job.totalQuantity).toBe(1);

    for (const stage of ['PRINTING', 'QUALITY_CHECK']) {
      const res = api.data(
        await api
          .api()
          .patch(`/api/printer/jobs/${order.id}/stage`)
          .set(...api.authFor(printer))
          .send({ stage })
          .expect(200),
      );
      expect(res.printJob.stage).toBe(stage);
    }

    // --- 9 & 10. complete → PRINT_COMPLETED → COMPLETED --------------------
    const completed = api.data(
      await api
        .api()
        .post(`/api/printer/jobs/${order.id}/complete`)
        .set(...api.authFor(printer))
        .expect(200),
    );
    expect(completed.order.status).toBe('COMPLETED');
    expect(completed.printJob.stage).toBe('DONE');

    // --- the record it left behind ----------------------------------------
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { id: 'asc' },
    });
    expect(history.map((h) => h.toStatus)).toEqual([
      'PENDING_PAYMENT',
      'PLACED',
      'DESIGN_ASSIGNED',
      'DESIGN_IN_PROGRESS',
      'DESIGN_SUBMITTED',
      'AWAITING_CUSTOMER_APPROVAL',
      'CUSTOMER_APPROVED',
      'PRINT_ASSIGNED',
      'PRINTING',
      'PRINT_COMPLETED',
      'COMPLETED',
    ]);

    // The customer's own view, with the 6-step tracker finished.
    const view = api.data(
      await api
        .api()
        .get(`/api/orders/${order.id}`)
        .set(...customer.auth)
        .expect(200),
    );
    expect(view.order.status).toBe('COMPLETED');
    expect(view.order.progress.steps.map((s) => s.state)).toEqual([
      'done',
      'done',
      'done',
      'done',
      'done',
      'current',
    ]);
    expect(view.order.timeline).toHaveLength(11);

    // And the completion notice.
    const completionNotice = await prisma.notification.findFirst({
      where: { userId: customer.user.id, type: 'ORDER_COMPLETED', channel: 'IN_APP' },
    });
    expect(completionNotice.message).toMatch(/is complete/);
  });
});

describe('the design send-back loop', () => {
  it('sends a design back, and the second version reaches the customer', async () => {
    const customer = await registerCustomer();
    const { order, razorpay } = await placeOrder(customer);
    await payForOrder(order, razorpay);

    await api
      .api()
      .post(`/api/admin/orders/${order.id}/approve`)
      .set(...api.authFor(admin))
      .send({ designerId: designer.id })
      .expect(200);

    await api
      .api()
      .post(`/api/designer/jobs/${order.id}/take`)
      .set(...api.authFor(designer))
      .expect(200);

    await submitDesign(designer, order.id, 'First draft');

    // The admin sends it back with a note.
    const sentBack = api.data(
      await api
        .api()
        .post(`/api/admin/orders/${order.id}/design/send-back`)
        .set(...api.authFor(admin))
        .send({ note: 'The contrast is too low — please raise it' })
        .expect(200),
    );
    expect(sentBack.order.status).toBe('DESIGN_IN_PROGRESS');

    // v1 is admin-rejected, so the customer must not be able to see it.
    const v1 = await prisma.designVersion.findFirst({ where: { orderId: order.id, versionNo: 1 } });
    expect(v1.status).toBe('ADMIN_REJECTED');

    await api
      .api()
      .get(`/api/orders/${order.id}/design`)
      .set(...customer.auth)
      .expect(404);

    // The designer was told what to change.
    const designerNotice = await prisma.notification.findFirst({
      where: { userId: designer.id, type: 'DESIGN_SENT_BACK', channel: 'IN_APP' },
    });
    expect(designerNotice.message).toMatch(/contrast is too low/);

    // The designer's job view shows the comment.
    const job = api.data(
      await api
        .api()
        .get(`/api/designer/jobs/${order.id}`)
        .set(...api.authFor(designer))
        .expect(200),
    );
    expect(job.job.reviews).toHaveLength(1);
    expect(job.job.reviews[0]).toMatchObject({
      reviewerRole: 'ADMIN',
      decision: 'CHANGES_REQUESTED',
      comment: 'The contrast is too low — please raise it',
    });

    // v2, and this time the admin approves it.
    const second = await submitDesign(designer, order.id, 'Contrast raised');
    expect(second.version.versionNo).toBe(2);
    expect(second.order.status).toBe('DESIGN_SUBMITTED');

    await api
      .api()
      .post(`/api/admin/orders/${order.id}/design/approve`)
      .set(...api.authFor(admin))
      .send({})
      .expect(200);

    // The customer now sees v2 — and still never v1.
    const design = api.data(
      await api
        .api()
        .get(`/api/orders/${order.id}/design`)
        .set(...customer.auth)
        .expect(200),
    );
    expect(design.version.versionNo).toBe(2);

    const detail = api.data(
      await api
        .api()
        .get(`/api/orders/${order.id}`)
        .set(...customer.auth)
        .expect(200),
    );
    expect(detail.order.design.versionNo).toBe(2);
    // The send-back did not spend a customer revision.
    expect(detail.order.revisions.used).toBe(0);
  });
});

describe('the customer change-request loop', () => {
  it('goes back to the designer and comes round again', async () => {
    const customer = await registerCustomer();
    const { order, razorpay } = await placeOrder(customer);
    await payForOrder(order, razorpay);

    await api
      .api()
      .post(`/api/admin/orders/${order.id}/approve`)
      .set(...api.authFor(admin))
      .send({ designerId: designer.id })
      .expect(200);
    await api
      .api()
      .post(`/api/designer/jobs/${order.id}/take`)
      .set(...api.authFor(designer))
      .expect(200);
    await submitDesign(designer, order.id, 'First draft');
    await api
      .api()
      .post(`/api/admin/orders/${order.id}/design/approve`)
      .set(...api.authFor(admin))
      .send({})
      .expect(200);

    // The customer asks for a change.
    const requested = api.data(
      await api
        .api()
        .post(`/api/orders/${order.id}/design/request-changes`)
        .set(...customer.auth)
        .send({ comment: 'The crop cuts off my daughter on the left' })
        .expect(200),
    );
    expect(requested.order.status).toBe('DESIGN_IN_PROGRESS');
    expect(requested.order.customerRevisionCount).toBe(1);

    // Both the designer and the admin hear about it.
    const notices = await prisma.notification.findMany({
      where: { orderId: order.id, type: 'CUSTOMER_REQUESTED_CHANGES', channel: 'IN_APP' },
    });
    expect(notices.map((n) => n.userId)).toEqual(expect.arrayContaining([designer.id, admin.id]));

    // Round two: v2, approved by the admin, approved by the customer.
    const second = await submitDesign(designer, order.id, 'Wider crop');
    expect(second.version.versionNo).toBe(2);

    await api
      .api()
      .post(`/api/admin/orders/${order.id}/design/approve`)
      .set(...api.authFor(admin))
      .send({})
      .expect(200);

    const approved = api.data(
      await api
        .api()
        .post(`/api/orders/${order.id}/design/approve`)
        .set(...customer.auth)
        .expect(200),
    );
    expect(approved.order.status).toBe('CUSTOMER_APPROVED');
    // The revision was spent but not refunded.
    expect(approved.order.customerRevisionCount).toBe(1);
  });

  it('stops at MAX_FREE_REVISIONS and tells the customer to contact support', async () => {
    const customer = await registerCustomer();
    const { order, razorpay } = await placeOrder(customer);
    await payForOrder(order, razorpay);

    await api
      .api()
      .post(`/api/admin/orders/${order.id}/approve`)
      .set(...api.authFor(admin))
      .send({ designerId: designer.id })
      .expect(200);
    await api
      .api()
      .post(`/api/designer/jobs/${order.id}/take`)
      .set(...api.authFor(designer))
      .expect(200);

    // Three change requests are allowed, the fourth is not.
    for (let round = 1; round <= 3; round += 1) {
      await submitDesign(designer, order.id, `Draft ${round}`);
      await api
        .api()
        .post(`/api/admin/orders/${order.id}/design/approve`)
        .set(...api.authFor(admin))
        .send({})
        .expect(200);
      await api
        .api()
        .post(`/api/orders/${order.id}/design/request-changes`)
        .set(...customer.auth)
        .send({ comment: `Change number ${round} please` })
        .expect(200);
    }

    await submitDesign(designer, order.id, 'Draft 4');
    await api
      .api()
      .post(`/api/admin/orders/${order.id}/design/approve`)
      .set(...api.authFor(admin))
      .send({})
      .expect(200);

    const refused = await api
      .api()
      .post(`/api/orders/${order.id}/design/request-changes`)
      .set(...customer.auth)
      .send({ comment: 'One more change please' })
      .expect(403);

    expect(refused.body.success).toBe(false);
    expect(refused.body.message).toMatch(/Contact support for more changes/);

    // The order is still waiting for them to approve.
    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('AWAITING_CUSTOMER_APPROVAL');
    expect(fresh.customerRevisionCount).toBe(3);

    // And the UI is told to hide the button.
    const design = api.data(
      await api
        .api()
        .get(`/api/orders/${order.id}/design`)
        .set(...customer.auth)
        .expect(200),
    );
    expect(design.revisions).toMatchObject({ used: 3, left: 0, canRequestChanges: false });
  });
});

describe('reject with a refund', () => {
  it('rejects a paid order, refunds it and tells the customer', async () => {
    const razorpayClient = require('../../src/integrations/razorpayClient');
    razorpayClient.refund.mockClear();

    const customer = await registerCustomer();
    const { order, razorpay } = await placeOrder(customer);
    await payForOrder(order, razorpay);

    const rejected = api.data(
      await api
        .api()
        .post(`/api/admin/orders/${order.id}/reject`)
        .set(...api.authFor(admin))
        .send({ reason: 'The photo is too blurred to print well' })
        .expect(200),
    );
    expect(rejected.order.status).toBe('REJECTED');
    expect(rejected.order.rejectReason).toBe('The photo is too blurred to print well');

    // A refund was requested against the captured payment.
    expect(razorpayClient.refund).toHaveBeenCalledTimes(1);
    expect(razorpayClient.refund).toHaveBeenCalledWith(
      expect.objectContaining({ razorpayPaymentId: `pay_test_${order.id}`, amountPaise: 89800 }),
    );

    const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    expect(payment.refundId).toMatch(/^rfnd_test_/);
    // Still SUCCESS until the refund.processed webhook arrives.
    expect(payment.status).toBe('SUCCESS');

    const notice = await prisma.notification.findFirst({
      where: { userId: customer.user.id, type: 'ORDER_REJECTED', channel: 'IN_APP' },
    });
    expect(notice.message).toMatch(/was rejected: The photo is too blurred/);
    expect(notice.message).toMatch(/A refund has been started/);

    // The refund webhook settles the payment.
    await api
      .postWebhook({
        eventId: `evt_refund_${order.id}`,
        body: api.refundProcessedBody({
          razorpayPaymentId: `pay_test_${order.id}`,
          refundId: payment.refundId,
          amountPaise: 89800,
        }),
      })
      .expect(200);

    const settled = await prisma.payment.findFirst({ where: { orderId: order.id } });
    expect(settled.status).toBe('REFUNDED');
  });

  it('cancels a paid order mid-workflow and refunds it', async () => {
    const razorpayClient = require('../../src/integrations/razorpayClient');
    razorpayClient.refund.mockClear();

    const customer = await registerCustomer();
    const { order, razorpay } = await placeOrder(customer);
    await payForOrder(order, razorpay);

    await api
      .api()
      .post(`/api/admin/orders/${order.id}/approve`)
      .set(...api.authFor(admin))
      .send({ designerId: designer.id })
      .expect(200);

    const cancelled = api.data(
      await api
        .api()
        .post(`/api/admin/orders/${order.id}/cancel`)
        .set(...api.authFor(admin))
        .send({ reason: 'The customer changed their mind' })
        .expect(200),
    );
    expect(cancelled.order.status).toBe('CANCELLED');
    expect(razorpayClient.refund).toHaveBeenCalledTimes(1);

    // Nothing more can happen to it.
    await api
      .api()
      .post(`/api/admin/orders/${order.id}/cancel`)
      .set(...api.authFor(admin))
      .send({ reason: 'Trying to cancel it twice' })
      .expect(409);
  });
});

describe('reassignment', () => {
  it('swaps the designer without moving the status, and records it', async () => {
    const customer = await registerCustomer();
    const { order, razorpay } = await placeOrder(customer);
    await payForOrder(order, razorpay);

    await api
      .api()
      .post(`/api/admin/orders/${order.id}/approve`)
      .set(...api.authFor(admin))
      .send({ designerId: designer.id })
      .expect(200);

    const reassigned = api.data(
      await api
        .api()
        .post(`/api/admin/orders/${order.id}/reassign-designer`)
        .set(...api.authFor(admin))
        .send({ designerId: designer2.id })
        .expect(200),
    );
    expect(reassigned.order.status).toBe('DESIGN_ASSIGNED');
    expect(reassigned.order.assignedDesignerId).toBe(designer2.id);

    // The first designer can no longer act on it.
    await api
      .api()
      .post(`/api/designer/jobs/${order.id}/take`)
      .set(...api.authFor(designer))
      .expect(403);

    await api
      .api()
      .post(`/api/designer/jobs/${order.id}/take`)
      .set(...api.authFor(designer2))
      .expect(200);

    const row = await prisma.orderStatusHistory.findFirst({
      where: { orderId: order.id, note: { contains: 'reassigned' } },
    });
    expect(row).toMatchObject({ fromStatus: 'DESIGN_ASSIGNED', toStatus: 'DESIGN_ASSIGNED' });
  });
});

describe('payment failure and retry', () => {
  it('fails, then retries back to PENDING_PAYMENT with a new gateway order', async () => {
    const customer = await registerCustomer();
    const { order, razorpay } = await placeOrder(customer);

    await api
      .postWebhook({
        eventId: `evt_fail_${order.id}`,
        body: api.paymentFailedBody({
          razorpayOrderId: razorpay.orderId,
          razorpayPaymentId: `pay_failed_${order.id}`,
        }),
      })
      .expect(200);

    let fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('PAYMENT_FAILED');

    const retry = api.data(
      await api
        .api()
        .post(`/api/orders/${order.id}/retry-payment`)
        .set(...customer.auth)
        .expect(200),
    );
    expect(retry.order.status).toBe('PENDING_PAYMENT');
    expect(retry.razorpay.orderId).not.toBe(razorpay.orderId);

    // The new attempt can succeed.
    await api
      .postWebhook({
        eventId: `evt_capture_retry_${order.id}`,
        body: api.paymentCapturedBody({
          razorpayOrderId: retry.razorpay.orderId,
          razorpayPaymentId: `pay_retry_${order.id}`,
          amountPaise: retry.razorpay.amount,
        }),
      })
      .expect(200);

    fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('PLACED');

    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(payments).toHaveLength(2);
    expect(payments.map((p) => p.status).sort()).toEqual(['FAILED', 'SUCCESS']);
  });
});
