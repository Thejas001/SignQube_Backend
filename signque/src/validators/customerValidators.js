'use strict';

const { z } = require('zod');
const c = require('./common');

// ----------------------------------------------------------------- addresses

const addressBody = z.object({
  fullName: c.name,
  phone: z.string().trim().regex(/^[+]?[0-9\s-]{7,20}$/, 'Enter a valid phone number'),
  line1: z.string().trim().min(1, 'Address line 1 is required').max(255),
  line2: z.string().trim().max(255).optional().or(z.literal('').transform(() => undefined)),
  city: z.string().trim().min(1, 'City is required').max(100),
  state: z.string().trim().min(1, 'State is required').max(100),
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit pincode'),
  isDefault: z.boolean().optional(),
});

const updateAddressBody = addressBody.partial().refine((v) => Object.keys(v).length > 0, {
  message: 'Send at least one field to update',
});

// ------------------------------------------------------------ customizations

const createCustomizationSchema = z.object({
  productId: z.coerce.number().int().positive(),
  photoUrl: z.string().url('photoUrl must be a URL'),
  photoKey: z.string().min(1, 'photoKey is required').max(512),
});

// ------------------------------------------------------------------- orders

const createOrderSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.coerce.number().int().positive(),
        customizationId: z.coerce.number().int().positive(),
        quantity: z.coerce.number().int().positive().max(99),
      }),
    )
    .min(1, 'Add at least one item')
    .max(20, 'An order can hold at most 20 items'),
  addressId: z.coerce.number().int().positive(),
  // Note: no price field. Totals are always computed on the server.
});

const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

const listMineQuery = z
  .object({
    status: c.orderStatusEnum.optional(),
  })
  .merge(c.pagination);

const requestChangesSchema = z.object({
  comment: c.longText('A comment'),
});

module.exports = {
  addressBody,
  updateAddressBody,
  createCustomizationSchema,
  createOrderSchema,
  verifyPaymentSchema,
  listMineQuery,
  requestChangesSchema,
};
