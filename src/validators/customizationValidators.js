const { z } = require("zod");
const { productIdentifierSchema } = require("./commonValidators");

const createCustomizationSchema = z.object({
  body: z.object({
    productId: productIdentifierSchema,
    uploadedImageUrl: z.string().trim().min(1),
    previewImageUrl: z.string().trim().optional().nullable(),
    quantity: z.coerce.number().int().min(1).max(20).default(1),
    notes: z.string().trim().max(1000).optional().nullable(),
  }),
  params: z.object({}).optional().default({}),
  query: z.object({}).optional().default({}),
});

module.exports = {
  createCustomizationSchema,
};
