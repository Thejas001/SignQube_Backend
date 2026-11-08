'use strict';

/**
 * Money maths. Everything is done in paise (integers) so no float rounding can
 * creep into a total, then converted back to a 2-decimal rupee string for
 * Prisma's Decimal columns.
 *
 * Prices ALWAYS come from Product.basePrice — never from the client.
 */

const { ValidationError } = require('./errors');

/**
 * Rupees → integer paise.
 *
 * The decimal digits are read from the value's string form rather than
 * multiplying by 100, because `1.005 * 100` is 100.49999999999999 in binary
 * floating point and would round down to the wrong paisa.
 *
 * @param {string|number|import('@prisma/client').Prisma.Decimal} value
 */
function toPaise(value) {
  if (value === null || value === undefined) throw new ValidationError('Invalid money value');

  const text = typeof value === 'object' ? String(value.toString()) : String(value);
  if (!Number.isFinite(Number(text))) throw new ValidationError('Invalid money value');

  const match = /^\s*(-?)(\d*)(?:\.(\d*))?\s*$/.exec(text);
  if (!match) {
    // Exponent form and anything else unusual: fall back to the float path.
    const n = Number(text);
    if (!Number.isFinite(n)) throw new ValidationError('Invalid money value');
    return Math.round(n * 100);
  }

  const [, sign, whole = '', frac = ''] = match;
  const rupees = BigInt(whole || '0');
  // Two digits of paise, rounding half-up on the third.
  const paise = BigInt((frac + '00').slice(0, 2));
  const roundUp = frac.length > 2 && Number(frac[2]) >= 5 ? 1n : 0n;

  const total = rupees * 100n + paise + roundUp;
  return Number(sign === '-' ? -total : total);
}

/** @param {number} paise @returns {string} e.g. "1898.00" */
function fromPaise(paise) {
  return (paise / 100).toFixed(2);
}

/**
 * Recompute an order's totals on the server.
 *
 * @param {Array<{ unitPrice: any, quantity: number }>} items unitPrice from Product.basePrice
 * @param {number} shippingFee
 * @returns {{ subtotal: string, shippingFee: string, total: string,
 *             lines: Array<{ unitPrice: string, quantity: number, lineTotal: string }> }}
 */
function calculateOrderTotals(items, shippingFee) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new ValidationError('An order needs at least one item');
  }

  const lines = items.map((item) => {
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ValidationError('Quantity must be a whole number of at least 1');
    }
    const unitPaise = toPaise(item.unitPrice);
    if (unitPaise < 0) throw new ValidationError('Unit price cannot be negative');
    return {
      unitPrice: fromPaise(unitPaise),
      quantity,
      lineTotal: fromPaise(unitPaise * quantity),
      _linePaise: unitPaise * quantity,
    };
  });

  const subtotalPaise = lines.reduce((sum, l) => sum + l._linePaise, 0);
  const shippingPaise = toPaise(shippingFee ?? 0);
  if (shippingPaise < 0) throw new ValidationError('Shipping fee cannot be negative');

  return {
    subtotal: fromPaise(subtotalPaise),
    shippingFee: fromPaise(shippingPaise),
    total: fromPaise(subtotalPaise + shippingPaise),
    lines: lines.map(({ _linePaise, ...rest }) => rest),
  };
}

/** Razorpay takes amounts in the smallest currency unit. */
function toRazorpayAmount(total) {
  return toPaise(total);
}

module.exports = { toPaise, fromPaise, calculateOrderTotals, toRazorpayAmount };
