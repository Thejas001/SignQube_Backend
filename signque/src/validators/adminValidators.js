'use strict';

const { z } = require('zod');
const c = require('./common');

const listOrdersQuery = z
  .object({
    status: c.orderStatusEnum.optional(),
    search: z.string().trim().max(120).optional(),
    designerId: z.coerce.number().int().positive().optional(),
    printerId: z.coerce.number().int().positive().optional(),
    from: c.dateParam.optional(),
    to: c.dateParam.optional(),
  })
  .merge(c.pagination)
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: '`from` must not be after `to`',
    path: ['from'],
  });

const approveOrderSchema = z.object({
  designerId: z.coerce.number().int().positive(),
});

const rejectOrderSchema = z.object({
  reason: c.longText('A reason'),
});

const cancelOrderSchema = z.object({
  reason: c.longText('A reason'),
});

const reassignDesignerSchema = z.object({
  designerId: z.coerce.number().int().positive(),
});

const reassignPrinterSchema = z.object({
  printerId: z.coerce.number().int().positive(),
});

const sendBackDesignSchema = z.object({
  note: c.longText('A note'),
});

const approveDesignSchema = z.object({
  comment: z.string().trim().max(1000).optional(),
});

/** The print spec. Zod rejects 7 mm, A5 and RED before Postgres has to. */
const createPrintJobSchema = z.object({
  printerId: z.coerce.number().int().positive(),
  color: c.materialColorEnum,
  thicknessMm: c.thicknessMm,
  size: c.sheetSizeEnum,
  notes: z.string().trim().max(1000).optional().or(z.literal('').transform(() => undefined)),
});

// -------------------------------------------------------------------- users

const createUserSchema = z.object({
  name: c.name,
  email: c.email,
  phone: c.phone,
  password: c.password,
  role: z.enum(['ADMIN', 'DESIGNER', 'PRINTER']),
});

const updateUserSchema = z
  .object({
    name: c.name.optional(),
    phone: c.phone,
    password: c.password.optional(),
    role: z.enum(['ADMIN', 'DESIGNER', 'PRINTER', 'CUSTOMER']).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Send at least one field to update' });

const listUsersQuery = z
  .object({
    role: z.enum(['ADMIN', 'DESIGNER', 'PRINTER', 'CUSTOMER']).optional(),
    isActive: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
  })
  .merge(c.pagination);

// ----------------------------------------------------------------- products

const createProductSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255),
  description: z.string().trim().max(5000).optional().or(z.literal('').transform(() => undefined)),
  basePrice: c.money,
  imageUrl: z.string().url().optional().or(z.literal('').transform(() => undefined)),
});

const updateProductSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    description: z.string().trim().max(5000).optional(),
    basePrice: c.money.optional(),
    imageUrl: z.string().url().optional().or(z.literal('')),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Send at least one field to update' });

module.exports = {
  listOrdersQuery,
  approveOrderSchema,
  rejectOrderSchema,
  cancelOrderSchema,
  reassignDesignerSchema,
  reassignPrinterSchema,
  sendBackDesignSchema,
  approveDesignSchema,
  createPrintJobSchema,
  createUserSchema,
  updateUserSchema,
  listUsersQuery,
  createProductSchema,
  updateProductSchema,
};
