const { z } = require("zod");
const { OrderStatus, ConversationStatus } = require("@prisma/client");
const { uuidSchema } = require("./commonValidators");

const emptyBody = z.object({}).optional().default({});
const emptyQuery = z.object({}).optional().default({});

const adminLoginSchema = z.object({
  body: z.object({
    email: z.string().trim().email(),
    password: z.string().min(8).max(100),
  }),
  params: z.object({}).optional().default({}),
  query: emptyQuery,
});

const adminOrderIdParamSchema = z.object({
  body: emptyBody,
  params: z.object({
    id: uuidSchema,
  }),
  query: emptyQuery,
});

const adminOrderQuerySchema = z.object({
  body: emptyBody,
  params: z.object({}).optional().default({}),
  query: z.object({
    status: z.enum(["ALL", ...Object.values(OrderStatus)]).optional().default("ALL"),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(10),
  }),
});

const adminOrderStatusSchema = z.object({
  body: z.object({
    status: z.enum(Object.values(OrderStatus)),
  }),
  params: z.object({
    id: uuidSchema,
  }),
  query: emptyQuery,
});

const detailImageSchema = z.object({
  Id: z.coerce.number().int().positive().optional(),
  ImageUrl: z.string().trim().url(),
});

const attributeSchema = z.object({
  AttributeName: z.string().trim().min(1).max(100),
  Values: z.array(z.string().trim().min(1).max(150)).default([]),
  PricingRelevant: z.boolean().optional().default(false),
});

const pricingRuleSchema = z.object({
  RuleId: z.coerce.number().int().positive().optional(),
  Conditions: z
    .array(
      z.object({
        AttributeName: z.string().trim().min(1).max(100),
        ValueName: z.string().trim().min(1).max(150),
      })
    )
    .default([]),
  Price: z.coerce.number().nonnegative(),
  Priority: z.coerce.number().int().min(1).default(1),
});

const addonSchema = z.object({
  AddonName: z.string().trim().min(1).max(120),
  Description: z.string().trim().max(500).optional().nullable(),
  Price: z.coerce.number().nonnegative().optional().nullable(),
});

const uploadConfigSchema = z.object({
  isUploadMandatory: z.boolean().default(false),
  minUploads: z.coerce.number().int().min(0).default(0),
  maxUploads: z.coerce.number().int().min(0).default(0),
  allowCustomerQuantity: z.boolean().default(false),
  minOrderQuantity: z.coerce.number().int().min(1).default(1),
  maxOrderQuantity: z.coerce.number().int().min(1).default(10),
  showDescriptionBox: z.boolean().default(false),
  descriptionRequired: z.boolean().default(false),
  descriptionFieldLabel: z.string().trim().max(100).optional().or(z.literal("")),
  descriptionPlaceholder: z.string().trim().max(255).optional().or(z.literal("")),
  allowedDocumentTypes: z.array(z.string().trim().min(1).max(20)).default([]),
});

const productBodySchema = z.object({
  title: z.string().trim().min(3).max(255),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
  basePrice: z.coerce.number().positive().max(1000000),
  imageUrl: z.string().trim().url().optional().or(z.literal("")),
  detailImages: z.array(detailImageSchema).default([]),
  attributes: z.array(attributeSchema).default([]),
  pricing: z.record(z.any()).nullable().optional().default(null),
  pricingRules: z.array(pricingRuleSchema).default([]),
  addons: z.array(addonSchema).default([]),
  uploadConfig: uploadConfigSchema.default({}),
  isActive: z.boolean().default(true),
});

const adminProductCreateSchema = z.object({
  body: productBodySchema,
  params: z.object({}).optional().default({}),
  query: emptyQuery,
});

const adminProductIdParamSchema = z.object({
  body: emptyBody,
  params: z.object({
    id: uuidSchema,
  }),
  query: emptyQuery,
});

const adminProductUpdateSchema = z.object({
  body: productBodySchema.partial().refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  }),
  params: z.object({
    id: uuidSchema,
  }),
  query: emptyQuery,
});

const adminConversationQuerySchema = z.object({
  body: emptyBody,
  params: z.object({}).optional().default({}),
  query: z.object({
    status: z.enum(["ALL", ...Object.values(ConversationStatus)]).optional().default("ALL"),
    search: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  }),
});

const adminConversationIdParamSchema = z.object({
  body: emptyBody,
  params: z.object({
    id: uuidSchema,
  }),
  query: emptyQuery,
});

const adminConversationReplySchema = z.object({
  body: z.object({
    message: z.string().trim().min(1).max(4000),
  }),
  params: z.object({
    id: uuidSchema,
  }),
  query: emptyQuery,
});

const adminTestChatSchema = z.object({
  body: z.object({
    conversationId: uuidSchema.optional().nullable(),
    message: z.string().trim().min(1).max(2000),
  }),
  params: z.object({}).optional().default({}),
  query: emptyQuery,
});

const adminAgentSettingsUpdateSchema = z.object({
  body: z
    .object({
      businessName: z.string().trim().min(1).max(255),
      tone: z.string().trim().min(1).max(255),
      systemPromptExtra: z.string().trim().max(4000).optional().nullable(),
      deliveryInfo: z.string().trim().max(2000).optional().nullable(),
      returnPolicy: z.string().trim().max(2000).optional().nullable(),
      welcomeMessage: z.string().trim().max(500).optional().nullable(),
    })
    .partial()
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one field is required",
    }),
  params: z.object({}).optional().default({}),
  query: emptyQuery,
});

const adminAgentMetricsQuerySchema = z.object({
  body: emptyBody,
  params: z.object({}).optional().default({}),
  query: z.object({
    days: z.coerce.number().int().min(1).max(90).optional().default(7),
    includeTest: z
      .enum(["true", "false"])
      .optional()
      .default("true")
      .transform((value) => value === "true"),
  }),
});

module.exports = {
  adminAgentMetricsQuerySchema,
  adminLoginSchema,
  adminOrderIdParamSchema,
  adminOrderQuerySchema,
  adminOrderStatusSchema,
  adminProductCreateSchema,
  adminProductIdParamSchema,
  adminProductUpdateSchema,
  adminConversationQuerySchema,
  adminConversationIdParamSchema,
  adminConversationReplySchema,
  adminTestChatSchema,
  adminAgentSettingsUpdateSchema,
};
