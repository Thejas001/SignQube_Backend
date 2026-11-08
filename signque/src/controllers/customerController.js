'use strict';

/** Everything a signed-in CUSTOMER does: addresses, customizations, orders, design review. */

const addressService = require('../services/addressService');
const customizationService = require('../services/customizationService');
const orderService = require('../services/orderService');
const designService = require('../services/designService');
const paymentService = require('../services/paymentService');

const { ok, created, paginated } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

// ----------------------------------------------------------------- addresses

const listAddresses = asyncHandler(async (req, res) => {
  const addresses = await addressService.listMine(req.user.id);
  return ok(res, { addresses }, 'OK');
});

const createAddress = asyncHandler(async (req, res) => {
  const address = await addressService.create({ userId: req.user.id, ...req.body });
  return created(res, { address }, 'Address saved');
});

const updateAddress = asyncHandler(async (req, res) => {
  const address = await addressService.update({ id: req.params.id, userId: req.user.id, ...req.body });
  return ok(res, { address }, 'Address updated');
});

const deleteAddress = asyncHandler(async (req, res) => {
  const result = await addressService.remove({ id: req.params.id, userId: req.user.id });
  return ok(res, result, 'Address deleted');
});

// ------------------------------------------------------------ customizations

const createCustomization = asyncHandler(async (req, res) => {
  const customization = await customizationService.create({ userId: req.user.id, ...req.body });
  return created(res, { customization }, 'Photo attached to the product');
});

// -------------------------------------------------------------------- orders

const createOrder = asyncHandler(async (req, res) => {
  const result = await orderService.createOrder({
    customerId: req.user.id,
    addressId: req.body.addressId,
    items: req.body.items,
  });
  return created(res, result, 'Order created. Complete the payment to place it.');
});

const verifyPayment = asyncHandler(async (req, res) => {
  const result = await paymentService.verifyCheckoutSignature({
    orderId: req.params.id,
    customerId: req.user.id,
    ...req.body,
  });
  return ok(res, result, 'Payment signature verified');
});

const retryPayment = asyncHandler(async (req, res) => {
  const result = await paymentService.retryPayment({
    orderId: req.params.id,
    customerId: req.user.id,
  });
  return ok(res, result, 'New payment started');
});

const listMyOrders = asyncHandler(async (req, res) => {
  const { items, pagination } = await orderService.listMine({
    customerId: req.user.id,
    status: req.query.status,
    page: req.query.page,
    pageSize: req.query.pageSize,
  });
  return paginated(res, items, pagination, 'OK');
});

const getMyOrder = asyncHandler(async (req, res) => {
  const order = await orderService.getMine({ orderId: req.params.id, customerId: req.user.id });
  return ok(res, { order }, 'OK');
});

// ------------------------------------------------------------- design review

const getMyDesign = asyncHandler(async (req, res) => {
  const result = await designService.getCustomerDesign({
    orderId: req.params.id,
    customerId: req.user.id,
  });
  return ok(res, result, 'OK');
});

const approveDesign = asyncHandler(async (req, res) => {
  const result = await designService.customerApproveDesign({
    orderId: req.params.id,
    customer: req.user,
  });
  return ok(res, { order: result.order }, 'Design approved');
});

const requestChanges = asyncHandler(async (req, res) => {
  const result = await designService.customerRequestChanges({
    orderId: req.params.id,
    customer: req.user,
    comment: req.body.comment,
  });
  return ok(res, { order: result.order }, 'Change request sent to the designer');
});

module.exports = {
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  createCustomization,
  createOrder,
  verifyPayment,
  retryPayment,
  listMyOrders,
  getMyOrder,
  getMyDesign,
  approveDesign,
  requestChanges,
};
