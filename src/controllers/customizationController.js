const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const customizationService = require("../services/customizationService");

const createCustomization = asyncHandler(async (req, res) => {
  const customization = await customizationService.createCustomization(req.user.id, req.body);
  return sendSuccess(res, "Customization created successfully", customization, 201);
});

module.exports = {
  createCustomization,
};
