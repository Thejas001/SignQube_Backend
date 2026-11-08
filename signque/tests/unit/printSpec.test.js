'use strict';

/**
 * Print spec validation, at both layers that enforce it: the service helper and
 * the Zod schema the route uses.
 */

const printService = require('../../src/services/printService');
const { createPrintJobSchema } = require('../../src/validators/adminValidators');
const { MATERIAL_COLORS, THICKNESSES_MM, SHEET_SIZES } = require('../../src/config/constants');

describe('validatePrintSpec', () => {
  it('accepts every allowed combination', () => {
    for (const color of MATERIAL_COLORS) {
      for (const thicknessMm of THICKNESSES_MM) {
        for (const size of SHEET_SIZES) {
          expect(printService.validatePrintSpec({ color, thicknessMm, size })).toEqual({
            color,
            thicknessMm,
            size,
          });
        }
      }
    }
  });

  it('coerces a numeric string thickness', () => {
    expect(printService.validatePrintSpec({ color: 'WHITE', thicknessMm: '5', size: 'A3' })).toEqual({
      color: 'WHITE',
      thicknessMm: 5,
      size: 'A3',
    });
  });

  describe('rejects the values named in the spec', () => {
    it('rejects 7 mm', () => {
      expect(() =>
        printService.validatePrintSpec({ color: 'WHITE', thicknessMm: 7, size: 'A3' }),
      ).toThrow(/not allowed/);

      try {
        printService.validatePrintSpec({ color: 'WHITE', thicknessMm: 7, size: 'A3' });
      } catch (err) {
        expect(err.statusCode).toBe(422);
        expect(err.details.thicknessMm).toEqual({ got: 7, allowed: THICKNESSES_MM });
      }
    });

    it('rejects A5', () => {
      expect(() =>
        printService.validatePrintSpec({ color: 'WHITE', thicknessMm: 3, size: 'A5' }),
      ).toThrow(/not allowed/);

      try {
        printService.validatePrintSpec({ color: 'WHITE', thicknessMm: 3, size: 'A5' });
      } catch (err) {
        expect(err.details.size).toEqual({ got: 'A5', allowed: SHEET_SIZES });
      }
    });

    it('rejects RED', () => {
      expect(() =>
        printService.validatePrintSpec({ color: 'RED', thicknessMm: 3, size: 'A3' }),
      ).toThrow(/not allowed/);

      try {
        printService.validatePrintSpec({ color: 'RED', thicknessMm: 3, size: 'A3' });
      } catch (err) {
        expect(err.details.color).toEqual({ got: 'RED', allowed: MATERIAL_COLORS });
      }
    });
  });

  it('rejects other out-of-range thicknesses', () => {
    for (const thicknessMm of [0, 1, 7, 9, 10, 2.5, -3]) {
      expect(() =>
        printService.validatePrintSpec({ color: 'BLACK', thicknessMm, size: 'A4' }),
      ).toThrow(/not allowed/);
    }
  });

  it('rejects missing fields', () => {
    expect(() => printService.validatePrintSpec({})).toThrow(/not allowed/);
    expect(() =>
      printService.validatePrintSpec({ color: 'WHITE', thicknessMm: undefined, size: 'A3' }),
    ).toThrow(/not allowed/);
  });

  it('reports every bad field at once', () => {
    try {
      printService.validatePrintSpec({ color: 'RED', thicknessMm: 7, size: 'A5' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(Object.keys(err.details).sort()).toEqual(['color', 'size', 'thicknessMm']);
    }
  });

  it('is case-sensitive about colour and size', () => {
    expect(() =>
      printService.validatePrintSpec({ color: 'white', thicknessMm: 3, size: 'A3' }),
    ).toThrow(/not allowed/);
    expect(() =>
      printService.validatePrintSpec({ color: 'WHITE', thicknessMm: 3, size: 'a3' }),
    ).toThrow(/not allowed/);
  });
});

describe('the Zod schema on the route', () => {
  const valid = { printerId: 1, color: 'WHITE', thicknessMm: 5, size: 'A3' };

  it('accepts a valid spec', () => {
    expect(createPrintJobSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects 7 mm, A5 and RED before the service is reached', () => {
    expect(createPrintJobSchema.safeParse({ ...valid, thicknessMm: 7 }).success).toBe(false);
    expect(createPrintJobSchema.safeParse({ ...valid, size: 'A5' }).success).toBe(false);
    expect(createPrintJobSchema.safeParse({ ...valid, color: 'RED' }).success).toBe(false);
  });

  it('says which thicknesses are allowed', () => {
    const result = createPrintJobSchema.safeParse({ ...valid, thicknessMm: 7 });
    expect(result.error.issues[0].message).toBe('Thickness must be one of 2, 3, 4, 5, 6, 8 mm');
  });

  it('needs a printer', () => {
    const { printerId, ...withoutPrinter } = valid;
    expect(createPrintJobSchema.safeParse(withoutPrinter).success).toBe(false);
  });
});

describe('printOptions', () => {
  it('reports exactly the allowed sets, for the admin form', () => {
    expect(printService.printOptions()).toEqual({
      colors: MATERIAL_COLORS,
      thicknessesMm: THICKNESSES_MM,
      sizes: SHEET_SIZES,
      stages: ['CUTTING', 'PRINTING', 'QUALITY_CHECK'],
    });
  });
});
