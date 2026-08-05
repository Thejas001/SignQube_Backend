const { z } = require("zod");
const { uuidSchema } = require("./commonValidators");

const paymentMethodSchema = z.enum(["UPI", "CARD", "COD"]);

const createOrderSchema = z.object({
  body: z.object({
    addressId: uuidSchema,
    paymentMethod: paymentMethodSchema,
  }),
  params: z.object({}).optional().default({}),
  query: z.object({}).optional().default({}),
});

const verifyPaymentSchema = z.object({
  body: z.object({
    razorpayOrderId: z.string().trim().min(1).max(255),
    razorpayPaymentId: z.string().trim().min(1).max(255),
    razorpaySignature: z.string().trim().min(1).max(255),
  }),
  params: z.object({
    id: uuidSchema,
  }),
  query: z.object({}).optional().default({}),
});

const orderIdParamSchema = z.object({
  body: z.object({}).optional().default({}),
  params: z.object({
    id: uuidSchema,
  }),
  query: z.object({}).optional().default({}),
});

module.exports = {
  createOrderSchema,
  verifyPaymentSchema,
  orderIdParamSchema,
};
