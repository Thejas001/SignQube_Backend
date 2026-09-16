const prisma = require("../prisma/client");
const { calculateCartTotals } = require("../utils/price");

const HAS_ADDRESS_FIELDS = ["fullName", "phone", "line1", "city", "state", "postalCode"];
const FIELD_LABELS = {
  quantity: "quantity",
  fullName: "name",
  phone: "phone",
  line1: "street address",
  city: "city",
  state: "state",
  postalCode: "PIN code",
};
const ADDRESS_DRAFT_KEYS = [...HAS_ADDRESS_FIELDS, "line2", "country"];
// Draft keys that describe a placed order rather than the order being built.
const ORDER_DRAFT_KEYS = ["orderId", "orderNumber", "totalAmount", "paymentLinkUrl"];

// Stages where the order is still being built and the stage can be re-derived
// from the draft. Everything after ORDER_READY is driven by order/payment events.
const PRE_ORDER_STAGES = [
  "DISCOVERY",
  "PRODUCT_RECOMMENDATION",
  "PRODUCT_SELECTED",
  "CUSTOMIZATION",
  "PHOTO_REQUIRED",
  "ADDRESS_REQUIRED",
  "ORDER_READY",
];

/**
 * The draft as shown to the model: internal ids and the long S3 photo URL are
 * replaced by what the model actually needs to know, to keep every prompt small.
 */
function toModelDraft(draftOrder) {
  const draft = draftOrder && typeof draftOrder === "object" ? draftOrder : {};
  const { customizationId, orderId, photoUrl, ...rest } = draft;

  return photoUrl || customizationId ? { ...rest, photo: "received" } : rest;
}

function hasCompleteAddress(draft) {
  return HAS_ADDRESS_FIELDS.every((field) => Boolean(draft[field]));
}

/**
 * Derives the conversation's current stage from the draft order alone, so the
 * backend never has to trust the model's own notion of progress. Narrative-only
 * stages (DISCOVERY, PRODUCT_RECOMMENDATION, CUSTOMIZATION) are intentionally
 * not all reachable here — there's no reliable backend signal that distinguishes
 * them, so the model infers those from conversation history while trusting this
 * function for the operationally verifiable stages (what's missing, what's done).
 */
async function computeStage(draftOrder) {
  const draft = draftOrder && typeof draftOrder === "object" ? draftOrder : {};

  if (!draft.productId) {
    return "DISCOVERY";
  }

  const product = await prisma.product.findFirst({ where: { publicId: draft.productId } });
  const needsPhoto = Boolean(product?.uploadConfig?.isUploadMandatory);

  if (needsPhoto && !draft.customizationId) {
    return "PHOTO_REQUIRED";
  }

  if (!hasCompleteAddress(draft)) {
    return "ADDRESS_REQUIRED";
  }

  return "ORDER_READY";
}

/**
 * Facts the backend can state exactly, so the model never has to work them out
 * from the chat: which details are still missing, and (once ready) the order
 * total computed the same way checkout computes it, shipping included.
 */
async function describeOrderProgress(stage, draftOrder) {
  const draft = draftOrder && typeof draftOrder === "object" ? draftOrder : {};

  if (stage !== "ADDRESS_REQUIRED" && stage !== "ORDER_READY") {
    return null;
  }

  const missing = ["quantity", ...HAS_ADDRESS_FIELDS].filter((field) => !draft[field]).map((field) => FIELD_LABELS[field]);
  const parts = [];
  const product = draft.productId ? await prisma.product.findFirst({ where: { publicId: draft.productId } }) : null;

  if (missing.length > 0) {
    parts.push(`Missing: ${missing.join(", ")}. Ask next for their ${missing[0]}.`);
  }

  // Without this the model tends to ask for a photo on every product.
  if (product && !draft.photoUrl && !draft.customizationId && !(product.uploadConfig?.maxUploads > 0)) {
    parts.push("Photo: not used for this product (don't ask for one).");
  }

  if (stage === "ORDER_READY" && draft.quantity && product) {
    const totals = calculateCartTotals([{ unitPrice: product.basePrice, quantity: draft.quantity }]);
    parts.push(
      `Order total: Rs.${totals.totalAmount} (Rs.${Number(product.basePrice)} x ${draft.quantity} + Rs.${totals.shippingFee} shipping).`
    );
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

// One short question per missing detail, in the order they're collected.
const NEXT_DETAIL_QUESTIONS = {
  quantity: "How many would you like?",
  fullName: "What name should I put on the delivery?",
  phone: "What's your phone number?",
  line1: "What's the delivery address?",
  city: "Which city is that?",
  state: "Which state?",
  postalCode: "And the PIN code?",
};

/** The question for the first detail the draft is still missing, or null. */
function nextDetailQuestion(draftOrder) {
  const draft = draftOrder && typeof draftOrder === "object" ? draftOrder : {};
  const field = ["quantity", ...HAS_ADDRESS_FIELDS].find((key) => !draft[key]);
  return field ? NEXT_DETAIL_QUESTIONS[field] : null;
}

function formatRupees(amount) {
  return `Rs.${Number(amount).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/**
 * The confirmation message sent when an order becomes ready. Built from the
 * draft and checkout's own price calculation rather than written by the model:
 * every fact in it is already known, it must be exactly right, and it saves
 * the model call that would otherwise only restate them.
 */
async function buildOrderSummary(draftOrder) {
  const draft = draftOrder && typeof draftOrder === "object" ? draftOrder : {};

  if (!draft.productId || !draft.quantity) {
    return null;
  }

  const product = await prisma.product.findFirst({ where: { publicId: draft.productId } });

  if (!product) {
    return null;
  }

  const totals = calculateCartTotals([{ unitPrice: product.basePrice, quantity: draft.quantity }]);
  const shipping = totals.shippingFee > 0 ? `including ${formatRupees(totals.shippingFee)} shipping` : "with free shipping";
  const destination = draft.city ? ` to ${draft.city}` : "";

  return `That's ${draft.quantity} x ${draft.productTitle || product.title}${destination}, total ${formatRupees(totals.totalAmount)} ${shipping}. Shall I place the order?`;
}

module.exports = {
  buildOrderSummary,
  nextDetailQuestion,
  computeStage,
  describeOrderProgress,
  hasCompleteAddress,
  toModelDraft,
  ADDRESS_DRAFT_KEYS,
  ORDER_DRAFT_KEYS,
  PRE_ORDER_STAGES,
};
