process.env.WHATSAPP_APP_SECRET = "test-app-secret";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const {
  isWithinServiceWindow,
  getServiceWindowClosesAt,
  verifyWebhookSignature,
} = require("../src/utils/whatsapp");

const HOUR = 60 * 60 * 1000;

test("service window is open for 24h after the last inbound message", () => {
  const now = new Date("2026-09-15T12:00:00Z");

  assert.equal(isWithinServiceWindow(null, now), false);
  assert.equal(isWithinServiceWindow(new Date(now.getTime() - HOUR), now), true);
  assert.equal(isWithinServiceWindow(new Date(now.getTime() - 23.9 * HOUR), now), true);
  assert.equal(isWithinServiceWindow(new Date(now.getTime() - 24 * HOUR), now), false);
  assert.equal(isWithinServiceWindow(new Date(now.getTime() - 30 * HOUR), now), false);
});

test("service window close time is 24h after the last inbound message", () => {
  const lastInboundAt = new Date("2026-09-15T12:00:00Z");

  assert.equal(getServiceWindowClosesAt(lastInboundAt).toISOString(), "2026-09-16T12:00:00.000Z");
  assert.equal(getServiceWindowClosesAt(null), null);
});

test("webhook signature verification", () => {
  const body = Buffer.from(JSON.stringify({ entry: [] }));
  const valid = "sha256=" + crypto.createHmac("sha256", "test-app-secret").update(body).digest("hex");

  assert.equal(verifyWebhookSignature(body, valid), true);
  assert.equal(verifyWebhookSignature(body, "sha256=deadbeef"), false);
  assert.equal(verifyWebhookSignature(body, undefined), false);
  assert.equal(verifyWebhookSignature(Buffer.from("tampered"), valid), false);
});
