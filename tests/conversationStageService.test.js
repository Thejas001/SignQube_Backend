process.env.SHIPPING_FEE = "99";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mockModule } = require("./helpers/mockModule");

const products = {
  2: { publicId: 2, basePrice: 499, uploadConfig: { maxUploads: 0, isUploadMandatory: false } },
  3: { publicId: 3, basePrice: 499, uploadConfig: { maxUploads: 1, isUploadMandatory: true } },
};
mockModule("src/prisma/client.js", {
  product: {
    async findFirst({ where }) {
      return products[where.publicId] ?? null;
    },
  },
});

const { describeOrderProgress, computeStage, buildOrderSummary, nextDetailQuestion } = require("../src/services/conversationStageService");

const ADDRESS = { fullName: "A", phone: "9", line1: "x", city: "Bengaluru", state: "KA", postalCode: "560001" };

test("lists exactly what is still missing", async () => {
  const text = await describeOrderProgress("ADDRESS_REQUIRED", { productId: 3, customizationId: "c1", fullName: "A" });
  assert.match(text, /^Missing: quantity, phone, street address, city, state, PIN code\. Ask next for their quantity\./);
});

test("says when the chosen product takes no photo", async () => {
  assert.match(await describeOrderProgress("ADDRESS_REQUIRED", { productId: 2 }), /Photo: not used/);
  assert.doesNotMatch(await describeOrderProgress("ADDRESS_REQUIRED", { productId: 3, customizationId: "c1" }), /photo/);
});

test("gives the checkout total, shipping included, once ready", async () => {
  const text = await describeOrderProgress("ORDER_READY", { productId: 2, quantity: 2, ...ADDRESS });
  assert.match(text, /Order total: Rs\.1097 \(Rs\.499 x 2 \+ Rs\.99 shipping\)/);
});

test("says nothing outside the address and ready stages", async () => {
  assert.equal(await describeOrderProgress("DISCOVERY", {}), null);
});

test("stage follows the draft", async () => {
  assert.equal(await computeStage({}), "DISCOVERY");
  assert.equal(await computeStage({ productId: 3 }), "PHOTO_REQUIRED");
  assert.equal(await computeStage({ productId: 2 }), "ADDRESS_REQUIRED");
  assert.equal(await computeStage({ productId: 2, ...ADDRESS }), "ORDER_READY");
});

test("the order summary is exact and asks before placing", async () => {
  assert.equal(
    await buildOrderSummary({ productId: 2, productTitle: "Desk Frame", quantity: 2, city: "Bengaluru" }),
    "That's 2 x Desk Frame to Bengaluru, total Rs.1,097 including Rs.99 shipping. Shall I place the order?"
  );
  assert.equal(await buildOrderSummary({ productId: 2 }), null, "no summary without a quantity");
});

test("the next detail question follows collection order", () => {
  assert.equal(nextDetailQuestion({}), "How many would you like?");
  assert.equal(nextDetailQuestion({ quantity: 1, fullName: "A", phone: "9" }), "What's the delivery address?");
  assert.equal(nextDetailQuestion({ quantity: 1, ...ADDRESS }), null);
});
