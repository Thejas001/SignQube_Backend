const test = require("node:test");
const assert = require("node:assert/strict");
const { mockModule } = require("./helpers/mockModule");

// ---- In-memory fakes -------------------------------------------------------

const db = {
  conversations: new Map(),
  products: [
    { id: "prod-uuid-1", publicId: 1, title: "Classic Frame", basePrice: 999, uploadConfig: { isUploadMandatory: true } },
    { id: "prod-uuid-2", publicId: 2, title: "Mini Frame", basePrice: 499, uploadConfig: null },
  ],
  customizations: new Map(),
  orders: new Map(),
  payments: new Map(),
  latestCustomerMessage: new Map(),
  recentReplies: new Map(),
};

const clone = (value) => (value == null ? value : structuredClone(value));
const tick = () => new Promise((resolve) => setImmediate(resolve));

const fakePrisma = {
  conversation: {
    async findUnique({ where }) {
      await tick();
      return clone(db.conversations.get(where.id) ?? null);
    },
    async update({ where, data }) {
      await tick();
      const conversation = db.conversations.get(where.id);
      Object.assign(conversation, clone(data));
      return clone(conversation);
    },
    async updateMany({ where, data }) {
      // Atomic like the real DB: check and write in the same step.
      const conversation = db.conversations.get(where.id);
      if (!conversation || (where.status?.in && !where.status.in.includes(conversation.status))) {
        return { count: 0 };
      }
      Object.assign(conversation, clone(data));
      return { count: 1 };
    },
  },
  product: {
    async findFirst({ where }) {
      await tick();
      return db.products.find((product) => product.publicId === where.publicId) ?? null;
    },
  },
  customization: {
    async findUnique({ where }) {
      const customization = db.customizations.get(where.id);
      return customization
        ? { ...customization, product: db.products.find((product) => product.id === customization.productId) }
        : null;
    },
    async update({ where, data }) {
      Object.assign(db.customizations.get(where.id), data);
      return db.customizations.get(where.id);
    },
  },
  order: {
    async findUnique({ where }) {
      const order = db.orders.get(where.id);
      return order ? { ...order, payments: [...db.payments.values()].filter((p) => p.orderId === order.id) } : null;
    },
    async update({ where, data }) {
      Object.assign(db.orders.get(where.id), data);
      return db.orders.get(where.id);
    },
  },
  message: {
    async findFirst({ where }) {
      return db.latestCustomerMessage.get(where.conversationId) ?? null;
    },
    async findMany({ where }) {
      return db.recentReplies.get(where.conversationId) ?? [];
    },
  },
  payment: {
    async update({ where, data }) {
      Object.assign(db.payments.get(where.id), data);
      return db.payments.get(where.id);
    },
  },
  async $transaction(operations) {
    return Promise.all(operations);
  },
};

const calls = { createOrder: 0, cancelPaymentLink: [], createCustomization: [] };
let createOrderImpl = null;

mockModule("src/prisma/client.js", fakePrisma);
mockModule("src/utils/razorpay.js", {
  async cancelPaymentLink(id) {
    calls.cancelPaymentLink.push(id);
  },
});
mockModule("src/services/productService.js", {
  async getProductDetailsWithPricing(publicId) {
    const product = db.products.find((entry) => entry.publicId === publicId);
    return { ProductID: product.publicId, ProductName: product.title };
  },
});
mockModule("src/services/productEmbeddingService.js", {
  async searchProductsByQuery() {
    return db.products.map((product) => ({ ...product, description: "", imageUrl: null }));
  },
});
let catalogContext = { inline: false, text: "", products: [] };
mockModule("src/services/catalogContextService.js", {
  async getCatalogContext() {
    return catalogContext;
  },
});
mockModule("src/services/addressService.js", {
  async createAddress() {
    return { id: "address-1" };
  },
});
mockModule("src/services/cartService.js", {
  async clearCart() {},
  async addCartItem() {},
});
mockModule("src/services/customizationService.js", {
  async createCustomization(userId, payload) {
    const product = db.products.find((entry) => entry.publicId === payload.productId);
    const id = `cust-${db.customizations.size + 1}`;
    db.customizations.set(id, { id, userId, productId: product.id, uploadedImageUrl: payload.uploadedImageUrl });
    calls.createCustomization.push(payload);
    return { id };
  },
});
mockModule("src/services/orderService.js", {
  async createOrder(...args) {
    calls.createOrder += 1;
    if (createOrderImpl) {
      return createOrderImpl(...args);
    }
    await tick();
    return {
      id: `order-${calls.createOrder}`,
      orderNumber: `SQ-${calls.createOrder}`,
      totalAmount: 999,
      payments: [{ paymentLinkUrl: "https://rzp.io/test" }],
    };
  },
});

const { runTool, attachPhotoToDraft } = require("../src/services/agentTools");

const FULL_ADDRESS = {
  fullName: "Asha Rao",
  phone: "9876543210",
  line1: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  postalCode: "560001",
};

function seedConversation(id, overrides = {}) {
  db.conversations.set(id, {
    id,
    waPhoneNumber: "919876543210",
    waProfileName: "Asha",
    userId: "user-1",
    status: "DISCOVERY",
    draftOrder: {},
    agentContext: { shownProducts: [{ productId: 1, title: "Classic Frame", basePrice: 999 }, { productId: 2, title: "Mini Frame", basePrice: 499 }] },
    ...clone(overrides),
  });
  return id;
}

test.beforeEach(() => {
  calls.createOrder = 0;
  calls.cancelPaymentLink = [];
  calls.createCustomization = [];
  createOrderImpl = null;
  catalogContext = { inline: false, text: "", products: [] };
});

// ---- Bug 2: duplicate orders ----------------------------------------------

test("place_order returns the existing order instead of creating a second one", async () => {
  const id = seedConversation("conv-existing", {
    status: "PAYMENT_PENDING",
    draftOrder: { productId: 2, quantity: 1, ...FULL_ADDRESS, orderId: "order-9", orderNumber: "SQ-9", totalAmount: 499, paymentLinkUrl: "https://rzp.io/old" },
  });

  const result = await runTool("place_order", id, { paymentMethod: "PAYMENT_LINK" });

  assert.equal(result.alreadyPlaced, true);
  assert.equal(result.orderNumber, "SQ-9");
  assert.equal(calls.createOrder, 0);
});

test("concurrent place_order calls create exactly one order", async () => {
  const id = seedConversation("conv-race", {
    status: "ORDER_READY",
    draftOrder: { productId: 2, quantity: 1, ...FULL_ADDRESS },
  });

  const results = await Promise.allSettled([
    runTool("place_order", id, { paymentMethod: "PAYMENT_LINK" }),
    runTool("place_order", id, { paymentMethod: "PAYMENT_LINK" }),
  ]);

  assert.equal(calls.createOrder, 1);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.match(results.find((result) => result.status === "rejected").reason.message, /already being placed/);
  assert.equal(db.conversations.get(id).status, "PAYMENT_PENDING");
  assert.equal(db.conversations.get(id).draftOrder.orderNumber, "SQ-1");
});

test("place_order releases its claim when order creation fails", async () => {
  const id = seedConversation("conv-fail", {
    status: "ORDER_READY",
    draftOrder: { productId: 2, quantity: 1, ...FULL_ADDRESS },
  });
  createOrderImpl = async () => {
    throw new Error("Razorpay down");
  };

  await assert.rejects(runTool("place_order", id, { paymentMethod: "PAYMENT_LINK" }), /Razorpay down/);

  assert.equal(db.conversations.get(id).status, "ORDER_READY");
  assert.equal(db.conversations.get(id).draftOrder.orderId, undefined);
});

test("place_order refuses when a required photo is missing", async () => {
  const id = seedConversation("conv-nophoto", {
    status: "PHOTO_REQUIRED",
    draftOrder: { productId: 1, quantity: 1, ...FULL_ADDRESS },
  });

  await assert.rejects(runTool("place_order", id, { paymentMethod: "COD" }), /requires a photo/);
  assert.equal(calls.createOrder, 0);
});

test("COD orders complete the conversation", async () => {
  const id = seedConversation("conv-cod", {
    status: "ORDER_READY",
    draftOrder: { productId: 2, quantity: 2, ...FULL_ADDRESS, expiredOrderNumber: "SQ-OLD" },
  });

  const result = await runTool("place_order", id, { paymentMethod: "COD" });

  assert.equal(result.paymentMethod, "COD");
  assert.equal(db.conversations.get(id).status, "COMPLETED");
  assert.equal(db.conversations.get(id).draftOrder.expiredOrderNumber, undefined);
});

// ---- start_new_order -------------------------------------------------------

test("start_new_order cancels the unpaid link and keeps the address", async () => {
  db.orders.set("order-pending", { id: "order-pending", orderNumber: "SQ-P", status: "PENDING" });
  db.payments.set("pay-1", { id: "pay-1", orderId: "order-pending", status: "PENDING", paymentLinkId: "plink_123" });
  const id = seedConversation("conv-restart", {
    status: "PAYMENT_PENDING",
    draftOrder: { productId: 2, quantity: 1, notes: "gold", ...FULL_ADDRESS, orderId: "order-pending", orderNumber: "SQ-P" },
  });

  const result = await runTool("start_new_order", id, {});

  assert.equal(result.cancelledOrderNumber, "SQ-P");
  assert.equal(result.addressKept, true);
  assert.deepEqual(calls.cancelPaymentLink, ["plink_123"]);
  assert.equal(db.orders.get("order-pending").status, "CANCELLED");
  assert.equal(db.payments.get("pay-1").status, "FAILED");
  assert.equal(db.conversations.get(id).status, "DISCOVERY");
  assert.deepEqual(db.conversations.get(id).draftOrder, FULL_ADDRESS);
});

// ---- Bug 4: human handoff --------------------------------------------------

test("request_human_handoff moves the conversation to staff with a reason", async () => {
  const id = seedConversation("conv-handoff", { status: "ADDRESS_REQUIRED" });

  const result = await runTool("request_human_handoff", id, { reason: "Wants a refund for a damaged frame" });

  assert.equal(result.handedOff, true);
  const conversation = db.conversations.get(id);
  assert.equal(conversation.status, "HUMAN_HANDOFF");
  assert.equal(conversation.handoffReason, "Wants a refund for a damaged frame");
  assert.ok(conversation.handoffAt instanceof Date);
});

// ---- Bug 5: photo before product -------------------------------------------

test("a photo sent before choosing a product is attached once the product is chosen", async () => {
  const id = seedConversation("conv-photo-first");

  await attachPhotoToDraft(id, "https://s3/photo-1.jpg");
  assert.equal(db.conversations.get(id).draftOrder.photoUrl, "https://s3/photo-1.jpg");
  assert.equal(db.conversations.get(id).draftOrder.customizationId, undefined);
  assert.equal(db.conversations.get(id).status, "DISCOVERY");

  const result = await runTool("update_draft_order", id, { productId: 1, quantity: 1 });

  assert.ok(db.conversations.get(id).draftOrder.customizationId, "customization created from the saved photo");
  assert.equal(result.draftOrder.photo, "received", "model sees the photo, not internal ids");
  assert.equal(result.draftOrder.customizationId, undefined);
  assert.equal(calls.createCustomization[0].uploadedImageUrl, "https://s3/photo-1.jpg");
  assert.equal(result.stage, "ADDRESS_REQUIRED", "photo requirement satisfied");
});

test("changing product re-links the photo to the new product", async () => {
  const id = seedConversation("conv-switch");

  await attachPhotoToDraft(id, "https://s3/photo-2.jpg");
  await runTool("update_draft_order", id, { productId: 1 });
  const firstCustomizationId = db.conversations.get(id).draftOrder.customizationId;
  await runTool("update_draft_order", id, { productId: 2 });
  const secondCustomizationId = db.conversations.get(id).draftOrder.customizationId;

  assert.notEqual(secondCustomizationId, firstCustomizationId);
  const customization = db.customizations.get(secondCustomizationId);
  assert.equal(customization.productId, "prod-uuid-2");
});

// ---- update_draft_order hardening ------------------------------------------

test("update_draft_order ignores backend-owned fields and validates quantity", async () => {
  const id = seedConversation("conv-validate");

  const result = await runTool("update_draft_order", id, { productId: "2", orderId: "forged", customizationId: "forged" });

  assert.equal(result.draftOrder.productId, 2, "numeric string coerced");
  assert.equal(result.draftOrder.orderId, undefined);
  assert.equal(result.draftOrder.customizationId, undefined);

  await assert.rejects(runTool("update_draft_order", id, { quantity: 50 }), /between 1 and 20/);
});

// ---- Gap: tool results not in history --------------------------------------

test("products already shown are remembered for later turns", async () => {
  const id = seedConversation("conv-shown", { agentContext: null });

  await runTool("search_products", id, { query: "gift" });
  await runTool("get_product_details", id, { productId: 1 });

  const conversation = db.conversations.get(id);
  assert.equal(conversation.status, "PRODUCT_RECOMMENDATION");
  assert.deepEqual(
    conversation.agentContext.shownProducts.map((product) => product.productId),
    [2, 1],
    "deduped, most recently viewed last"
  );
  assert.equal(conversation.agentContext.shownProducts[1].basePrice, 999, "price kept from the search result");
});

test("update_draft_order rejects a product the customer was never shown", async () => {
  const id = seedConversation("conv-unshown", { agentContext: { shownProducts: [{ productId: 1, title: "Classic Frame" }] } });

  await assert.rejects(runTool("update_draft_order", id, { productId: 2, quantity: 1 }), /hasn't been shown/);
  assert.equal(db.conversations.get(id).draftOrder.productId, undefined);

  const result = await runTool("update_draft_order", id, { productId: 1, quantity: 2 });
  assert.equal(result.draftOrder.productId, 1);
});

// ---- Tool gating -------------------------------------------------------------

const { getToolsForConversation } = require("../src/services/agentTools");
const toolNamesFor = (conversation, options) => getToolsForConversation(conversation, options).map((tool) => tool.function.name);

test("tools are offered by stage and context", () => {
  const fresh = { status: "DISCOVERY", agentContext: null, draftOrder: {} };
  assert.deepEqual(toolNamesFor(fresh), ["search_products", "update_draft_order", "request_human_handoff"], "nothing to describe yet");

  const browsing = { status: "PRODUCT_RECOMMENDATION", agentContext: { shownProducts: [{ productId: 1 }] }, draftOrder: {} };
  assert.ok(toolNamesFor(browsing).includes("get_product_details"));
  assert.ok(!toolNamesFor(browsing).includes("place_order"));

  const ready = { status: "ORDER_READY", agentContext: null, draftOrder: { productId: 1 } };
  assert.ok(toolNamesFor(ready).includes("place_order"));

  const paid = { status: "PAYMENT_PENDING", agentContext: null, draftOrder: { productId: 1 } };
  assert.deepEqual(toolNamesFor(paid), ["start_new_order", "request_human_handoff"]);

  assert.ok(!toolNamesFor(fresh).includes("get_store_info"), "short policies are inline");
  assert.ok(toolNamesFor(fresh, { longPolicies: true }).includes("get_store_info"));
});

// ---- Product choice guard ----------------------------------------------------

test("a product shown only this turn can't be saved until the customer chooses it", async () => {
  const id = seedConversation("conv-just-shown", { agentContext: null });
  db.latestCustomerMessage.set(id, { id: "msg-now", content: "I need a frame for my mom's birthday" });

  await runTool("search_products", id, { query: "birthday gift" });
  const held = await runTool("update_draft_order", id, { productId: 1, notes: "gift wrap" });
  assert.match(held.productNotSaved, /#1 not saved: the customer hasn't chosen it yet/);
  assert.equal(db.conversations.get(id).draftOrder.productId, undefined);
  assert.equal(db.conversations.get(id).draftOrder.notes, "gift wrap", "the rest of the call is still saved");

  // Next customer message picks it: allowed.
  db.latestCustomerMessage.set(id, { id: "msg-next", content: "ok that one" });
  const result = await runTool("update_draft_order", id, { productId: 1 });
  assert.equal(result.draftOrder.productId, 1);
});

test("a customer who names the product can have it saved in the same turn", async () => {
  const id = seedConversation("conv-named", { agentContext: null });
  db.latestCustomerMessage.set(id, { id: "msg-named", content: "I want the Classic Frame please" });

  await runTool("search_products", id, { query: "Classic Frame" });
  const result = await runTool("update_draft_order", id, { productId: 1, quantity: 1 });

  assert.equal(result.draftOrder.productId, 1);
});

test("saving details without a product keeps the recommendation stage", async () => {
  const id = seedConversation("conv-keep-stage", { status: "PRODUCT_RECOMMENDATION" });

  const result = await runTool("update_draft_order", id, { fullName: "Asha" });

  assert.equal(result.stage, "PRODUCT_RECOMMENDATION");
});

test("update_draft_order leaves out address fields until a product is chosen", () => {
  const draftToolFor = (status) =>
    getToolsForConversation({ status, agentContext: null, draftOrder: {} }).find((tool) => tool.function.name === "update_draft_order");

  assert.equal(draftToolFor("DISCOVERY").function.parameters.properties.city, undefined);
  assert.ok(draftToolFor("ADDRESS_REQUIRED").function.parameters.properties.city);
  assert.ok(
    !toolNamesFor({ status: "DISCOVERY", agentContext: null, draftOrder: {} }, { withoutDraftUpdates: true }).includes("update_draft_order")
  );
});

test("the product title is filled in by the backend, not the model", async () => {
  const id = seedConversation("conv-title");

  const result = await runTool("update_draft_order", id, { productId: 2, productTitle: "Forged Title" });

  assert.equal(result.draftOrder.productTitle, "Mini Frame");
});

// ---- Inline catalog --------------------------------------------------------

const INLINE_CATALOG = {
  inline: true,
  text: "#1 Classic Frame Rs.999; #2 Mini Frame Rs.499",
  products: [
    { productId: 1, title: "Classic Frame", basePrice: 999 },
    { productId: 2, title: "Mini Frame", basePrice: 499 },
  ],
};

test("with the catalog in the prompt, search isn't offered but details are", () => {
  const tools = toolNamesFor({ status: "DISCOVERY", agentContext: null, draftOrder: {} }, { catalogInline: true });
  assert.ok(!tools.includes("search_products"));
  assert.ok(tools.includes("get_product_details"));
});

test("an inline-catalog product can be saved once the customer names it or saw it earlier", async () => {
  catalogContext = INLINE_CATALOG;

  const named = seedConversation("conv-cat-named", { agentContext: null });
  db.latestCustomerMessage.set(named, { id: "m1", content: "I'll take the Mini Frame" });
  assert.equal((await runTool("update_draft_order", named, { productId: 2 })).draftOrder.productTitle, "Mini Frame");

  const seen = seedConversation("conv-cat-seen", { agentContext: null });
  db.latestCustomerMessage.set(seen, { id: "m2", content: "yes that one" });
  db.recentReplies.set(seen, [{ content: "Our Classic Frame is Rs.999. Want it?" }]);
  assert.equal((await runTool("update_draft_order", seen, { productId: 1 })).draftOrder.productId, 1);
});

test("an inline-catalog product the model is only now recommending can't be saved", async () => {
  catalogContext = INLINE_CATALOG;
  const id = seedConversation("conv-cat-fresh", { agentContext: null });
  db.latestCustomerMessage.set(id, { id: "m3", content: "I need a gift for my mom" });
  db.recentReplies.set(id, [{ content: "Hi! What are you looking for today?" }]);

  const held = await runTool("update_draft_order", id, { productId: 1 });
  assert.ok(held.productNotSaved);
  assert.equal(held.draftOrder.productId, undefined);
  await assert.rejects(runTool("update_draft_order", id, { productId: 7 }), /hasn't been shown/);
});

test("details fetched this turn don't block a product the customer saw in an earlier reply", async () => {
  catalogContext = INLINE_CATALOG;
  const id = seedConversation("conv-details-then-save", { agentContext: null });
  db.latestCustomerMessage.set(id, { id: "m4", content: "tell me more about that one, I'll take 2" });
  db.recentReplies.set(id, [{ content: "We have the Classic Frame for Rs.999." }]);

  await runTool("get_product_details", id, { productId: 1 });
  const result = await runTool("update_draft_order", id, { productId: 1, quantity: 2 });

  assert.equal(result.productNotSaved, undefined);
  assert.equal(result.draftOrder.productId, 1);
  assert.equal(result.draftOrder.quantity, 2);
});

test("product details reach the model as a compact fact sheet", async () => {
  catalogContext = INLINE_CATALOG;
  const id = seedConversation("conv-details-compact");
  const productService = require("../src/services/productService");
  const original = productService.getProductDetailsWithPricing;
  productService.getProductDetailsWithPricing = async () => ({
    ProductID: 1,
    ProductName: "Classic Frame",
    Description: "HD print",
    ProductImage: "https://cdn/x.avif",
    ProductDetailsImages: ["https://cdn/y.avif"],
    Attributes: [{ AttributeName: "size", Values: ["A4", "A3"], PricingRelevant: true }],
    Pricing: { priceType: "Flat" },
    PricingRules: [{ Price: 999, RuleId: 1, Priority: 1, Conditions: [{ AttributeName: "size", ValueName: "A3" }] }],
    Addons: [],
    UploadConfig: { maxUploads: 1, isUploadMandatory: true, maxOrderQuantity: 10, minOrderQuantity: 1, descriptionFieldLabel: "Notes" },
  });

  try {
    const result = await runTool("get_product_details", id, { productId: 1 });

    assert.deepEqual(result, {
      productId: 1,
      title: "Classic Frame",
      price: 999,
      description: "HD print",
      options: { size: ["A4", "A3"] },
      optionPrices: { "size=A3": 999 },
      photo: { required: true, max: 1 },
      quantity: { min: 1, max: 10 },
    });
  } finally {
    productService.getProductDetailsWithPricing = original;
  }
});
