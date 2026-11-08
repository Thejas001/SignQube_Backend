'use strict';

const designService = require('../services/designService');
const { DESIGNER_JOB_STATUSES } = require('../validators/staffValidators');
const { ok, created } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const listJobs = asyncHandler(async (req, res) => {
  const statuses = req.query.status === 'all' ? DESIGNER_JOB_STATUSES : [req.query.status];
  const jobs = await designService.listDesignerJobs({ designerId: req.user.id, statuses });
  return ok(res, { jobs }, 'OK');
});

const getJob = asyncHandler(async (req, res) => {
  const job = await designService.getDesignerJob({
    orderId: req.params.orderId,
    designerId: req.user.id,
  });
  return ok(res, { job }, 'OK');
});

const takeJob = asyncHandler(async (req, res) => {
  const result = await designService.takeJob({ orderId: req.params.orderId, designer: req.user });
  return ok(res, { order: result.order }, 'Job taken');
});

const submitDesign = asyncHandler(async (req, res) => {
  const result = await designService.submitDesign({
    orderId: req.params.orderId,
    designer: req.user,
    file: req.file,
    note: req.body?.note,
  });
  return created(res, result, 'Design submitted for review');
});

module.exports = { listJobs, getJob, takeJob, submitDesign };
