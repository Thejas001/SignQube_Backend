const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/apiResponse");
const cartService = require("../services/cartService");

const getCart = asyncHandler(async (req, res) => {
  const cart = await cartService.getCart(req.user.id);
  return sendSuccess(res, "Cart fetched successfully", cart);
});

const addCartItem = asyncHandler(async (req, res) => {
  const cart = await cartService.addCartItem(req.user.id, req.body);
  return sendSuccess(res, "Item added to cart successfully", cart, 201);
});

const updateCartItem = asyncHandler(async (req, res) => {
  const cart = await cartService.updateCartItem(req.user.id, req.params.id, req.body);
  return sendSuccess(res, "Cart item updated successfully", cart);
});

const removeCartItem = asyncHandler(async (req, res) => {
  const cart = await cartService.removeCartItem(req.user.id, req.params.id);
  return sendSuccess(res, "Cart item removed successfully", cart);
});

const clearCart = asyncHandler(async (req, res) => {
  const cart = await cartService.clearCart(req.user.id);
  return sendSuccess(res, "Cart cleared successfully", cart);
});

module.exports = {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart,
};
