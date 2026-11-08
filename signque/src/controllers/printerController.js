'use strict';

const printService = require('../services/printService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const listJobs = asyncHandler(async (req, res) => {
  const jobs = await printService.listPrinterJobs({ printerId: req.user.id, stage: req.query.stage });
  return ok(res, { jobs }, 'OK');
});

const getJob = asyncHandler(async (req, res) => {
  const job = await printService.getPrinterJob({
    orderId: req.params.orderId,
    printerId: req.user.id,
  });
  return ok(res, { job }, 'OK');
});

const takeJob = asyncHandler(async (req, res) => {
  const result = await printService.takeJob({ orderId: req.params.orderId, printer: req.user });
  return ok(res, { order: result.order }, 'Print job taken');
});

const updateStage = asyncHandler(async (req, res) => {
  const printJob = await printService.updateStage({
    orderId: req.params.orderId,
    printer: req.user,
    stage: req.body.stage,
    notes: req.body.notes,
  });
  return ok(res, { printJob }, `Stage set to ${req.body.stage}`);
});

const completeJob = asyncHandler(async (req, res) => {
  const result = await printService.completeJob({
    orderId: req.params.orderId,
    printer: req.user,
  });
  return ok(res, result, 'Print job complete. The order is now completed.');
});

module.exports = { listJobs, getJob, takeJob, updateStage, completeJob };
