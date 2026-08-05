const { z } = require("zod");

const uuidSchema = z.string().uuid("Invalid UUID");
const intIdSchema = z.coerce.number().int().positive("Invalid numeric id");
const productIdentifierSchema = z.union([uuidSchema, intIdSchema]);
const phoneSchema = z
  .string()
  .trim()
  .min(10, "Phone number must be at least 10 digits")
  .max(20, "Phone number is too long");

module.exports = {
  uuidSchema,
  intIdSchema,
  productIdentifierSchema,
  phoneSchema,
};
