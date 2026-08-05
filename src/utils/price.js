const env = require("../config/env");

function toMoney(value) {
  return Number(Number(value).toFixed(2));
}

function calculateLineTotal(unitPrice, quantity) {
  return toMoney(Number(unitPrice) * Number(quantity));
}

function calculateCartTotals(items) {
  const subtotal = items.reduce((sum, item) => {
    return sum + calculateLineTotal(item.unitPrice, item.quantity);
  }, 0);
  const shippingFee = items.length > 0 ? env.shippingFee : 0;

  return {
    subtotal: toMoney(subtotal),
    shippingFee: toMoney(shippingFee),
    totalAmount: toMoney(subtotal + shippingFee),
    itemCount: items.reduce((sum, item) => sum + Number(item.quantity), 0),
  };
}

module.exports = {
  toMoney,
  calculateLineTotal,
  calculateCartTotals,
};
