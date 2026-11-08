'use strict';

const orderService = require('../services/orderService');
const designService = require('../services/designService');
const printService = require('../services/printService');
const userService = require('../services/userService');
const productService = require('../services/productService');

const { ok, created, paginated } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

// ----------------------------------------------------------------- dashboard

const dashboard = asyncHandler(async (req, res) => {
  const data = await orderService.adminDashboard();
  return ok(res, data, 'OK');
});

// -------------------------------------------------------------------- orders

const listOrders = asyncHandler(async (req, res) => {
  const { items, pagination } = await orderService.adminList(req.query);
  return paginated(res, items, pagination, 'OK');
});

const getOrder = asyncHandler(async (req, res) => {
  const order = await orderService.adminGet(req.params.id);
  return ok(res, { order }, 'OK');
});

const approveOrder = asyncHandler(async (req, res) => {
  const result = await orderService.adminApprove({
    orderId: req.params.id,
    designerId: req.body.designerId,
    actor: req.user,
  });
  return ok(res, { order: result.order }, 'Order approved and designer assigned');
});

const rejectOrder = asyncHandler(async (req, res) => {
  const result = await orderService.adminReject({
    orderId: req.params.id,
    reason: req.body.reason,
    actor: req.user,
  });
  return ok(res, { order: result.order }, 'Order rejected and a refund started');
});

const cancelOrder = asyncHandler(async (req, res) => {
  const result = await orderService.adminCancel({
    orderId: req.params.id,
    reason: req.body.reason,
    actor: req.user,
  });
  return ok(res, { order: result.order }, 'Order cancelled');
});

const reassignDesigner = asyncHandler(async (req, res) => {
  const result = await orderService.adminReassignDesigner({
    orderId: req.params.id,
    designerId: req.body.designerId,
    actor: req.user,
  });
  return ok(res, { order: result.order }, 'Designer reassigned');
});

// -------------------------------------------------------------- design check

const approveDesign = asyncHandler(async (req, res) => {
  const result = await designService.adminApproveDesign({
    orderId: req.params.id,
    actor: req.user,
    comment: req.body?.comment,
  });
  return ok(res, { order: result.order }, 'Design sent to the customer');
});

const sendBackDesign = asyncHandler(async (req, res) => {
  const result = await designService.adminSendBackDesign({
    orderId: req.params.id,
    note: req.body.note,
    actor: req.user,
  });
  return ok(res, { order: result.order }, 'Design sent back to the designer');
});

// --------------------------------------------------------------- print jobs

const createPrintJob = asyncHandler(async (req, res) => {
  const result = await printService.assignPrinting({
    orderId: req.params.id,
    actor: req.user,
    ...req.body,
  });
  return created(res, result, 'Print job assigned');
});

const reassignPrinter = asyncHandler(async (req, res) => {
  const result = await printService.reassignPrinter({
    orderId: req.params.id,
    printerId: req.body.printerId,
    actor: req.user,
  });
  return ok(res, { order: result.order }, 'Printing user reassigned');
});

const printOptions = asyncHandler(async (req, res) => {
  return ok(res, printService.printOptions(), 'OK');
});

// -------------------------------------------------------------------- users

const listUsers = asyncHandler(async (req, res) => {
  // ?role=DESIGNER|PRINTER returns the assignment dropdown shape, with open-job
  // counts, rather than a paginated table.
  if (req.query.role === 'DESIGNER' || req.query.role === 'PRINTER') {
    const users = await userService.listAssignable(req.query.role);
    return ok(res, { users }, 'OK');
  }
  const { items, total } = await userService.listUsers(req.query);
  return paginated(res, items, { page: req.query.page, pageSize: req.query.pageSize, total }, 'OK');
});

const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createStaffUser(req.body);
  return created(res, { user }, `${req.body.role} account created`);
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body);
  return ok(res, { user }, 'User updated');
});

// ----------------------------------------------------------------- products

const listProducts = asyncHandler(async (req, res) => {
  const products = await productService.listAll();
  return ok(res, { products }, 'OK');
});

const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.create(req.body);
  return created(res, { product }, 'Product created');
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.update(req.params.id, req.body);
  return ok(res, { product }, 'Product updated');
});

module.exports = {
  dashboard,
  listOrders,
  getOrder,
  approveOrder,
  rejectOrder,
  cancelOrder,
  reassignDesigner,
  approveDesign,
  sendBackDesign,
  createPrintJob,
  reassignPrinter,
  printOptions,
  listUsers,
  createUser,
  updateUser,
  listProducts,
  createProduct,
  updateProduct,
};
