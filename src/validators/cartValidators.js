const { z } = require("zod");
const { productIdentifierSchema, uuidSchema } = require("./commonValidators");

const addCartItemSchema = z.object({
  body: z.object({
    productId: productIdentifierSchema,
    customizationId: uuidSchema.optional().nullable(),
    quantity: z.coerce.number().int().min(1).max(20),
  }),
  params: z.object({}).optional().default({}),
  query: z.object({}).optional().default({}),
});

const updateCartItemSchema = z.object({
  body: z.object({
    quantity: z.coerce.number().int().min(1).max(20),
  }),
  params: z.object({
    id: uuidSchema,
  }),
  query: z.object({}).optional().default({}),
});

const cartItemIdParamSchema = z.object({
  body: z.object({}).optional().default({}),
  params: z.object({
    id: uuidSchema,
  }),
  query: z.object({}).optional().default({}),
});

module.exports = {
  addCartItemSchema,
  updateCartItemSchema,
  cartItemIdParamSchema,
};
