const { z } = require("zod");
const { uuidSchema, intIdSchema } = require("./commonValidators");

const productIdParamSchema = z.object({
  body: z.object({}).optional().default({}),
  params: z.object({
    id: uuidSchema,
  }),
  query: z.object({}).optional().default({}),
});

module.exports = {
  productIdParamSchema,
  productPublicIdParamSchema: z.object({
    body: z.object({}).optional().default({}),
    params: z.object({
      publicId: intIdSchema,
    }),
    query: z.object({}).optional().default({}),
  }),
};
