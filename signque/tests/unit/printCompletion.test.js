'use strict';

/**
 * Completion is blocked unless the print stage is QUALITY_CHECK, and the stage
 * machine itself (forward, and back when a quality check fails).
 */

const printService = require('../../src/services/printService');
const db = require('../helpers/db');

const { prisma } = db;

let customer;
let printer;
let otherPrinter;
let admin;
let designer;

beforeEach(async () => {
  await db.resetDatabase();
  customer = await db.createUser({ role: 'CUSTOMER' });
  printer = await db.createUser({ role: 'PRINTER' });
  otherPrinter = await db.createUser({ role: 'PRINTER' });
  admin = await db.createUser({ role: 'ADMIN' });
  designer = await db.createUser({ role: 'DESIGNER' });
});

afterAll(async () => {
  await db.disconnect();
});

/** An order at PRINTING with a print job in `stage`. */
async function jobAt(stage, { status = 'PRINTING' } = {}) {
  const { order } = await db.createOrder({
    status,
    customerId: customer.id,
    designerId: designer.id,
    printerId: printer.id,
  });
  await db.createDesignVersion({
    orderId: order.id,
    designerId: designer.id,
    versionNo: 1,
    status: 'CUSTOMER_APPROVED',
  });
  const printJob = await db.createPrintJob({
    orderId: order.id,
    printerId: printer.id,
    assignedById: admin.id,
    stage,
  });
  return { order, printJob };
}

describe('completion is blocked unless the stage is QUALITY_CHECK', () => {
  it.each(['ASSIGNED', 'CUTTING', 'PRINTING'])('refuses completion at stage %s', async (stage) => {
    const { order } = await jobAt(stage);

    await expect(printService.completeJob({ orderId: order.id, printer })).rejects.toMatchObject({
      statusCode: 409,
      code: 'INVALID_TRANSITION',
    });

    const fresh = await prisma.order.findUnique({ where: { id: order.id } });
    expect(fresh.status).toBe('PRINTING');
    const job = await prisma.printJob.findUnique({ where: { orderId: order.id } });
    expect(job.stage).toBe(stage);
  });

  it('says the quality check stage is required', async () => {
    const { order } = await jobAt('CUTTING');
    await expect(printService.completeJob({ orderId: order.id, printer })).rejects.toThrow(
      /only be completed from the quality check stage/,
    );
  });

  it('includes the current and required stage in the error details', async () => {
    const { order } = await jobAt('PRINTING');
    try {
      await printService.completeJob({ orderId: order.id, printer });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err.details).toEqual({ stage: 'PRINTING', required: 'QUALITY_CHECK' });
    }
  });

  it('allows completion from QUALITY_CHECK', async () => {
    const { order } = await jobAt('QUALITY_CHECK');

    const result = await printService.completeJob({ orderId: order.id, printer });

    // PRINTING → PRINT_COMPLETED → COMPLETED, in the one request.
    expect(result.order.status).toBe('COMPLETED');
    expect(result.printJob.stage).toBe('DONE');
    expect(result.printJob.completedAt).toBeInstanceOf(Date);
  });

  it('records both steps in the history', async () => {
    const { order } = await jobAt('QUALITY_CHECK');
    await printService.completeJob({ orderId: order.id, printer });

    const rows = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { id: 'asc' },
    });
    expect(rows.map((r) => r.toStatus)).toEqual(['PRINTING', 'PRINT_COMPLETED', 'COMPLETED']);

    const systemStep = rows.find((r) => r.toStatus === 'COMPLETED');
    expect(systemStep.changedByUserId).toBeNull();
  });

  it('notifies the customer that the order is complete', async () => {
    const { order } = await jobAt('QUALITY_CHECK');
    await printService.completeJob({ orderId: order.id, printer });

    const notification = await prisma.notification.findFirst({
      where: { userId: customer.id, type: 'ORDER_COMPLETED', channel: 'IN_APP' },
    });
    expect(notification).not.toBeNull();
    expect(notification.message).toMatch(/is complete/);
  });

  it('refuses a printer the job is not assigned to', async () => {
    const { order } = await jobAt('QUALITY_CHECK');
    await expect(
      printService.completeJob({ orderId: order.id, printer: otherPrinter }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses a second completion', async () => {
    const { order } = await jobAt('QUALITY_CHECK');
    await printService.completeJob({ orderId: order.id, printer });
    await expect(printService.completeJob({ orderId: order.id, printer })).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('refuses an order with no print job', async () => {
    const { order } = await db.createOrder({
      status: 'PRINTING',
      customerId: customer.id,
      printerId: printer.id,
    });
    await expect(printService.completeJob({ orderId: order.id, printer })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('taking a print job', () => {
  it('moves PRINT_ASSIGNED → PRINTING and the stage to CUTTING', async () => {
    const { order } = await jobAt('ASSIGNED', { status: 'PRINT_ASSIGNED' });

    const result = await printService.takeJob({ orderId: order.id, printer });

    expect(result.order.status).toBe('PRINTING');
    const job = await prisma.printJob.findUnique({ where: { orderId: order.id } });
    expect(job.stage).toBe('CUTTING');
    expect(job.startedAt).toBeInstanceOf(Date);
  });

  it('lets exactly one of two simultaneous takes through', async () => {
    const { order } = await jobAt('ASSIGNED', { status: 'PRINT_ASSIGNED' });

    const results = await Promise.allSettled([
      printService.takeJob({ orderId: order.id, printer }),
      printService.takeJob({ orderId: order.id, printer }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});

describe('the production stages', () => {
  it('moves forward CUTTING → PRINTING → QUALITY_CHECK', async () => {
    const { order } = await jobAt('CUTTING');

    let job = await printService.updateStage({ orderId: order.id, printer, stage: 'PRINTING' });
    expect(job.stage).toBe('PRINTING');

    job = await printService.updateStage({ orderId: order.id, printer, stage: 'QUALITY_CHECK' });
    expect(job.stage).toBe('QUALITY_CHECK');
  });

  it('goes back to CUTTING or PRINTING when a quality check fails', async () => {
    const { order } = await jobAt('QUALITY_CHECK');

    let job = await printService.updateStage({
      orderId: order.id,
      printer,
      stage: 'CUTTING',
      notes: 'Edge chipped — recutting',
    });
    expect(job.stage).toBe('CUTTING');
    expect(job.notes).toBe('Edge chipped — recutting');

    job = await printService.updateStage({ orderId: order.id, printer, stage: 'PRINTING' });
    expect(job.stage).toBe('PRINTING');
    job = await printService.updateStage({ orderId: order.id, printer, stage: 'QUALITY_CHECK' });
    expect(job.stage).toBe('QUALITY_CHECK');
  });

  it('leaves the order status at PRINTING throughout', async () => {
    const { order } = await jobAt('CUTTING');
    for (const stage of ['PRINTING', 'QUALITY_CHECK', 'CUTTING']) {
      await printService.updateStage({ orderId: order.id, printer, stage });
      const fresh = await prisma.order.findUnique({ where: { id: order.id } });
      expect(fresh.status).toBe('PRINTING');
    }
  });

  it('refuses a stage a printer may not set', async () => {
    const { order } = await jobAt('CUTTING');
    for (const stage of ['ASSIGNED', 'DONE', 'SHIPPED', 'done', '']) {
      await expect(
        printService.updateStage({ orderId: order.id, printer, stage }),
      ).rejects.toMatchObject({ statusCode: 422 });
    }
  });

  it('refuses a stage change while the order is not printing', async () => {
    const { order } = await jobAt('ASSIGNED', { status: 'PRINT_ASSIGNED' });
    await expect(
      printService.updateStage({ orderId: order.id, printer, stage: 'PRINTING' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'INVALID_TRANSITION' });
  });

  it('refuses a printer the job is not assigned to', async () => {
    const { order } = await jobAt('CUTTING');
    await expect(
      printService.updateStage({ orderId: order.id, printer: otherPrinter, stage: 'PRINTING' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('refuses a stage change on a finished job', async () => {
    const { order } = await jobAt('QUALITY_CHECK');
    await printService.completeJob({ orderId: order.id, printer });
    await expect(
      printService.updateStage({ orderId: order.id, printer, stage: 'CUTTING' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });
});

describe('the printer job view', () => {
  it('reports what the printer may do right now', async () => {
    const { order } = await jobAt('QUALITY_CHECK');
    const view = await printService.getPrinterJob({ orderId: order.id, printerId: printer.id });

    expect(view).toMatchObject({
      canTake: false,
      canUpdateStage: true,
      canComplete: true,
      printSpec: { color: 'WHITE', thicknessMm: 3, size: 'A4' },
    });
    expect(view.design.fileUrl).toMatch(/^https:\/\/s3\.test\.local\//);
    expect(view.totalQuantity).toBe(1);
  });

  it('does not offer completion before the quality check', async () => {
    const { order } = await jobAt('CUTTING');
    const view = await printService.getPrinterJob({ orderId: order.id, printerId: printer.id });
    expect(view.canComplete).toBe(false);
    expect(view.canUpdateStage).toBe(true);
  });

  it("refuses another printer's job", async () => {
    const { order } = await jobAt('CUTTING');
    await expect(
      printService.getPrinterJob({ orderId: order.id, printerId: otherPrinter.id }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
});
