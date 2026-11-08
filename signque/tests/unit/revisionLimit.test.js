'use strict';

/**
 * The customer revision limit (MAX_FREE_REVISIONS, 3 in .env.test).
 *
 * The counter and the status move in the same guarded update, so the limit
 * holds even when two requests arrive together.
 */

const env = require('../../src/config/env');
const designService = require('../../src/services/designService');
const db = require('../helpers/db');

const { prisma } = db;
const MAX = env.MAX_FREE_REVISIONS;

let customer;
let designer;
let admin;

beforeEach(async () => {
  await db.resetDatabase();
  customer = await db.createUser({ role: 'CUSTOMER' });
  designer = await db.createUser({ role: 'DESIGNER' });
  admin = await db.createUser({ role: 'ADMIN' });
});

afterAll(async () => {
  await db.disconnect();
});

/** An order awaiting the customer's approval, with a version they can see. */
async function awaitingApproval(revisionCount = 0) {
  const { order } = await db.createOrder({
    status: 'AWAITING_CUSTOMER_APPROVAL',
    customerId: customer.id,
    designerId: designer.id,
    customerRevisionCount: revisionCount,
  });
  const versionNo = revisionCount + 1;
  await db.createDesignVersion({
    orderId: order.id,
    designerId: designer.id,
    versionNo,
    status: 'SENT_TO_CUSTOMER',
  });
  return order;
}

describe('the limit is 3 by default', () => {
  it('reads MAX_FREE_REVISIONS from the environment', () => {
    expect(MAX).toBe(3);
  });
});

describe('requesting changes', () => {
  it('is allowed while the count is below the limit', async () => {
    for (let used = 0; used < MAX; used += 1) {
      const order = await awaitingApproval(used);

      const result = await designService.customerRequestChanges({
        orderId: order.id,
        customer,
        comment: `Please make the border thinner (${used + 1})`,
      });

      expect(result.order.status).toBe('DESIGN_IN_PROGRESS');
      expect(result.order.customerRevisionCount).toBe(used + 1);
    }
  });

  it('increments the counter by exactly one', async () => {
    const order = await awaitingApproval(1);
    await designService.customerRequestChanges({
      orderId: order.id,
      customer,
      comment: 'Shift the photo up a little',
    });
    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.customerRevisionCount).toBe(2);
  });

  it('is refused once the limit is reached', async () => {
    const order = await awaitingApproval(MAX);

    await expect(
      designService.customerRequestChanges({
        orderId: order.id,
        customer,
        comment: 'One more change please',
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('AWAITING_CUSTOMER_APPROVAL');
    expect(fresh.customerRevisionCount).toBe(MAX);
  });

  it('tells the customer to contact support', async () => {
    const order = await awaitingApproval(MAX);
    await expect(
      designService.customerRequestChanges({ orderId: order.id, customer, comment: 'Another change' }),
    ).rejects.toThrow(/Contact support for more changes/);
  });

  it('is refused past the limit too', async () => {
    const order = await awaitingApproval(MAX + 2);
    await expect(
      designService.customerRequestChanges({ orderId: order.id, customer, comment: 'Another change' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('needs a comment', async () => {
    const order = await awaitingApproval(0);
    for (const comment of ['', '   ', null, undefined]) {
      await expect(
        designService.customerRequestChanges({ orderId: order.id, customer, comment }),
      ).rejects.toMatchObject({ statusCode: 422 });
    }
  });

  it('records the comment as a CHANGES_REQUESTED review', async () => {
    const order = await awaitingApproval(0);
    await designService.customerRequestChanges({
      orderId: order.id,
      customer,
      comment: 'The crop cuts off my daughter',
    });

    const review = await prisma.designReview.findFirst({
      where: { designVersion: { orderId: order.id } },
    });
    expect(review).toMatchObject({
      reviewerRole: 'CUSTOMER',
      decision: 'CHANGES_REQUESTED',
      comment: 'The crop cuts off my daughter',
      reviewerId: customer.id,
    });
  });

  it("refuses another customer's order", async () => {
    const other = await db.createUser({ role: 'CUSTOMER' });
    const order = await awaitingApproval(0);
    await expect(
      designService.customerRequestChanges({
        orderId: order.id,
        customer: other,
        comment: 'Not my order, but let me try',
      }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('counts only one of two simultaneous requests', async () => {
    const order = await awaitingApproval(MAX - 1);

    const results = await Promise.allSettled([
      designService.customerRequestChanges({ orderId: order.id, customer, comment: 'Change one please' }),
      designService.customerRequestChanges({ orderId: order.id, customer, comment: 'Change two please' }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.customerRevisionCount).toBe(MAX);
  });
});

describe('what the customer is told', () => {
  it('reports the revisions left on the design view', async () => {
    const order = await awaitingApproval(1);
    const view = await designService.getCustomerDesign({ orderId: order.id, customerId: customer.id });
    expect(view.revisions).toMatchObject({
      used: 1,
      left: MAX - 1,
      max: MAX,
      canRequestChanges: true,
    });
  });

  it('hides the button once the limit is reached', async () => {
    const order = await awaitingApproval(MAX);
    const view = await designService.getCustomerDesign({ orderId: order.id, customerId: customer.id });
    expect(view.revisions).toMatchObject({ used: MAX, left: 0, canRequestChanges: false });
  });

  it('never reports a negative number left', async () => {
    const order = await awaitingApproval(MAX + 3);
    const view = await designService.getCustomerDesign({ orderId: order.id, customerId: customer.id });
    expect(view.revisions.left).toBe(0);
  });
});

describe('approving does not spend a revision', () => {
  it('leaves the counter alone', async () => {
    const order = await awaitingApproval(1);
    await designService.customerApproveDesign({ orderId: order.id, customer });
    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('CUSTOMER_APPROVED');
    expect(fresh.customerRevisionCount).toBe(1);
  });

  it('is still allowed at the revision limit', async () => {
    const order = await awaitingApproval(MAX);
    const result = await designService.customerApproveDesign({ orderId: order.id, customer });
    expect(result.order.status).toBe('CUSTOMER_APPROVED');
  });
});

describe('an admin send-back does not spend a customer revision', () => {
  it('leaves the counter alone', async () => {
    const { order } = await db.createOrder({
      status: 'DESIGN_SUBMITTED',
      customerId: customer.id,
      designerId: designer.id,
    });
    await db.createDesignVersion({ orderId: order.id, designerId: designer.id, versionNo: 1 });

    await designService.adminSendBackDesign({
      orderId: order.id,
      note: 'Please raise the contrast',
      actor: { id: admin.id, role: 'ADMIN' },
    });

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('DESIGN_IN_PROGRESS');
    expect(fresh.customerRevisionCount).toBe(0);
  });
});
