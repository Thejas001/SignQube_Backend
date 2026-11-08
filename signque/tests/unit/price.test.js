'use strict';

const { calculateOrderTotals, toPaise, fromPaise, toRazorpayAmount } = require('../../src/utils/price');

describe('toPaise / fromPaise', () => {
  it('converts rupee strings to integer paise', () => {
    expect(toPaise('799.00')).toBe(79900);
    expect(toPaise('1999.99')).toBe(199999);
    expect(toPaise(99)).toBe(9900);
    expect(toPaise('0.00')).toBe(0);
  });

  it('handles the values that break naive float maths', () => {
    // 0.1 + 0.2 in floats is 0.30000000000000004; in paise it is exact.
    expect(toPaise('0.10') + toPaise('0.20')).toBe(30);
    expect(fromPaise(toPaise('0.10') + toPaise('0.20'))).toBe('0.30');
    expect(toPaise('1234.56')).toBe(123456);
    // 1.005 * 100 is 100.49999999999999 as a float, which would round DOWN to
    // 100. Reading the decimal digits from the string gives the right answer.
    expect(toPaise(1.005)).toBe(101);
    expect(toPaise('1.005')).toBe(101);
    expect(toPaise('2.675')).toBe(268);
    expect(toPaise('0.004')).toBe(0);
    expect(toPaise('0.005')).toBe(1);
  });

  it('keeps large totals exact', () => {
    expect(toPaise('9999999.99')).toBe(999999999);
    expect(fromPaise(999999999)).toBe('9999999.99');
  });

  it('handles values with no decimal part, and negatives', () => {
    expect(toPaise('799')).toBe(79900);
    expect(toPaise('.5')).toBe(50);
    expect(toPaise('-100.25')).toBe(-10025);
  });

  it('accepts a Prisma Decimal-like object', () => {
    expect(toPaise({ toString: () => '1299.50' })).toBe(129950);
  });

  it('always formats back to two decimals', () => {
    expect(fromPaise(79900)).toBe('799.00');
    expect(fromPaise(5)).toBe('0.05');
    expect(fromPaise(0)).toBe('0.00');
  });

  it('refuses a value that is not a number', () => {
    expect(() => toPaise('not money')).toThrow(/Invalid money value/);
    expect(() => toPaise(undefined)).toThrow(/Invalid money value/);
  });
});

describe('calculateOrderTotals', () => {
  it('computes subtotal + shipping for a single line', () => {
    const result = calculateOrderTotals([{ unitPrice: '799.00', quantity: 1 }], 99);
    expect(result).toMatchObject({
      subtotal: '799.00',
      shippingFee: '99.00',
      total: '898.00',
    });
    expect(result.lines).toEqual([{ unitPrice: '799.00', quantity: 1, lineTotal: '799.00' }]);
  });

  it('multiplies by quantity', () => {
    const result = calculateOrderTotals([{ unitPrice: '1299.00', quantity: 3 }], 99);
    expect(result.subtotal).toBe('3897.00');
    expect(result.total).toBe('3996.00');
    expect(result.lines[0].lineTotal).toBe('3897.00');
  });

  it('adds several lines', () => {
    const result = calculateOrderTotals(
      [
        { unitPrice: '799.00', quantity: 2 },
        { unitPrice: '1999.00', quantity: 1 },
        { unitPrice: '1299.50', quantity: 2 },
      ],
      99,
    );
    // 1598.00 + 1999.00 + 2599.00
    expect(result.subtotal).toBe('6196.00');
    expect(result.total).toBe('6295.00');
    expect(result.lines.map((l) => l.lineTotal)).toEqual(['1598.00', '1999.00', '2599.00']);
  });

  it('charges the shipping fee once, not per line', () => {
    const one = calculateOrderTotals([{ unitPrice: '500.00', quantity: 1 }], 99);
    const three = calculateOrderTotals(
      [
        { unitPrice: '500.00', quantity: 1 },
        { unitPrice: '500.00', quantity: 1 },
        { unitPrice: '500.00', quantity: 1 },
      ],
      99,
    );
    expect(one.shippingFee).toBe('99.00');
    expect(three.shippingFee).toBe('99.00');
    expect(three.total).toBe('1599.00');
  });

  it('accepts a zero shipping fee', () => {
    const result = calculateOrderTotals([{ unitPrice: '799.00', quantity: 1 }], 0);
    expect(result.total).toBe('799.00');
  });

  it('refuses an empty order', () => {
    expect(() => calculateOrderTotals([], 99)).toThrow(/at least one item/);
    expect(() => calculateOrderTotals(null, 99)).toThrow(/at least one item/);
  });

  it('refuses a quantity that is not a whole number of at least 1', () => {
    expect(() => calculateOrderTotals([{ unitPrice: '100.00', quantity: 0 }], 99)).toThrow(/at least 1/);
    expect(() => calculateOrderTotals([{ unitPrice: '100.00', quantity: -2 }], 99)).toThrow(/at least 1/);
    expect(() => calculateOrderTotals([{ unitPrice: '100.00', quantity: 1.5 }], 99)).toThrow(/whole number/);
  });

  it('refuses negative money', () => {
    expect(() => calculateOrderTotals([{ unitPrice: '-100.00', quantity: 1 }], 99)).toThrow(/cannot be negative/);
    expect(() => calculateOrderTotals([{ unitPrice: '100.00', quantity: 1 }], -5)).toThrow(/cannot be negative/);
  });

  it('never trusts a price the caller attached to the item', () => {
    // Only unitPrice and quantity are read. A client-supplied `lineTotal` or
    // `total` is ignored entirely.
    const result = calculateOrderTotals(
      [{ unitPrice: '1000.00', quantity: 2, lineTotal: '1.00', total: '1.00', price: '1.00' }],
      99,
    );
    expect(result.subtotal).toBe('2000.00');
    expect(result.total).toBe('2099.00');
  });
});

describe('toRazorpayAmount', () => {
  it('returns paise, as Razorpay expects', () => {
    expect(toRazorpayAmount('898.00')).toBe(89800);
    expect(toRazorpayAmount('1.00')).toBe(100);
  });
});
