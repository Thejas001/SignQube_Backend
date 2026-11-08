'use strict';

/**
 * The Razorpay webhook: a real HMAC computed with the test secret, rejection of
 * a bad signature, and idempotency — a redelivered event must be a no-op.
 */

const crypto = require('crypto');

const api = require('../helpers/api');
const db = require('../helpers/db');
const env = require('../../src/config/env');

const { prisma } = db;

let customer;
let admin;
let product;

beforeEach(async () => {
  await db.resetDatabase();
  customer = await db.createUser({ role: 'CUSTOMER' });
  admin = await db.createUser({ role: 'ADMIN' });
  product = await db.createProduct({ basePrice: '799.00' });
});

afterAll(async () => {
  await db.disconnect();
});

/** An order at PENDING_PAYMENT with its PENDING Payment row. */
async function pendingOrder() {
  const { order } = await db.createOrder({
    status: 'PENDING_PAYMENT',
    customerId: customer.id,
    product,
  });
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      razorpayOrderId: `order_hook_${order.id}`,
      amount: order.total,
      status: 'PENDING',
    },
  });
  return { order, payment };
}

describe('the signature', () => {
  it('accepts a real HMAC computed with the test secret', async () => {
    const { order, payment } = await pendingOrder();

    const body = api.paymentCapturedBody({
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: 'pay_sig_ok',
      amountPaise: 89800,
    });

    // Computed here, independently of the helper, to prove it is a genuine HMAC.
    const raw = JSON.stringify(body);
    const signature = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(Buffer.from(raw, 'utf8'))
      .digest('hex');

    const res = await api
      .api()
      .post('/api/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', 'evt_sig_ok')
      .send(raw);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('PLACED');
  });

  it('rejects a signature made with the wrong secret', async () => {
    const { order, payment } = await pendingOrder();

    const res = await api.postWebhook({
      secret: 'definitely-not-the-webhook-secret',
      eventId: 'evt_bad_secret',
      body: api.paymentCapturedBody({
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: 'pay_bad_secret',
        amountPaise: 89800,
      }),
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('PENDING_PAYMENT');
    // Nothing was recorded, so a correctly signed retry still works.
    expect(await prisma.paymentEvent.count()).toBe(0);
  });

  it('rejects a tampered body', async () => {
    const { payment } = await pendingOrder();

    const body = api.paymentCapturedBody({
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: 'pay_tamper',
      amountPaise: 89800,
    });
    const signature = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(Buffer.from(JSON.stringify(body), 'utf8'))
      .digest('hex');

    // Same signature, different body.
    body.payload.payment.entity.amount = 1;

    const res = await api
      .api()
      .post('/api/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .send(JSON.stringify(body));

    expect(res.status).toBe(401);
  });

  it('rejects a missing signature', async () => {
    const { payment } = await pendingOrder();
    const res = await api
      .api()
      .post('/api/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .send(
        JSON.stringify(
          api.paymentCapturedBody({
            razorpayOrderId: payment.razorpayOrderId,
            razorpayPaymentId: 'pay_nosig',
            amountPaise: 89800,
          }),
        ),
      );
    expect(res.status).toBe(401);
  });

  it('rejects a signature of the right length but the wrong bytes', async () => {
    const { payment } = await pendingOrder();
    const res = await api.postWebhook({
      signature: 'a'.repeat(64),
      body: api.paymentCapturedBody({
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: 'pay_wrong',
        amountPaise: 89800,
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe('a duplicate event is a no-op', () => {
  it('ignores the same event id delivered twice', async () => {
    const { order, payment } = await pendingOrder();

    const body = api.paymentCapturedBody({
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: 'pay_dup',
      amountPaise: 89800,
    });

    const first = await api.postWebhook({ eventId: 'evt_duplicate', body });
    expect(first.status).toBe(200);
    expect(first.body.data.handled).toBe(true);
    expect(first.body.data.duplicate).toBeUndefined();

    const second = await api.postWebhook({ eventId: 'evt_duplicate', body });
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ handled: false, duplicate: true });

    // One event row, one PLACED history row, one status change.
    expect(await prisma.paymentEvent.count()).toBe(1);

    const placedRows = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id, toStatus: 'PLACED' },
    });
    expect(placedRows).toHaveLength(1);

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('PLACED');
  });

  it('ignores a replay delivered ten times', async () => {
    const { order, payment } = await pendingOrder();
    const body = api.paymentCapturedBody({
      razorpayOrderId: payment.razorpayOrderId,
      razorpayPaymentId: 'pay_many',
      amountPaise: 89800,
    });

    for (let i = 0; i < 10; i += 1) {
      const res = await api.postWebhook({ eventId: 'evt_replayed', body });
      expect(res.status).toBe(200);
    }

    expect(await prisma.paymentEvent.count()).toBe(1);
    expect(
      await prisma.orderStatusHistory.count({ where: { orderId: order.id, toStatus: 'PLACED' } }),
    ).toBe(1);
    const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('SUCCESS');
  });

  it('handles order.paid after payment.captured without moving the order twice', async () => {
    const { order, payment } = await pendingOrder();

    await api
      .postWebhook({
        eventId: 'evt_captured',
        body: api.paymentCapturedBody({
          razorpayOrderId: payment.razorpayOrderId,
          razorpayPaymentId: 'pay_both',
          amountPaise: 89800,
        }),
      })
      .expect(200);

    // A different event id, so it is not a replay — but the payment is settled.
    const second = await api.postWebhook({
      eventId: 'evt_order_paid',
      body: {
        event: 'order.paid',
        created_at: Math.floor(Date.now() / 1000),
        payload: { order: { entity: { id: payment.razorpayOrderId, amount: 89800, status: 'paid' } } },
      },
    });
    expect(second.status).toBe(200);
    expect(second.body.data.handled).toBe(false);
    expect(second.body.data.reason).toMatch(/already SUCCESS/);

    expect(
      await prisma.orderStatusHistory.count({ where: { orderId: order.id, toStatus: 'PLACED' } }),
    ).toBe(1);
  });

  it('never overwrites a refunded payment', async () => {
    const { order } = await db.createOrder({
      status: 'CANCELLED',
      customerId: customer.id,
      product,
    });
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        razorpayOrderId: `order_refunded_${order.id}`,
        razorpayPaymentId: `pay_refunded_${order.id}`,
        amount: order.total,
        status: 'REFUNDED',
      },
    });

    const res = await api.postWebhook({
      eventId: 'evt_late_capture',
      body: api.paymentCapturedBody({
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: payment.razorpayPaymentId,
        amountPaise: 89800,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.body.data.handled).toBe(false);

    const fresh = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(fresh.status).toBe('REFUNDED');
    const order2 = await prisma.order.findUnique({ where: { id: order.id } });
    expect(order2.status).toBe('CANCELLED');
  });
});

describe('the events it handles', () => {
  it('payment.failed moves the order to PAYMENT_FAILED', async () => {
    const { order, payment } = await pendingOrder();

    const res = await api.postWebhook({
      eventId: 'evt_failed',
      body: api.paymentFailedBody({
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: 'pay_failed',
        reason: 'Card declined',
      }),
    });
    expect(res.status).toBe(200);

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('PAYMENT_FAILED');
    const settled = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(settled.status).toBe('FAILED');

    const row = await prisma.orderStatusHistory.findFirst({
      where: { orderId: order.id, toStatus: 'PAYMENT_FAILED' },
    });
    expect(row.note).toBe('Card declined');
    expect(row.changedByUserId).toBeNull();
  });

  it('refund.processed marks the payment REFUNDED', async () => {
    const { order } = await db.createOrder({
      status: 'REJECTED',
      customerId: customer.id,
      product,
      withPaidPayment: true,
    });

    const res = await api.postWebhook({
      eventId: 'evt_refunded',
      body: api.refundProcessedBody({
        razorpayPaymentId: `pay_fixture_${order.id}`,
        refundId: 'rfnd_hook_1',
        amountPaise: 89800,
      }),
    });
    expect(res.status).toBe(200);

    const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
    expect(payment.status).toBe('REFUNDED');
    expect(payment.refundId).toBe('rfnd_hook_1');
  });

  it('records but ignores an event type it does not handle', async () => {
    const res = await api.postWebhook({
      eventId: 'evt_unknown',
      body: { event: 'subscription.charged', created_at: 1, payload: {} },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ handled: false });
    expect(res.body.data.reason).toMatch(/Unhandled event subscription\.charged/);
  });

  it('shrugs off an event for a payment it has never seen', async () => {
    const res = await api.postWebhook({
      eventId: 'evt_unknown_payment',
      body: api.paymentCapturedBody({
        razorpayOrderId: 'order_does_not_exist',
        razorpayPaymentId: 'pay_nope',
        amountPaise: 100,
      }),
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ handled: false, reason: 'Unknown payment' });
  });

  it('returns 200 even when nothing was done, so Razorpay does not retry', async () => {
    const res = await api.postWebhook({
      eventId: 'evt_no_order_id',
      body: { event: 'payment.captured', created_at: 1, payload: { payment: { entity: {} } } },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.handled).toBe(false);
  });
});

describe('the webhook needs the raw body', () => {
  it('is mounted before express.json, so the bytes are untouched', async () => {
    const { payment } = await pendingOrder();

    // A body whose JSON text would change if it were parsed and re-serialised:
    // the key order here is not alphabetical and there is extra whitespace.
    const raw = `{"event":"payment.captured",  "created_at":123,"payload":{"payment":{"entity":{"order_id":"${payment.razorpayOrderId}","id":"pay_raw","amount":89800}}}}`;
    const signature = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(Buffer.from(raw, 'utf8'))
      .digest('hex');

    const res = await api
      .api()
      .post('/api/payments/razorpay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', signature)
      .set('x-razorpay-event-id', 'evt_raw_body')
      .send(raw);

    expect(res.status).toBe(200);
    expect(res.body.data.handled).toBe(true);
  });
});

describe('verify-payment, for fast UI feedback', () => {
  it('verifies a real checkout signature without moving the order', async () => {
    const { order, payment } = await pendingOrder();

    const razorpayPaymentId = 'pay_checkout_1';
    const signature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${payment.razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    const res = await api
      .api()
      .post(`/api/orders/${order.id}/verify-payment`)
      .set(...api.authFor(customer))
      .send({
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature: signature,
      })
      .expect(200);

    expect(res.body.data.verified).toBe(true);
    // The webhook is still the source of truth.
    expect(res.body.data.orderStatus).toBe('PENDING_PAYMENT');

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('PENDING_PAYMENT');
    const updated = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(updated.razorpayPaymentId).toBe(razorpayPaymentId);
    expect(updated.status).toBe('PENDING');
  });

  it('rejects a forged checkout signature', async () => {
    const { order, payment } = await pendingOrder();

    const res = await api
      .api()
      .post(`/api/orders/${order.id}/verify-payment`)
      .set(...api.authFor(customer))
      .send({
        razorpayOrderId: payment.razorpayOrderId,
        razorpayPaymentId: 'pay_forged',
        razorpaySignature: 'f'.repeat(64),
      })
      .expect(400);

    expect(res.body.error.code).toBe('BAD_REQUEST');
  });

  it("refuses another customer's order", async () => {
    const other = await db.createUser({ role: 'CUSTOMER' });
    const { order, payment } = await pendingOrder();

    const razorpayPaymentId = 'pay_other';
    const signature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(`${payment.razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    await api
      .api()
      .post(`/api/orders/${order.id}/verify-payment`)
      .set(...api.authFor(other))
      .send({ razorpayOrderId: payment.razorpayOrderId, razorpayPaymentId, razorpaySignature: signature })
      .expect(403);
  });
});
