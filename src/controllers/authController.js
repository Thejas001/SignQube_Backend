const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const authService = require("../services/authService");

const register = asyncHandler(async (req, res) => {
  const result = await authService.registerUser(req.body);
  return sendSuccess(res, "User registered successfully", result, 201);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.loginUser(req.body);
  return sendSuccess(res, "Login successful", result);
});

const refresh = asyncHandler(async (req, res) => {
  const result = await authService.refreshUserToken(req.body.refreshToken);
  return sendSuccess(res, "Token refreshed successfully", result);
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getCurrentUser(req.user.id);
  return sendSuccess(res, "Current user fetched successfully", user);
});

module.exports = {
  register,
  login,
  refresh,
  me,
};
