const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { PaymentStatus } = require("@prisma/client");
const prisma = require("../prisma/client");
const AppError = require("../utils/appError");
const { cancelPaymentLink } = require("../utils/razorpay");
const productService = require("./productService");
const productEmbeddingService = require("./productEmbeddingService");
const addressService = require("./addressService");
const cartService = require("./cartService");
const customizationService = require("./customizationService");
const orderService = require("./orderService");
const agentSettingsService = require("./agentSettingsService");
const { getCatalogContext } = require("./catalogContextService");
const {
  computeStage,
  hasCompleteAddress,
  toModelDraft,
  ADDRESS_DRAFT_KEYS,
  PRE_ORDER_STAGES,
} = require("./conversationStageService");

const MAX_SHOWN_PRODUCTS = 8;
const MAX_DESCRIPTION_CHARS = 160;

function clip(text, maxChars) {
  if (!text || text.length <= maxChars) {
    return text || null;
  }
  return `${text.slice(0, maxChars).trimEnd()}...`;
}
// Fields the model may write through update_draft_order. Everything else in the
// draft (photoUrl, customizationId, order fields) is backend-owned.
const DRAFT_INPUT_KEYS = ["productId", "quantity", "notes", ...ADDRESS_DRAFT_KEYS];

// Tool definitions are re-sent on every model call, so they carry only what
// the model can't infer: behavioural rules live once in the system prompt,
// and self-explanatory fields (city, phone...) have no description at all.
const STRING = { type: "string" };

// update_draft_order has two shapes. Until a product is chosen, customers
// almost never give a delivery address, so the eight address fields are left
// out; anything they do volunteer stays in the recent history and is saved
// once the address fields appear.
const DRAFT_PRODUCT_FIELDS = {
  // Lets the model finish a "just save it" turn in one call: see REPLY_TOOLS.
  reply: { type: "string", description: "Your message to the customer" },
  productId: { type: "number", description: "From search results, once chosen" },
  quantity: { type: "number", description: "1-20, only if stated" },
  notes: { type: "string", description: "Options/personalization" },
};
const DRAFT_ADDRESS_FIELDS = {
  fullName: STRING,
  phone: STRING,
  line1: STRING,
  line2: STRING,
  city: STRING,
  state: STRING,
  postalCode: STRING,
  country: STRING,
};

function draftTool(properties) {
  return {
    type: "function",
    function: {
      name: "update_draft_order",
      description: "Save details the customer gave. Photos attach automatically.",
      parameters: { type: "object", properties },
    },
  };
}

const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "search_products",
      description: "Find products for what the customer wants, in natural language. Returns up to 3 with prices.",
      parameters: {
        type: "object",
        properties: {
          query: STRING,
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product_details",
      description: "Options, add-ons and photo requirements for one product.",
      parameters: {
        type: "object",
        properties: {
          productId: { type: "number" },
        },
        required: ["productId"],
      },
    },
  },
  draftTool({ ...DRAFT_PRODUCT_FIELDS, ...DRAFT_ADDRESS_FIELDS }),
  {
    type: "function",
    function: {
      name: "place_order",
      description: "Create the real order after the customer confirmed the summary and total. Returns the payment link.",
      parameters: {
        type: "object",
        properties: {
          paymentMethod: { type: "string", enum: ["COD", "PAYMENT_LINK"] },
        },
        required: ["paymentMethod"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "start_new_order",
      description: "Start another order. Keeps the address; cancels an unpaid payment link, so confirm first.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_store_info",
      description: "The store's full delivery or returns policy.",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", enum: ["delivery", "returns"] },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "request_human_handoff",
      description: "Hand the chat to staff.",
      parameters: {
        type: "object",
        properties: {
          reason: STRING,
        },
        required: ["reason"],
      },
    },
  },
];
const EARLY_DRAFT_TOOL = draftTool(DRAFT_PRODUCT_FIELDS);

// Only the tools that make sense right now are offered. Fewer definitions per
// call means fewer tokens, and the model can't reach for place_order before
// the order is ready.
const CATALOG_TOOLS = ["search_products", "get_product_details", "update_draft_order", "request_human_handoff"];
const POST_ORDER_TOOLS = ["start_new_order", "request_human_handoff"];
const TOOLS_BY_STAGE = {
  DISCOVERY: CATALOG_TOOLS,
  PRODUCT_RECOMMENDATION: CATALOG_TOOLS,
  PRODUCT_SELECTED: CATALOG_TOOLS,
  CUSTOMIZATION: CATALOG_TOOLS,
  PHOTO_REQUIRED: CATALOG_TOOLS,
  ADDRESS_REQUIRED: CATALOG_TOOLS,
  ORDER_READY: [...CATALOG_TOOLS, "place_order"],
  PAYMENT_PENDING: POST_ORDER_TOOLS,
  PAID: POST_ORDER_TOOLS,
  COMPLETED: POST_ORDER_TOOLS,
  HUMAN_HANDOFF: [],
};
const EARLY_STAGES = ["DISCOVERY", "PRODUCT_RECOMMENDATION"];

// Tool lists are rebuilt from the same few inputs on every call; memoize them
// (this also keeps each list byte-identical, which prefix caches rely on).
const toolListCache = new Map();

/**
 * The tools to offer for this conversation right now:
 * - by stage (see TOOLS_BY_STAGE);
 * - get_product_details only once there's a product to ask about;
 * - update_draft_order without address fields until a product is chosen,
 *   and not at all right after a search (withoutDraftUpdates) - see
 *   aiAgentService for why;
 * - get_store_info only when a policy is too long to inline in the prompt;
 * - search_products only when the catalog is too big to be in the prompt.
 */
function getToolsForConversation(
  conversation,
  { longPolicies = false, withoutDraftUpdates = false, catalogInline = false } = {}
) {
  const context = readJsonObject(conversation.agentContext);
  const draft = readJsonObject(conversation.draftOrder);
  const hasProductToDescribe =
    catalogInline || (context.shownProducts || []).length > 0 || Boolean(draft.productId);
  const early = EARLY_STAGES.includes(conversation.status);
  const key = [conversation.status, hasProductToDescribe, longPolicies, withoutDraftUpdates, catalogInline].join("|");

  if (!toolListCache.has(key)) {
    const names = new Set(TOOLS_BY_STAGE[conversation.status] || CATALOG_TOOLS);

    if (!hasProductToDescribe) {
      names.delete("get_product_details");
    }

    if (withoutDraftUpdates) {
      names.delete("update_draft_order");
    }

    // The whole catalog is already in the prompt; searching it would only add
    // a model call.
    if (catalogInline) {
      names.delete("search_products");
    }

    if (longPolicies && names.size > 0) {
      names.add("get_store_info");
    }

    const tools = TOOL_DEFINITIONS.filter((tool) => names.has(tool.function.name)).map((tool) =>
      early && tool.function.name === "update_draft_order" ? EARLY_DRAFT_TOOL : tool
    );
    toolListCache.set(key, tools);
  }

  return toolListCache.get(key);
}

// Tools whose result the model doesn't need to see before replying, and that
// accept a `reply` argument written alongside the call.
const REPLY_TOOLS = ["update_draft_order"];

function readJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function findConversationOrThrow(conversationId) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });

  if (!conversation) {
    throw new AppError("Conversation not found", 404);
  }

  return conversation;
}

async function getLatestCustomerMessage(conversationId) {
  return prisma.message.findFirst({
    where: { conversationId, role: "USER" },
    orderBy: { createdAt: "desc" },
    select: { id: true, content: true },
  });
}

async function getLatestCustomerMessageId(conversationId) {
  return (await getLatestCustomerMessage(conversationId))?.id || null;
}

function wordsOf(text) {
  return (text || "").toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
}

// True when the message names the product: most of the title's words appear
// in it ("I want the Premium UV Acrylic Photo Prints"), not just one shared
// generic word ("a photo frame for my mom").
function messageNamesProduct(message, title) {
  const titleWords = wordsOf(title);
  const messageWords = new Set(wordsOf(message));

  if (titleWords.length === 0) {
    return false;
  }

  return titleWords.filter((word) => messageWords.has(word)).length / titleWords.length >= 0.6;
}

/**
 * Whether the customer has actually chosen this product. Right after showing
 * products, the model tends to save the one it is about to recommend before
 * the customer picks it. A product counts as chosen when the customer:
 * - was shown it in an earlier turn (a search result from before their latest
 *   message), or
 * - names it in their latest message ("I want the Premium UV prints"), or
 * - saw it in one of our earlier replies (small catalogs are listed in the
 *   prompt, so replies are where the customer sees products).
 */
async function customerChoseProduct(conversationId, product, shownProduct) {
  const latest = await getLatestCustomerMessage(conversationId);

  if (shownProduct && (!shownProduct.shownAfterMessageId || shownProduct.shownAfterMessageId !== latest?.id)) {
    return true;
  }

  if (latest && messageNamesProduct(latest.content, product.title)) {
    return true;
  }

  const recentReplies = await prisma.message.findMany({
    where: { conversationId, role: { in: ["ASSISTANT", "ADMIN"] } },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { content: true },
  });

  return recentReplies.some((reply) => messageNamesProduct(reply.content, product.title));
}

// Tool results aren't replayed in later turns' history, so the products the
// customer has seen are kept here and surfaced in the prompt; that lets the
// model reuse their productIds instead of searching again.
async function rememberShownProducts(conversationId, products, { markRecommended = false } = {}) {
  if (products.length === 0) {
    return;
  }

  const [conversation, latestCustomerMessageId] = await Promise.all([
    findConversationOrThrow(conversationId),
    getLatestCustomerMessageId(conversationId),
  ]);
  const context = readJsonObject(conversation.agentContext);
  const previous = Array.isArray(context.shownProducts) ? context.shownProducts : [];
  const byId = new Map(previous.map((product) => [product.productId, product]));

  for (const product of products) {
    byId.delete(product.productId);
    const known = previous.find((entry) => entry.productId === product.productId) || {};
    byId.set(product.productId, {
      productId: product.productId,
      title: product.title || known.title,
      basePrice: product.basePrice ?? known.basePrice ?? null,
      // Which customer message this product was first shown in reply to; see
      // customerChoseProduct.
      shownAfterMessageId: known.shownAfterMessageId || latestCustomerMessageId,
    });
  }

  const data = {
    agentContext: { ...context, shownProducts: [...byId.values()].slice(-MAX_SHOWN_PRODUCTS) },
  };

  if (markRecommended && conversation.status === "DISCOVERY") {
    data.status = "PRODUCT_RECOMMENDATION";
  }

  await prisma.conversation.update({ where: { id: conversationId }, data });
}

async function searchProducts(conversationId, args = {}) {
  const products = await productEmbeddingService.searchProductsByQuery(args.query, 3);

  // Tool results are re-sent on the follow-up model round: keep only what the
  // model uses to recommend (no image URLs, descriptions clipped).
  const results = products.map((product) => ({
    productId: product.publicId,
    title: product.title,
    description: clip(product.description, MAX_DESCRIPTION_CHARS),
    basePrice: Number(product.basePrice),
  }));

  await rememberShownProducts(conversationId, results, { markRecommended: true });

  return results;
}

async function getProductDetails(conversationId, args = {}) {
  if (!args.productId) {
    throw new AppError("productId is required", 400);
  }

  const [details, catalog] = await Promise.all([
    productService.getProductDetailsWithPricing(Number(args.productId)),
    getCatalogContext(),
  ]);

  await rememberShownProducts(conversationId, [{ productId: details.ProductID, title: details.ProductName }]);

  const basePrice = catalog.products.find((product) => product.productId === details.ProductID)?.basePrice;
  return toModelProductDetails(details, basePrice);
}

/**
 * The storefront's product payload is built for rendering (image URLs, rule
 * ids, form labels); the model needs only the facts a customer asks about.
 * This cuts the result from ~1,000 characters to ~250, and it is re-sent on
 * the follow-up call.
 */
function toModelProductDetails(details, basePrice) {
  const upload = details.UploadConfig || {};
  const options = {};
  for (const attribute of details.Attributes || []) {
    options[attribute.AttributeName] = attribute.Values || [];
  }
  const optionPrices = {};
  for (const rule of details.PricingRules || []) {
    const when = (rule.Conditions || []).map((condition) => `${condition.AttributeName}=${condition.ValueName}`).join(", ");
    optionPrices[when || "default"] = rule.Price;
  }

  return {
    productId: details.ProductID,
    title: details.ProductName,
    ...(basePrice != null ? { price: basePrice } : {}),
    description: clip(details.Description, MAX_DESCRIPTION_CHARS),
    ...(Object.keys(options).length > 0 ? { options } : {}),
    ...(Object.keys(optionPrices).length > 0 ? { optionPrices } : {}),
    ...((details.Addons || []).length > 0 ? { addons: details.Addons } : {}),
    photo: upload.maxUploads > 0 ? { required: Boolean(upload.isUploadMandatory), max: upload.maxUploads } : "not used",
    ...(upload.maxOrderQuantity ? { quantity: { min: upload.minOrderQuantity || 1, max: upload.maxOrderQuantity } } : {}),
  };
}

function generateGuestPassword() {
  return crypto.randomBytes(24).toString("hex");
}

async function ensureGuestUser(conversation) {
  if (conversation.userId) {
    return conversation.userId;
  }

  const digitsOnly = conversation.waPhoneNumber.replace(/[^0-9]/g, "");
  const email = `wa-${digitsOnly}@guest.signque.com`;

  let user = await prisma.user.findFirst({
    where: { OR: [{ phone: conversation.waPhoneNumber }, { email }] },
  });

  if (!user) {
    const passwordHash = await bcrypt.hash(generateGuestPassword(), 10);
    user = await prisma.user.create({
      data: {
        name: conversation.waProfileName || "WhatsApp Customer",
        email,
        passwordHash,
        phone: conversation.waPhoneNumber,
      },
    });
  }

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { userId: user.id },
  });

  conversation.userId = user.id;

  return user.id;
}

/**
 * Keeps the draft's customization in step with its product and photo. A photo
 * can arrive before a product is chosen, and the product can change after the
 * photo was attached; either way the customization is (re)created for the
 * current product so place_order never hits a product/customization mismatch.
 */
async function syncPhotoCustomization(conversation, draft) {
  if (!draft.productId) {
    return draft;
  }

  let photoUrl = draft.photoUrl || null;

  if (draft.customizationId) {
    const existing = await prisma.customization.findUnique({
      where: { id: draft.customizationId },
      include: { product: true },
    });

    photoUrl = photoUrl || existing?.uploadedImageUrl || null;

    if (existing && existing.product.publicId === draft.productId && existing.uploadedImageUrl === photoUrl) {
      return draft;
    }
  }

  if (!photoUrl) {
    const { customizationId, ...rest } = draft;
    return rest;
  }

  const userId = await ensureGuestUser(conversation);
  const customization = await customizationService.createCustomization(userId, {
    productId: draft.productId,
    uploadedImageUrl: photoUrl,
    quantity: draft.quantity || 1,
    notes: draft.notes || null,
  });

  return { ...draft, photoUrl, customizationId: customization.id };
}

function normalizeDraftInput(args) {
  const changes = {};

  for (const key of DRAFT_INPUT_KEYS) {
    const value = args[key];

    if (value === undefined || value === null || value === "") {
      continue;
    }

    changes[key] = typeof value === "string" ? value.trim() : value;
  }

  if (changes.productId !== undefined) {
    const productId = Number(changes.productId);

    if (!Number.isInteger(productId) || productId < 1) {
      throw new AppError("productId must be the numeric productId from search_products", 400);
    }

    changes.productId = productId;
  }

  if (changes.quantity !== undefined) {
    const quantity = Number(changes.quantity);

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
      throw new AppError("quantity must be a whole number between 1 and 20", 400);
    }

    changes.quantity = quantity;
  }

  return changes;
}

/**
 * Merges changes into the draft, re-links the photo customization when the
 * product or photo changed, and re-derives the stage while the order is still
 * being built. Shared by update_draft_order and inbound photo handling.
 */
async function applyDraftChanges(conversationId, changes) {
  const conversation = await findConversationOrThrow(conversationId);
  let nextDraft = { ...readJsonObject(conversation.draftOrder), ...changes };

  if (changes.productId !== undefined || changes.photoUrl !== undefined) {
    nextDraft = await syncPhotoCustomization(conversation, nextDraft);
  }

  let nextStatus = conversation.status;

  if (PRE_ORDER_STAGES.includes(conversation.status)) {
    nextStatus = await computeStage(nextDraft);

    // With no product chosen the draft can't tell "browsing recommendations"
    // from "just started"; saving other details mustn't reset the former.
    if (nextStatus === "DISCOVERY" && conversation.status === "PRODUCT_RECOMMENDATION") {
      nextStatus = "PRODUCT_RECOMMENDATION";
    }
  }

  const updated = await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      draftOrder: nextDraft,
      status: nextStatus,
    },
  });

  return { draftOrder: updated.draftOrder, stage: updated.status };
}

async function updateDraftOrder(conversationId, args = {}) {
  const changes = normalizeDraftInput(args);
  let productNotSaved = null;

  if (changes.productId !== undefined) {
    // Small models sometimes read "2 please" as productId 2. Only accept a
    // product the customer has actually been shown.
    const conversation = await findConversationOrThrow(conversationId);
    const shownProducts = readJsonObject(conversation.agentContext).shownProducts || [];
    const currentProductId = readJsonObject(conversation.draftOrder).productId;

    if (changes.productId !== currentProductId) {
      const shownProduct = shownProducts.find((product) => product.productId === changes.productId);
      const catalog = shownProduct ? null : await getCatalogContext();
      const product = shownProduct || (catalog.inline && catalog.products.find((entry) => entry.productId === changes.productId));

      if (!product) {
        throw new AppError(
          `Product #${changes.productId} hasn't been shown to this customer. Use a productId from the catalog or search results; a bare number from the customer is usually a quantity.`,
          400
        );
      }

      if (await customerChoseProduct(conversationId, product, shownProduct)) {
        changes.productTitle = product.title;
      } else {
        // Not an error: everything else in the call is still saved, and a
        // reply that asks the customer to pick can go out as-is.
        delete changes.productId;
        productNotSaved = `#${product.productId} not saved: the customer hasn't chosen it yet. Ask if they want it.`;
      }
    }
  }

  const { draftOrder, stage } = await applyDraftChanges(conversationId, changes);
  return { stage, draftOrder: toModelDraft(draftOrder), ...(productNotSaved ? { productNotSaved } : {}) };
}

async function attachPhotoToDraft(conversationId, photoUrl) {
  // A new photo replaces any earlier one. Save it (and drop the old
  // customization) first, so the photo is kept even if linking it to the
  // product fails; place_order re-links it before ordering anyway.
  const conversation = await findConversationOrThrow(conversationId);
  const { customizationId, ...draft } = readJsonObject(conversation.draftOrder);

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { draftOrder: { ...draft, photoUrl } },
  });

  return applyDraftChanges(conversationId, { photoUrl });
}

function describeMissing(stage) {
  switch (stage) {
    case "DISCOVERY":
      return "no product has been selected yet";
    case "PHOTO_REQUIRED":
      return "this product requires a photo upload that hasn't been received yet";
    case "ADDRESS_REQUIRED":
      return "the delivery address is incomplete";
    default:
      return "the order is not ready yet";
  }
}

async function placeOrder(conversationId, args = {}) {
  const conversation = await findConversationOrThrow(conversationId);
  let draft = readJsonObject(conversation.draftOrder);

  if (draft.orderId) {
    return {
      alreadyPlaced: true,
      orderNumber: draft.orderNumber,
      totalAmount: draft.totalAmount,
      paymentLinkUrl: draft.paymentLinkUrl || null,
      note: "This order was already placed. Share these details instead of placing it again. If the customer wants another, separate order, call start_new_order first.",
    };
  }

  if (!PRE_ORDER_STAGES.includes(conversation.status)) {
    throw new AppError(`Cannot place an order in stage ${conversation.status}.`, 409);
  }

  if (!draft.quantity) {
    throw new AppError("Cannot place order yet, missing: quantity. Collect it via update_draft_order first.", 400);
  }

  draft = await syncPhotoCustomization(conversation, draft);
  const stage = await computeStage(draft);

  if (stage !== "ORDER_READY") {
    throw new AppError(`Cannot place order yet: ${describeMissing(stage)}.`, 400);
  }

  // Claim the conversation atomically before any side effects. A concurrent or
  // repeated place_order (another process, a retried turn) finds it already
  // moved out of the pre-order stages and is refused instead of creating a
  // second order and payment link.
  const claim = await prisma.conversation.updateMany({
    where: { id: conversationId, status: { in: PRE_ORDER_STAGES } },
    data: { status: "PAYMENT_PENDING", draftOrder: draft },
  });

  if (claim.count === 0) {
    throw new AppError("An order for this conversation is already being placed.", 409);
  }

  const paymentMethod = args.paymentMethod === "COD" ? "COD" : "PAYMENT_LINK";
  let order;

  try {
    const userId = await ensureGuestUser(conversation);

    // Clear any stray cart items from a previous failed attempt (e.g. a Razorpay
    // error after the cart item was added) so retries don't duplicate line items.
    await cartService.clearCart(userId);

    if (draft.customizationId) {
      await prisma.customization.update({
        where: { id: draft.customizationId },
        data: { quantity: draft.quantity, notes: draft.notes || null },
      });
    }

    const address = await addressService.createAddress(userId, {
      fullName: draft.fullName,
      phone: draft.phone,
      line1: draft.line1,
      line2: draft.line2 || null,
      city: draft.city,
      state: draft.state,
      postalCode: draft.postalCode,
      country: draft.country || "India",
    });

    await cartService.addCartItem(userId, {
      productId: draft.productId,
      customizationId: draft.customizationId || null,
      quantity: draft.quantity,
    });

    order = await orderService.createOrder(
      userId,
      { addressId: address.id, paymentMethod },
      { paymentMode: "payment_link", source: "WHATSAPP", conversationId }
    );
  } catch (error) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: stage },
    });
    throw error;
  }

  const payment = order.payments[0];
  const { expiredOrderNumber, ...draftWithoutExpired } = draft;

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      draftOrder: {
        ...draftWithoutExpired,
        orderId: order.id,
        orderNumber: order.orderNumber,
        totalAmount: order.totalAmount,
        paymentLinkUrl: payment?.paymentLinkUrl || null,
      },
      status: paymentMethod === "COD" ? "COMPLETED" : "PAYMENT_PENDING",
    },
  });

  return {
    orderNumber: order.orderNumber,
    totalAmount: order.totalAmount,
    paymentMethod,
    paymentLinkUrl: payment?.paymentLinkUrl || null,
  };
}

async function cancelUnpaidOrder(orderId) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payments: true },
  });

  if (!order || order.status !== "PENDING") {
    return null;
  }

  const payment = order.payments[0];

  if (payment?.status === PaymentStatus.SUCCESS) {
    throw new AppError("The previous order has already been paid, so it can't be replaced.", 409);
  }

  if (payment?.paymentLinkId) {
    try {
      await cancelPaymentLink(payment.paymentLinkId);
    } catch (error) {
      // Razorpay refuses to cancel a link that was just paid; don't start a new
      // order on top of a payment that may be landing right now.
      throw new AppError(
        "Couldn't cancel the previous payment link (it may have just been paid). Don't start a new order; offer to connect the customer with the team.",
        409
      );
    }
  }

  await prisma.$transaction([
    ...(payment
      ? [prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.FAILED } })]
      : []),
    prisma.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } }),
  ]);

  return order.orderNumber;
}

async function startNewOrder(conversationId) {
  const conversation = await findConversationOrThrow(conversationId);
  const draft = readJsonObject(conversation.draftOrder);
  let cancelledOrderNumber = null;

  if (conversation.status === "PAYMENT_PENDING" && draft.orderId) {
    cancelledOrderNumber = await cancelUnpaidOrder(draft.orderId);
  }

  const nextDraft = {};

  for (const key of ADDRESS_DRAFT_KEYS) {
    if (draft[key]) {
      nextDraft[key] = draft[key];
    }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { draftOrder: nextDraft, status: "DISCOVERY" },
  });

  return {
    started: true,
    cancelledOrderNumber,
    addressKept: hasCompleteAddress(nextDraft),
  };
}

async function requestHumanHandoff(conversationId, args = {}) {
  const reason = String(args.reason || "").trim().slice(0, 500) || "Customer needs a person";

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { status: "HUMAN_HANDOFF", handoffReason: reason, handoffAt: new Date() },
  });

  console.warn(`Conversation ${conversationId} handed off to staff: ${reason}`);

  return {
    handedOff: true,
    note: "The team has been notified. Tell the customer a team member will reply here shortly. Don't call any more tools.",
  };
}

async function getStoreInfo(_conversationId, args = {}) {
  const settings = await agentSettingsService.getAgentSettings();
  const policy = args.topic === "returns" ? settings.returnPolicy : settings.deliveryInfo;

  return { topic: args.topic, policy: policy || "No policy has been set; offer to connect them with the team." };
}

async function runTool(toolName, conversationId, args) {
  switch (toolName) {
    case "search_products":
      return searchProducts(conversationId, args);
    case "get_product_details":
      return getProductDetails(conversationId, args);
    case "update_draft_order":
      return updateDraftOrder(conversationId, args);
    case "place_order":
      return placeOrder(conversationId, args);
    case "start_new_order":
      return startNewOrder(conversationId, args);
    case "request_human_handoff":
      return requestHumanHandoff(conversationId, args);
    case "get_store_info":
      return getStoreInfo(conversationId, args);
    default:
      throw new AppError(`Unknown tool: ${toolName}`, 400);
  }
}

module.exports = {
  messageNamesProduct,
  TOOL_DEFINITIONS,
  REPLY_TOOLS,
  getToolsForConversation,
  runTool,
  ensureGuestUser,
  attachPhotoToDraft,
};
