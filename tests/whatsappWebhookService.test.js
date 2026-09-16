const test = require("node:test");
const assert = require("node:assert/strict");
const { mockModule } = require("./helpers/mockModule");

const conversations = new Map();
const recorded = [];
const seenMessageIds = new Set();

mockModule("src/services/aiAgentService.js", {
  async getOrCreateConversation(phone, profileName) {
    if (!conversations.has(phone)) {
      conversations.set(phone, { id: `conv-${phone}`, waPhoneNumber: phone, waProfileName: profileName, status: "DISCOVERY" });
    }
    return conversations.get(phone);
  },
  async recordInboundMessage(conversationId, message) {
    if (message.waMessageId && seenMessageIds.has(message.waMessageId)) {
      return null;
    }
    seenMessageIds.add(message.waMessageId);
    recorded.push({ conversationId, ...message });
    return { id: `msg-${recorded.length}` };
  },
  async scheduleConversationProcessing() {},
});

const { ingestEvent } = require("../src/services/whatsappWebhookService");

function event(...messages) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ wa_id: "911111111111", profile: { name: "Ravi" } }],
              messages,
            },
          },
        ],
      },
    ],
  };
}

test.beforeEach(() => {
  conversations.clear();
  recorded.length = 0;
  seenMessageIds.clear();
});

test("stores every message and returns each conversation once", async () => {
  const ids = await ingestEvent(
    event(
      { from: "911111111111", id: "wamid.1", type: "text", text: { body: "hi" } },
      { from: "911111111111", id: "wamid.2", type: "text", text: { body: "need a frame" } }
    )
  );

  assert.deepEqual(ids, ["conv-911111111111"]);
  assert.deepEqual(recorded.map((m) => m.content), ["hi", "need a frame"]);
  assert.equal(conversations.get("911111111111").waProfileName, "Ravi");
});

test("redelivered webhooks are ignored", async () => {
  const payload = event({ from: "911111111111", id: "wamid.dup", type: "text", text: { body: "hi" } });

  assert.equal((await ingestEvent(payload)).length, 1);
  assert.deepEqual(await ingestEvent(payload), []);
  assert.equal(recorded.length, 1);
});

test("conversations with staff are stored but not sent to the agent", async () => {
  conversations.set("911111111111", { id: "conv-staff", status: "HUMAN_HANDOFF" });

  const ids = await ingestEvent(event({ from: "911111111111", id: "wamid.h", type: "text", text: { body: "hello?" } }));

  assert.deepEqual(ids, []);
  assert.equal(recorded[0].conversationId, "conv-staff");
});

test("photos keep their media id; unsupported types are described for the agent", async () => {
  await ingestEvent(
    event(
      { from: "911111111111", id: "wamid.img", type: "image", image: { id: "media-9", caption: "this one" } },
      { from: "911111111111", id: "wamid.voice", type: "audio", audio: { id: "media-10" } },
      { from: "911111111111", id: "wamid.btn", type: "interactive", interactive: { button_reply: { title: "Yes, order" } } }
    )
  );

  assert.deepEqual(
    recorded.map(({ content, mediaId }) => ({ content, mediaId })),
    [
      { content: "[photo uploaded] this one", mediaId: "media-9" },
      { content: "[unsupported message type: audio]", mediaId: undefined },
      { content: "Yes, order", mediaId: undefined },
    ]
  );
});
