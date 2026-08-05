const { z } = require("zod");
const { phoneSchema } = require("./commonValidators");

const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(255),
    email: z.string().trim().email(),
    password: z.string().min(8).max(100),
    phone: phoneSchema.optional().nullable(),
  }),
  params: z.object({}).optional().default({}),
  query: z.object({}).optional().default({}),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(100),
  }),
  params: z.object({}).optional().default({}),
  query: z.object({}).optional().default({}),
});

const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(10),
  }),
  params: z.object({}).optional().default({}),
  query: z.object({}).optional().default({}),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
};
