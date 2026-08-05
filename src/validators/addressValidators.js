const { z } = require("zod");
const { phoneSchema } = require("./commonValidators");

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? undefined : trimmedValue;
}, z.string().max(255).optional());

const createAddressSchema = z.object({
  body: z.object({
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(255),
    phone: phoneSchema,
    line1: z.string().trim().min(3, "Address line 1 must be at least 3 characters").max(255),
    line2: z.string().trim().max(255).optional().nullable(),
    city: z.string().trim().min(2, "City must be at least 2 characters").max(100),
    state: z.string().trim().min(2, "State must be at least 2 characters").max(100),
    postalCode: z.string().trim().min(4, "Postal code must be at least 4 characters").max(20),
    country: optionalTrimmedString,
  }),
  params: z.object({}).optional().default({}),
  query: z.object({}).optional().default({}),
});

module.exports = {
  createAddressSchema,
};
