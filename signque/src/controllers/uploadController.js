'use strict';

const uploadService = require('../services/uploadService');
const { created } = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const uploadPhoto = asyncHandler(async (req, res) => {
  const result = await uploadService.uploadCustomerPhoto({ file: req.file, userId: req.user.id });
  return created(res, result, 'Photo uploaded');
});

module.exports = { uploadPhoto };
