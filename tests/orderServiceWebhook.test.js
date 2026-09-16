process.env.WHATSAPP_PAYMENT_CONFIRMED_TEMPLATE = "order_confirmed";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mockModule } = require("./helpers/mockModule");

const db = { payments: new Map(), orders: new Map(), conversations: new Map(), messages: [] };

const fakePrisma = {
  payment: {
    async findFirst({ where }) {
      const payment = [...db.payments.values()].find((entry) =>
        where.OR.some((clause) => Object.entries(clause).every(([key, value]) => entry[key] === value))
      );
      if (!payment) return null;
      const order = db.orders.get(payment.orderId);
      return {
        ...payment,
        order: { ...order, conversation: order.conversationId ? { ...db.conversations.get(order.conversationId) } : null },
      };
    },
  },
  conversation: {
    async update({ where, data }) {
      Object.assign(db.conversations.get(where.id), data);
      return db.conversations.get(where.id);
    },
  },
  message: {
    async create({ data }) {
      db.messages.push(data);
      return data;
    },
  },
  product: {
    async findFirst() {
      return { publicId: 2, uploadConfig: null };
    },
  },
  async $transaction(fn) {
    return fn({
      payment: {
        async update({ where, data }) {
          Object.assign(db.payments.get(where.id), data);
        },
      },
      order: {
        async update({ where, data }) {
          Object.assign(db.orders.get(where.id), data);
        },
      },
    });
  },
};

const whatsappSent = { text: [], template: [] };

mockModule("src/prisma/client.js", fakePrisma);
mockModule("src/utils/razorpay.js", {
  verifyRazorpayWebhookSignature: () => true,
});
mockModule("src/utils/whatsapp.js", {
  ...require("../src/utils/whatsapp"),
  async sendTextMessage(to, body) {
    whatsappSent.text.push({ to, body });
  },
  async sendTemplateMessage(to, name, language, components) {
    whatsappSent.template.push({ to, name, components });
  },
});

const { handleRazorpayWebhook } = require("../src/services/orderService");

const ADDRESS = { fullName: "Asha", phone: "98765", line1: "12 MG Road", city: "Bengaluru", state: "KA", postalCode: "560001" };

function seed({ lastInboundAt = new Date() } = {}) {
  db.payments.clear();
  db.orders.clear();
  db.conversations.clear();
  db.messages.length = 0;
  whatsappSent.text.length = 0;
  whatsappSent.template.length = 0;

  db.conversations.set("conv-1", {
    id: "conv-1",
    waPhoneNumber: "919876543210",
    status: "PAYMENT_PENDING",
    lastInboundAt,
    draftOrder: { productId: 2, quantity: 1, ...ADDRESS, orderId: "order-1", orderNumber: "SQ-1", totalAmount: 499, paymentLinkUrl: "https://rzp.io/a" },
  });
  db.orders.set("order-1", { id: "order-1", orderNumber: "SQ-1", status: "PENDING", source: "WHATSAPP", conversationId: "conv-1" });
  db.payments.set("pay-1", { id: "pay-1", orderId: "order-1", status: "PENDING", paymentLinkId: "plink_1", gatewayOrderId: null, gatewayPaymentId: null });
}

function webhook(eventName, extraPayload = {}) {
  return Buffer.from(
    JSON.stringify({ event: eventName, payload: { payment_link: { entity: { id: "plink_1" } }, ...extraPayload } })
  );
}

test("payment_link.paid confirms the order and tells the customer", async () => {
  seed();

  await handleRazorpayWebhook(
    webhook("payment_link.paid", { payment: { entity: { id: "pay_rzp_1", order_id: "order_rzp_1" } } }),
    "sig"
  );

  assert.equal(db.payments.get("pay-1").status, "SUCCESS");
  assert.equal(db.orders.get("order-1").status, "PROCESSING");
  assert.equal(db.conversations.get("conv-1").status, "PAID");
  assert.match(whatsappSent.text[0].body, /Payment received! Your order SQ-1/);
  assert.match(db.messages[0].content, /Payment received/, "recorded in the thread for the agent");
});

test("payment confirmation uses the template once the 24-hour window has closed", async () => {
  seed({ lastInboundAt: new Date(Date.now() - 30 * 60 * 60 * 1000) });

  await handleRazorpayWebhook(webhook("payment_link.paid", { payment: { entity: { id: "pay_rzp_2" } } }), "sig");

  assert.equal(whatsappSent.text.length, 0);
  assert.equal(whatsappSent.template[0].name, "order_confirmed");
  assert.deepEqual(whatsappSent.template[0].components[0].parameters, [{ type: "text", text: "SQ-1" }]);
});

test("an expired payment link cancels the order and reopens the conversation", async () => {
  seed();

  await handleRazorpayWebhook(webhook("payment_link.expired"), "sig");

  assert.equal(db.payments.get("pay-1").status, "FAILED");
  assert.equal(db.orders.get("order-1").status, "CANCELLED");

  const conversation = db.conversations.get("conv-1");
  assert.equal(conversation.status, "ORDER_READY");
  assert.equal(conversation.draftOrder.orderId, undefined);
  assert.equal(conversation.draftOrder.expiredOrderNumber, "SQ-1");
  assert.equal(conversation.draftOrder.fullName, "Asha", "collected details are kept");
  assert.match(whatsappSent.text[0].body, /has expired/);
});

test("an expired link is only recorded, not sent, when the window is closed and there's no template", async () => {
  seed({ lastInboundAt: new Date(Date.now() - 30 * 60 * 60 * 1000) });

  await handleRazorpayWebhook(webhook("payment_link.expired"), "sig");

  assert.equal(whatsappSent.text.length + whatsappSent.template.length, 0);
  assert.match(db.messages[0].content, /not delivered: 24-hour window closed/);
  assert.equal(db.conversations.get("conv-1").status, "ORDER_READY");
});

test("a link the agent already replaced doesn't touch the conversation", async () => {
  seed();
  // start_new_order already detached this order and cancelled it.
  Object.assign(db.conversations.get("conv-1"), { status: "DISCOVERY", draftOrder: { ...ADDRESS } });
  db.orders.get("order-1").status = "CANCELLED";

  await handleRazorpayWebhook(webhook("payment_link.cancelled"), "sig");

  assert.equal(db.conversations.get("conv-1").status, "DISCOVERY");
  assert.equal(db.messages.length, 0);
});
