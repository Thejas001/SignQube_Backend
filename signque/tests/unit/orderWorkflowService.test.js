'use strict';

/**
 * The workflow gateway. These run against the test PostgreSQL database, because
 * the guarantees under test — the atomic claim, the single transaction, the
 * history row — are database behaviour, and a mocked Prisma would prove nothing.
 */

const orderWorkflowService = require('../../src/services/workflow/orderWorkflowService');
const transitions = require('../../src/services/workflow/transitions');
const db = require('../helpers/db');
const { ORDER_STATUS } = require('../../src/config/constants');

const { prisma } = db;

let customer;
let admin;
let designer;
let otherDesigner;
let printer;
let otherPrinter;
let otherCustomer;

beforeEach(async () => {
  await db.resetDatabase();
  customer = await db.createUser({ role: 'CUSTOMER' });
  otherCustomer = await db.createUser({ role: 'CUSTOMER' });
  admin = await db.createUser({ role: 'ADMIN' });
  designer = await db.createUser({ role: 'DESIGNER' });
  otherDesigner = await db.createUser({ role: 'DESIGNER' });
  printer = await db.createUser({ role: 'PRINTER' });
  otherPrinter = await db.createUser({ role: 'PRINTER' });
});

afterAll(async () => {
  await db.disconnect();
});

/** The actor for a role, with the right assignment so ownership passes. */
function actorFor(role) {
  switch (role) {
    case 'ADMIN':
      return { id: admin.id, role: 'ADMIN' };
    case 'DESIGNER':
      return { id: designer.id, role: 'DESIGNER' };
    case 'PRINTER':
      return { id: printer.id, role: 'PRINTER' };
    case 'CUSTOMER':
      return { id: customer.id, role: 'CUSTOMER' };
    default:
      return { role: 'SYSTEM' };
  }
}

/** An order in `status`, with the designer and printer assigned. */
async function orderIn(status, overrides = {}) {
  const { order } = await db.createOrder({
    status,
    customerId: customer.id,
    designerId: designer.id,
    printerId: printer.id,
    ...overrides,
  });
  return order;
}

// ---------------------------------------------------------------------------

describe('every allowed transition succeeds with the right role', () => {
  const cases = [];
  for (const [from, rules] of Object.entries(transitions.TRANSITIONS)) {
    for (const rule of rules) cases.push([from, rule.to, rule.by]);
  }

  it.each(cases)('%s → %s as %s', async (from, to, role) => {
    const order = await orderIn(from);

    const result = await orderWorkflowService.transition({
      orderId: order.id,
      to,
      actor: actorFor(role),
      note: `${from} → ${to}`,
    });

    expect(result.order.status).toBe(to);
    expect(result.from).toBe(from);

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe(to);
  });

  it('covers every row of the table', () => {
    // 10 non-final statuses, and the table is the only source of truth.
    expect(cases.length).toBe(
      Object.values(transitions.TRANSITIONS).reduce((n, rules) => n + rules.length, 0),
    );
    expect(cases.length).toBeGreaterThan(20);
  });
});

describe('a transition that is not in the table fails with 409', () => {
  const ALL = Object.keys(ORDER_STATUS);
  const unknown = [];
  for (const from of ALL) {
    for (const to of ALL) {
      if (from !== to && !transitions.isKnownTransition(from, to)) unknown.push([from, to]);
    }
  }

  it('has plenty of impossible moves to check', () => {
    expect(unknown.length).toBeGreaterThan(100);
  });

  it.each(unknown)('%s → %s is refused', async (from, to) => {
    const order = await orderIn(from);

    // An admin is the broadest actor, so a refusal here is about the move
    // itself rather than the role.
    await expect(
      orderWorkflowService.transition({
        orderId: order.id,
        to,
        actor: { id: admin.id, role: 'ADMIN' },
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_TRANSITION' });

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe(from);
  });
});

describe('the wrong role fails', () => {
  const wrongRoleCases = [];
  for (const [from, rules] of Object.entries(transitions.TRANSITIONS)) {
    for (const rule of rules) {
      for (const role of ['ADMIN', 'DESIGNER', 'PRINTER', 'CUSTOMER', 'SYSTEM']) {
        if (role !== rule.by) wrongRoleCases.push([from, rule.to, rule.by, role]);
      }
    }
  }

  it.each(wrongRoleCases)('%s → %s needs %s, so %s is refused', async (from, to, needed, role) => {
    const order = await orderIn(from);

    await expect(
      orderWorkflowService.transition({
        orderId: order.id,
        to,
        actor: actorFor(role),
      }),
    ).rejects.toMatchObject({
      statusCode: expect.any(Number),
      code: expect.stringMatching(/INVALID_TRANSITION|FORBIDDEN/),
    });

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe(from);
  });

  it('reports a wrong-role move as 409 INVALID_TRANSITION', async () => {
    const order = await orderIn('DESIGN_ASSIGNED');
    await expect(
      orderWorkflowService.transition({
        orderId: order.id,
        to: 'DESIGN_IN_PROGRESS',
        actor: { id: admin.id, role: 'ADMIN' },
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_TRANSITION' });
  });
});

describe('the wrong assignee fails with 403', () => {
  it('refuses a designer who is not assigned to the order', async () => {
    const order = await orderIn('DESIGN_ASSIGNED');

    await expect(
      orderWorkflowService.transition({
        orderId: order.id,
        to: 'DESIGN_IN_PROGRESS',
        actor: { id: otherDesigner.id, role: 'DESIGNER' },
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('DESIGN_ASSIGNED');
  });

  it('refuses a printer who is not assigned to the order', async () => {
    const order = await orderIn('PRINT_ASSIGNED');

    await expect(
      orderWorkflowService.transition({
        orderId: order.id,
        to: 'PRINTING',
        actor: { id: otherPrinter.id, role: 'PRINTER' },
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it("refuses a customer acting on someone else's order", async () => {
    const order = await orderIn('AWAITING_CUSTOMER_APPROVAL');

    await expect(
      orderWorkflowService.transition({
        orderId: order.id,
        to: 'CUSTOMER_APPROVED',
        actor: { id: otherCustomer.id, role: 'CUSTOMER' },
      }),
    ).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('lets an admin act on any order', async () => {
    const order = await orderIn('PLACED');
    const result = await orderWorkflowService.transition({
      orderId: order.id,
      to: 'CANCELLED',
      actor: { id: admin.id, role: 'ADMIN' },
      note: 'Admin cancelled',
    });
    expect(result.order.status).toBe('CANCELLED');
  });
});

describe('concurrent claims', () => {
  it('lets exactly one of two simultaneous takes succeed', async () => {
    const order = await orderIn('DESIGN_ASSIGNED');

    const results = await Promise.allSettled([
      orderWorkflowService.transition({
        orderId: order.id,
        to: 'DESIGN_IN_PROGRESS',
        actor: { id: designer.id, role: 'DESIGNER' },
        extra: { expectedFrom: 'DESIGN_ASSIGNED' },
      }),
      orderWorkflowService.transition({
        orderId: order.id,
        to: 'DESIGN_IN_PROGRESS',
        actor: { id: designer.id, role: 'DESIGNER' },
        extra: { expectedFrom: 'DESIGN_ASSIGNED' },
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.statusCode).toBe(409);

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('DESIGN_IN_PROGRESS');

    // Exactly one history row for the move, not two.
    const moves = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id, toStatus: 'DESIGN_IN_PROGRESS' },
    });
    expect(moves).toHaveLength(1);
  });

  it('lets only one of five simultaneous claims through', async () => {
    const order = await orderIn('DESIGN_ASSIGNED');

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        orderWorkflowService.transition({
          orderId: order.id,
          to: 'DESIGN_IN_PROGRESS',
          actor: { id: designer.id, role: 'DESIGNER' },
          extra: { expectedFrom: 'DESIGN_ASSIGNED' },
        }),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(4);
  });

  it('refuses a second admin approval of the same order', async () => {
    const order = await orderIn('PLACED');

    const results = await Promise.allSettled([
      orderWorkflowService.transition({
        orderId: order.id,
        to: 'DESIGN_ASSIGNED',
        actor: { id: admin.id, role: 'ADMIN' },
        extra: { expectedFrom: 'PLACED', data: { assignedDesignerId: designer.id } },
      }),
      orderWorkflowService.transition({
        orderId: order.id,
        to: 'REJECTED',
        actor: { id: admin.id, role: 'ADMIN' },
        extra: { expectedFrom: 'PLACED', data: { rejectReason: 'Blurred photo' } },
      }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});

describe('history', () => {
  it('writes a row on every transition', async () => {
    const order = await orderIn('PLACED');

    await orderWorkflowService.transition({
      orderId: order.id,
      to: 'DESIGN_ASSIGNED',
      actor: { id: admin.id, role: 'ADMIN' },
      note: 'Assigned to Dev',
      extra: { data: { assignedDesignerId: designer.id } },
    });

    const rows = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: 'asc' },
    });

    const move = rows.find((r) => r.toStatus === 'DESIGN_ASSIGNED');
    expect(move).toMatchObject({
      fromStatus: 'PLACED',
      toStatus: 'DESIGN_ASSIGNED',
      changedByUserId: admin.id,
      note: 'Assigned to Dev',
    });
  });

  it('records a SYSTEM change with no user', async () => {
    const order = await orderIn('PENDING_PAYMENT');

    await orderWorkflowService.transition({
      orderId: order.id,
      to: 'PLACED',
      actor: { role: 'SYSTEM' },
      note: 'Payment captured',
    });

    const row = await prisma.orderStatusHistory.findFirst({
      where: { orderId: order.id, toStatus: 'PLACED' },
    });
    expect(row.changedByUserId).toBeNull();
    expect(row.note).toBe('Payment captured');
  });

  it('writes one row per step along a multi-step path', async () => {
    const order = await orderIn('DESIGN_ASSIGNED');

    await orderWorkflowService.transition({
      orderId: order.id,
      to: 'DESIGN_IN_PROGRESS',
      actor: { id: designer.id, role: 'DESIGNER' },
    });
    await orderWorkflowService.transition({
      orderId: order.id,
      to: 'DESIGN_SUBMITTED',
      actor: { id: designer.id, role: 'DESIGNER' },
    });
    await orderWorkflowService.transition({
      orderId: order.id,
      to: 'AWAITING_CUSTOMER_APPROVAL',
      actor: { id: admin.id, role: 'ADMIN' },
    });

    const rows = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { id: 'asc' },
    });
    expect(rows.map((r) => r.toStatus)).toEqual([
      'DESIGN_ASSIGNED', // the fixture's own row
      'DESIGN_IN_PROGRESS',
      'DESIGN_SUBMITTED',
      'AWAITING_CUSTOMER_APPROVAL',
    ]);
  });

  it('writes a row when an assignment changes without the status moving', async () => {
    const order = await orderIn('DESIGN_IN_PROGRESS');

    await orderWorkflowService.reassign({
      orderId: order.id,
      allowedStatuses: ['DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS'],
      data: { assignedDesignerId: otherDesigner.id },
      actor: { id: admin.id, role: 'ADMIN' },
      note: 'Designer reassigned to Divya',
    });

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('DESIGN_IN_PROGRESS');
    expect(fresh.assignedDesignerId).toBe(otherDesigner.id);

    const row = await prisma.orderStatusHistory.findFirst({
      where: { orderId: order.id, note: 'Designer reassigned to Divya' },
    });
    expect(row).toMatchObject({
      fromStatus: 'DESIGN_IN_PROGRESS',
      toStatus: 'DESIGN_IN_PROGRESS',
      changedByUserId: admin.id,
    });
  });

  it('refuses a reassignment at a status that does not allow it', async () => {
    const order = await orderIn('PLACED');
    await expect(
      orderWorkflowService.reassign({
        orderId: order.id,
        allowedStatuses: ['DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS'],
        data: { assignedDesignerId: otherDesigner.id },
        actor: { id: admin.id, role: 'ADMIN' },
        note: 'nope',
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_TRANSITION' });
  });
});

describe('one transaction per transition', () => {
  it('rolls the status back when a related write fails', async () => {
    const order = await orderIn('DESIGN_IN_PROGRESS');

    await expect(
      orderWorkflowService.transition({
        orderId: order.id,
        to: 'DESIGN_SUBMITTED',
        actor: { id: designer.id, role: 'DESIGNER' },
        extra: {
          inTransaction: async () => {
            throw new Error('related write blew up');
          },
        },
      }),
    ).rejects.toThrow('related write blew up');

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('DESIGN_IN_PROGRESS');

    // The history row went back with it.
    const rows = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id, toStatus: 'DESIGN_SUBMITTED' },
    });
    expect(rows).toHaveLength(0);
  });

  it('writes the related row and the status together', async () => {
    const order = await orderIn('DESIGN_IN_PROGRESS');

    await orderWorkflowService.transition({
      orderId: order.id,
      to: 'DESIGN_SUBMITTED',
      actor: { id: designer.id, role: 'DESIGNER' },
      extra: {
        inTransaction: async (tx) =>
          tx.designVersion.create({
            data: {
              orderId: order.id,
              designerId: designer.id,
              versionNo: 1,
              fileUrl: 'https://s3.test.local/d.png',
              fileKey: 'designs/1/v1.png',
              status: 'SUBMITTED',
            },
          }),
      },
    });

    const versions = await prisma.designVersion.findMany({ where: { orderId: order.id } });
    expect(versions).toHaveLength(1);
    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('DESIGN_SUBMITTED');
  });
});

describe('side effects', () => {
  it('does not run them when the transaction fails', async () => {
    const order = await orderIn('DESIGN_IN_PROGRESS');
    const afterCommit = jest.fn();

    await expect(
      orderWorkflowService.transition({
        orderId: order.id,
        to: 'DESIGN_SUBMITTED',
        actor: { id: designer.id, role: 'DESIGNER' },
        extra: {
          inTransaction: async () => {
            throw new Error('nope');
          },
          afterCommit,
        },
      }),
    ).rejects.toThrow('nope');

    expect(afterCommit).not.toHaveBeenCalled();
  });

  it('does not run them when the move is refused', async () => {
    const order = await orderIn('PLACED');
    const afterCommit = jest.fn();

    await expect(
      orderWorkflowService.transition({
        orderId: order.id,
        to: 'COMPLETED',
        actor: { id: admin.id, role: 'ADMIN' },
        extra: { afterCommit },
      }),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    expect(afterCommit).not.toHaveBeenCalled();
  });

  it('runs them after the commit, with the updated order', async () => {
    const order = await orderIn('PLACED');
    const afterCommit = jest.fn();

    await orderWorkflowService.transition({
      orderId: order.id,
      to: 'DESIGN_ASSIGNED',
      actor: { id: admin.id, role: 'ADMIN' },
      extra: { data: { assignedDesignerId: designer.id }, afterCommit },
    });

    expect(afterCommit).toHaveBeenCalledTimes(1);
    const ctx = afterCommit.mock.calls[0][0];
    expect(ctx.order.status).toBe('DESIGN_ASSIGNED');
    expect(ctx.order.assignedDesignerId).toBe(designer.id);
    expect(ctx.from).toBe('PLACED');
  });

  it('keeps the status change when a side effect throws', async () => {
    const order = await orderIn('PLACED');

    // A failing email must never undo a status change.
    const result = await orderWorkflowService.transition({
      orderId: order.id,
      to: 'DESIGN_ASSIGNED',
      actor: { id: admin.id, role: 'ADMIN' },
      extra: {
        data: { assignedDesignerId: designer.id },
        afterCommit: async () => {
          throw new Error('SMTP is down');
        },
      },
    });

    expect(result.order.status).toBe('DESIGN_ASSIGNED');
    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('DESIGN_ASSIGNED');
  });
});

describe('guards', () => {
  it('refuses an unknown order', async () => {
    await expect(
      orderWorkflowService.transition({
        orderId: 999999,
        to: 'PLACED',
        actor: { role: 'SYSTEM' },
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('refuses when expectedFrom does not match', async () => {
    const order = await orderIn('DESIGN_IN_PROGRESS');
    await expect(
      orderWorkflowService.transition({
        orderId: order.id,
        to: 'DESIGN_SUBMITTED',
        actor: { id: designer.id, role: 'DESIGNER' },
        extra: { expectedFrom: 'DESIGN_ASSIGNED' },
      }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_TRANSITION' });
  });

  it('refuses an actor with no role', async () => {
    const order = await orderIn('PLACED');
    await expect(
      orderWorkflowService.transition({ orderId: order.id, to: 'CANCELLED', actor: null }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});

describe('availableActions', () => {
  it('lists what an admin can do at PLACED', async () => {
    const order = await orderIn('PLACED');
    expect(orderWorkflowService.availableActions(order, { role: 'ADMIN' }).sort()).toEqual(
      ['CANCELLED', 'DESIGN_ASSIGNED', 'REJECTED'],
    );
  });

  it('is empty for a user the order is not assigned to', async () => {
    const order = await orderIn('DESIGN_ASSIGNED');
    expect(
      orderWorkflowService.availableActions(order, { id: otherDesigner.id, role: 'DESIGNER' }),
    ).toEqual([]);
  });

  it('is empty at a final status', async () => {
    const order = await orderIn('COMPLETED');
    expect(orderWorkflowService.availableActions(order, { role: 'ADMIN' })).toEqual([]);
  });
});
