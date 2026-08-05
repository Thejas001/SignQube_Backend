const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const addressService = require("../services/addressService");

const createAddress = asyncHandler(async (req, res) => {
  const address = await addressService.createAddress(req.user.id, req.body);
  return sendSuccess(res, "Address created successfully", address, 201);
});

const getAddresses = asyncHandler(async (req, res) => {
  const addresses = await addressService.getAddresses(req.user.id);
  return sendSuccess(res, "Addresses fetched successfully", addresses);
});

module.exports = {
  createAddress,
  getAddresses,
};
