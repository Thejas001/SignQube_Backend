'use strict';

const { z } = require('zod');
const {
  ORDER_STATUS,
  MATERIAL_COLORS,
  THICKNESSES_MM,
  SHEET_SIZES,
  PRINTER_SETTABLE_STAGES,
  PAGINATION,
} = require('../config/constants');

/** A positive integer path parameter, e.g. /orders/:id */
const idParam = (name = 'id') =>
  z.object({ [name]: z.coerce.number().int().positive(`${name} must be a positive integer`) });

const pagination = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(PAGINATION.maxPageSize).default(PAGINATION.defaultPageSize),
});

const orderStatusEnum = z.enum(Object.keys(ORDER_STATUS));
const materialColorEnum = z.enum(MATERIAL_COLORS);
const sheetSizeEnum = z.enum(SHEET_SIZES);
const printerStageEnum = z.enum(PRINTER_SETTABLE_STAGES);

/** Thickness is a number, so it gets an explicit allowed-list refinement. */
const thicknessMm = z.coerce
  .number()
  .int()
  .refine((v) => THICKNESSES_MM.includes(v), {
    message: `Thickness must be one of ${THICKNESSES_MM.join(', ')} mm`,
  });

const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(255);
const password = z.string().min(8, 'Password must be at least 8 characters').max(128);
const name = z.string().trim().min(1, 'Name is required').max(255);
const phone = z
  .string()
  .trim()
  .regex(/^[+]?[0-9\s-]{7,20}$/, 'Enter a valid phone number')
  .optional()
  .or(z.literal('').transform(() => undefined));

/** Reason / note / comment fields: 5–1000 characters, as specified. */
const longText = (label = 'This field') =>
  z
    .string()
    .trim()
    .min(5, `${label} must be at least 5 characters`)
    .max(1000, `${label} must be at most 1000 characters`);

const money = z.coerce.number().nonnegative().max(9999999.99);

/** An ISO date (or plain date) from a query string. */
const dateParam = z.coerce.date();

module.exports = {
  idParam,
  pagination,
  orderStatusEnum,
  materialColorEnum,
  sheetSizeEnum,
  printerStageEnum,
  thicknessMm,
  email,
  password,
  name,
  phone,
  longText,
  money,
  dateParam,
};
