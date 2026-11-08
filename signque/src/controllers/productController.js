'use strict';

const productService = require('../services/productService');
const { ok } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const list = asyncHandler(async (req, res) => {
  const products = await productService.listPublic();
  return ok(res, { products }, 'OK');
});

const get = asyncHandler(async (req, res) => {
  const product = await productService.getPublic(req.params.id);
  return ok(res, { product }, 'OK');
});

module.exports = { list, get };
