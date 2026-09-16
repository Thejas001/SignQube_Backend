const test = require("node:test");
const assert = require("node:assert/strict");
const { mockModule } = require("./helpers/mockModule");

// ---- In-memory fakes -------------------------------------------------------

const db = { conversations: new Map(), messages: [] };
let messageSeq = 0;

function matchesWhere(message, where) {
  if (where.conversationId && message.conversationId !== where.conversationId) return false;
  if (where.role?.in && !where.role.in.includes(message.role)) return false;
  if (typeof where.role === "string" && message.role !== where.role) return false;
  if (where.mediaId?.not === null && message.mediaId == null) return false;
  if (where.mediaUrl === null && message.mediaUrl != null) return false;
  return true;
}

function sortMessages(messages, orderBy) {
  const sorted = [...messages].sort((a, b) => a.seq - b.seq);
  return orderBy?.createdAt === "desc" ? sorted.reverse() : sorted;
}

const metricRows = [];
const fakePrisma = {
  agentModelCall: {
    async createMany({ data }) {
      metricRows.push(...data);
      return { count: data.length };
    },
  },
  product: {
    async findFirst() {
      return { publicId: 2, basePrice: 499 };
    },
  },
  conversation: {
    async findUnique({ where }) {
      return where.id ? { ...db.conversations.get(where.id) } : null;
    },
    async update({ where, data }) {
      Object.assign(db.conversations.get(where.id), data);
      return { ...db.conversations.get(where.id) };
    },
  },
  message: {
    async create({ data }) {
      messageSeq += 1;
      const message = { id: `msg-${messageSeq}`, seq: messageSeq, createdAt: new Date(), mediaId: null, mediaUrl: null, ...data };
      db.messages.push(message);
      return message;
    },
    async update({ where, data }) {
      const message = db.messages.find((entry) => entry.id === where.id);
      Object.assign(message, data);
      return message;
    },
    async findMany({ where, orderBy, take }) {
      const found = sortMessages(db.messages.filter((m) => matchesWhere(m, where)), orderBy);
      return take ? found.slice(0, take) : found;
    },
    async findFirst({ where, orderBy }) {
      return sortMessages(db.messages.filter((m) => matchesWhere(m, where)), orderBy)[0] ?? null;
    },
  },
};

const sent = [];
let completionImpl = null;
let mediaDownloadFails = false;

mockModule("src/prisma/client.js", fakePrisma);
mockModule("src/utils/openai.js", {
  getOpenAiClient() {
    return {
      chat: {
        completions: {
          create: (...args) => completionImpl(...args),
        },
      },
    };
  },
});
mockModule("src/utils/whatsapp.js", {
  SERVICE_WINDOW_MS: 24 * 60 * 60 * 1000,
  async sendTextMessage(to, body) {
    sent.push({ to, body });
    return { messages: [{ id: `wamid-${sent.length}` }] };
  },
  async getMediaUrl() {
    if (mediaDownloadFails) throw new Error("media expired");
    return "https://graph/media";
  },
  async downloadMedia() {
    return { buffer: Buffer.from("img"), contentType: "image/jpeg" };
  },
});
mockModule("src/services/s3Service.js", {
  async uploadToS3() {
    return { url: "https://s3/uploaded.jpg" };
  },
});
let settings = null;
mockModule("src/services/agentSettingsService.js", {
  async getAgentSettings() {
    return settings;
  },
});
let catalog = { inline: false, text: "", products: [] };
mockModule("src/services/catalogContextService.js", {
  async getCatalogContext() {
    return catalog;
  },
});
const attachedPhotos = [];
const toolRuns = [];
let runToolImpl = async () => ({});
mockModule("src/services/agentTools.js", {
  REPLY_TOOLS: ["update_draft_order", "request_human_handoff"],
  getToolsForConversation(conversation, { withoutDraftUpdates = false, catalogInline = false } = {}) {
    const names =
      conversation.status === "ORDER_READY" ? ["update_draft_order", "place_order"] : ["update_draft_order", "search_products"];
    return names
      .filter((name) => !(withoutDraftUpdates && name === "update_draft_order"))
      .filter((name) => !(catalogInline && name === "search_products"))
      .map((name) => ({ type: "function", function: { name } }));
  },
  messageNamesProduct(message, title) {
    return message.toLowerCase().includes(title.toLowerCase());
  },
  async runTool(name, conversationId, args) {
    toolRuns.push(name);
    return runToolImpl(name, conversationId, args);
  },
  async attachPhotoToDraft(conversationId, url) {
    attachedPhotos.push({ conversationId, url });
  },
});

const aiAgentService = require("../src/services/aiAgentService");

function seedConversation(id, overrides = {}) {
  db.conversations.set(id, {
    id,
    waPhoneNumber: "919876543210",
    status: "DISCOVERY",
    draftOrder: {},
    agentContext: null,
    lastInboundAt: new Date(),
    lastOutboundAt: null,
    ...overrides,
  });
  return id;
}

function reply(text) {
  return { choices: [{ message: { content: text } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
}

function silenceConsole() {
  const original = console.error;
  console.error = () => {};
  return () => {
    console.error = original;
  };
}

function toolCallReply(content, ...names) {
  return toolCallWithArgs(content, ...names.map((name) => [name, {}]));
}

function toolCallWithArgs(content, ...calls) {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content,
          tool_calls: calls.map(([name, args], index) => ({
            id: `call-${index}`,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          })),
        },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

test.beforeEach(() => {
  sent.length = 0;
  attachedPhotos.length = 0;
  toolRuns.length = 0;
  metricRows.length = 0;
  settings = { businessName: "SIGNQUE", tone: "Friendly", welcomeMessage: null };
  catalog = { inline: false, text: "", products: [] };
  runToolImpl = async () => ({});
  mediaDownloadFails = false;
  completionImpl = async () => reply("Hi! Which frame are you looking for?");
});

test("replies to an unanswered customer message", async () => {
  const id = seedConversation("conv-reply");
  await aiAgentService.recordInboundMessage(id, { content: "hello", waMessageId: "wamid.in.1" });

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(sent.length, 1);
  assert.equal(sent[0].body, "Hi! Which frame are you looking for?");
});

test("does not reply twice to the same message", async () => {
  const id = seedConversation("conv-once");
  await aiAgentService.recordInboundMessage(id, { content: "hello", waMessageId: "wamid.in.2" });

  await aiAgentService.scheduleConversationProcessing(id);
  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(sent.length, 1);
});

// ---- Bug 6: AI failure -----------------------------------------------------

test("sends a fallback message when the AI call fails", async () => {
  const id = seedConversation("conv-ai-down");
  await aiAgentService.recordInboundMessage(id, { content: "hello", waMessageId: "wamid.in.3" });
  completionImpl = async () => {
    throw new Error("503 from provider");
  };

  const restore = silenceConsole();
  try {
    await aiAgentService.scheduleConversationProcessing(id);
  } finally {
    restore();
  }

  assert.equal(sent.length, 1);
  assert.equal(sent[0].body, "Sorry, one moment please.");
  assert.equal(db.messages.at(-1).modelCalls, 1, "the failed attempt is counted");
  assert.equal(metricRows.length, 1);
  assert.equal(metricRows[0].finishReason, "error");
  assert.equal(metricRows[0].requestType, "fallback");
});

test("test-chat conversations surface the AI error instead of a fallback", async () => {
  const id = seedConversation("conv-test", { waPhoneNumber: "TEST-abc123" });
  await aiAgentService.recordInboundMessage(id, { content: "hello" });
  completionImpl = async () => {
    throw new Error("invalid api key");
  };

  const restore = silenceConsole();
  try {
    await assert.rejects(aiAgentService.scheduleConversationProcessing(id), /invalid api key/);
  } finally {
    restore();
  }

  assert.equal(sent.length, 0);
});

// ---- Bug 3 / handoff interplay ---------------------------------------------

test("drops the AI reply if staff take over while it is being generated", async () => {
  const id = seedConversation("conv-takeover");
  await aiAgentService.recordInboundMessage(id, { content: "hello", waMessageId: "wamid.in.4" });
  completionImpl = async () => {
    db.conversations.get(id).status = "HUMAN_HANDOFF";
    return reply("too late");
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(sent.length, 0);
});

test("a burst of messages gets one reply covering all of them", async () => {
  const id = seedConversation("conv-burst");
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  completionImpl = async (request) => {
    calls += 1;
    if (calls === 1) await gate;
    return reply(`reply seeing ${request.messages.filter((m) => m.role === "user").length} message(s)`);
  };

  await aiAgentService.recordInboundMessage(id, { content: "hi", waMessageId: "wamid.b1" });
  const first = aiAgentService.scheduleConversationProcessing(id);
  await new Promise((resolve) => setImmediate(resolve));

  await aiAgentService.recordInboundMessage(id, { content: "I want a frame", waMessageId: "wamid.b2" });
  aiAgentService.scheduleConversationProcessing(id);
  await aiAgentService.recordInboundMessage(id, { content: "for my mom", waMessageId: "wamid.b3" });
  aiAgentService.scheduleConversationProcessing(id);

  release();
  await first;

  assert.equal(calls, 2, "one reply in flight + one follow-up, not one per message");
  assert.equal(sent.at(-1).body, "reply seeing 3 message(s)");
});

// ---- Bug 5 / durability: photos processed from stored messages -------------

test("stored photos are uploaded and attached before replying", async () => {
  const id = seedConversation("conv-photo");
  await aiAgentService.recordInboundMessage(id, { content: "[photo uploaded]", waMessageId: "wamid.p1", mediaId: "media-1" });

  await aiAgentService.scheduleConversationProcessing(id);

  assert.deepEqual(attachedPhotos, [{ conversationId: id, url: "https://s3/uploaded.jpg" }]);
  assert.equal(db.messages.find((m) => m.waMessageId === "wamid.p1").mediaUrl, "https://s3/uploaded.jpg");
  assert.equal(sent.length, 1);
});

test("a photo that can't be downloaded is flagged so the agent asks again", async () => {
  const id = seedConversation("conv-photo-fail");
  await aiAgentService.recordInboundMessage(id, { content: "[photo uploaded]", waMessageId: "wamid.p2", mediaId: "media-2" });
  mediaDownloadFails = true;

  const restore = silenceConsole();
  try {
    await aiAgentService.scheduleConversationProcessing(id);
  } finally {
    restore();
  }

  const message = db.messages.find((m) => m.waMessageId === "wamid.p2");
  assert.equal(message.mediaId, null, "not retried forever");
  assert.match(message.content, /couldn't be processed/);
  assert.equal(attachedPhotos.length, 0);
  assert.equal(sent.length, 1, "agent still replies");
});

// ---- Token optimisation ----------------------------------------------------

test("saving details with a reply in the same message takes one model call, not two", async () => {
  const id = seedConversation("conv-silent");
  await aiAgentService.recordInboundMessage(id, { content: "my name is Asha", waMessageId: "wamid.s1" });
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return toolCallReply("Thanks Asha! What's your city?", "update_draft_order");
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 1);
  assert.deepEqual(toolRuns, ["update_draft_order"]);
  assert.equal(sent[0].body, "Thanks Asha! What's your city?");
});

test("a failed silent tool still gets a follow-up round so the model can react", async () => {
  const id = seedConversation("conv-silent-error");
  await aiAgentService.recordInboundMessage(id, { content: "50 frames please", waMessageId: "wamid.s2" });
  runToolImpl = async () => {
    throw new Error("quantity must be a whole number between 1 and 20");
  };
  let calls = 0;
  completionImpl = async (request) => {
    calls += 1;
    if (calls === 1) return toolCallReply("Done, 50 frames!", "update_draft_order");
    assert.match(request.messages.at(-1).content, /between 1 and 20/, "model sees the tool error");
    return reply("Sorry, we can do up to 20 per order. How many would you like?");
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 2);
  assert.match(sent[0].body, /up to 20/);
});

test("tools that return information always get a follow-up round", async () => {
  const id = seedConversation("conv-search");
  await aiAgentService.recordInboundMessage(id, { content: "gift ideas?", waMessageId: "wamid.s3" });
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return calls === 1 ? toolCallReply("Let me check", "search_products") : reply("Our Classic Frame is Rs.999.");
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 2);
  assert.equal(sent[0].body, "Our Classic Frame is Rs.999.");
});

test("only stage-appropriate tools are offered, and others are refused", async () => {
  const id = seedConversation("conv-gated");
  await aiAgentService.recordInboundMessage(id, { content: "just order it", waMessageId: "wamid.s4" });
  const offered = [];
  let calls = 0;
  completionImpl = async (request) => {
    calls += 1;
    offered.push(request.tools.map((tool) => tool.function.name));
    if (calls === 1) return toolCallReply(null, "place_order");
    assert.match(request.messages.at(-1).content, /isn't available at stage DISCOVERY/);
    return reply("Which frame would you like first?");
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.ok(!offered[0].includes("place_order"));
  assert.deepEqual(toolRuns, [], "the refused tool never ran");
});

// ---- Production optimisation -----------------------------------------------

test("a new customer's bare greeting gets the welcome message with no model call", async () => {
  settings.welcomeMessage = "Hi! 👋 Welcome to {businessName}. What are you looking for?";
  const id = seedConversation("conv-welcome");
  await aiAgentService.recordInboundMessage(id, { content: "Hii 👋", waMessageId: "wamid.w1" });
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return reply("model greeting");
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 0);
  assert.equal(sent[0].body, "Hi! 👋 Welcome to SIGNQUE. What are you looking for?");
  const stored = db.messages.at(-1);
  assert.equal(stored.modelCalls, 0);
  assert.equal(stored.totalTokens, 0);
});

test("greetings with content, or no welcome message, still go to the model", async () => {
  settings.welcomeMessage = "Welcome!";
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return reply("model reply");
  };

  const withContent = seedConversation("conv-greet-content");
  await aiAgentService.recordInboundMessage(withContent, { content: "hi, I need a frame for my mom", waMessageId: "wamid.w2" });
  await aiAgentService.scheduleConversationProcessing(withContent);

  const returning = seedConversation("conv-greet-returning");
  await aiAgentService.recordInboundMessage(returning, { content: "hello", waMessageId: "wamid.w3" });
  await aiAgentService.scheduleConversationProcessing(returning);

  settings.welcomeMessage = null;
  const disabled = seedConversation("conv-greet-disabled");
  await aiAgentService.recordInboundMessage(disabled, { content: "hello", waMessageId: "wamid.w5" });
  await aiAgentService.scheduleConversationProcessing(disabled);

  assert.equal(calls, 2, "content greeting + disabled welcome; the new chat's 'hello' was instant");
  assert.deepEqual(sent.map((message) => message.body), ["model reply", "Welcome!", "model reply"]);
});

test("a reply carried in update_draft_order is sent without a second model call", async () => {
  const id = seedConversation("conv-reply-param", { status: "ADDRESS_REQUIRED" });
  await aiAgentService.recordInboundMessage(id, { content: "Bengaluru", waMessageId: "wamid.r1" });
  runToolImpl = async () => ({ stage: "ADDRESS_REQUIRED", draftOrder: { city: "Bengaluru" } });
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return toolCallWithArgs(null, ["update_draft_order", { city: "Bengaluru", reply: "Got it! Which state?" }]);
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 1);
  assert.equal(sent[0].body, "Got it! Which state?");
  assert.equal(db.messages.at(-1).modelCalls, 1);
  assert.equal(metricRows[0].requestType, "save_details");
});

test("a save that moves the stage gets a follow-up call so the model sees the new step", async () => {
  const id = seedConversation("conv-stage-move", { status: "ADDRESS_REQUIRED" });
  await aiAgentService.recordInboundMessage(id, { content: "560001", waMessageId: "wamid.r2" });
  runToolImpl = async () => {
    Object.assign(db.conversations.get(id), {
      status: "ORDER_READY",
      draftOrder: { productId: 2, quantity: 2, fullName: "A", phone: "9", line1: "x", city: "Bengaluru", state: "KA", postalCode: "560001" },
    });
    return {
      stage: "ORDER_READY",
      draftOrder: { productId: 2, productTitle: "Desk Frame", quantity: 2, city: "Bengaluru", postalCode: "560001" },
    };
  };
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return toolCallWithArgs(null, ["update_draft_order", { postalCode: "560001", reply: "Thanks, your order is confirmed!" }]);
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 1, "the summary is built in code, no second call");
  assert.equal(sent[0].body, "That's 2 x Desk Frame to Bengaluru, total Rs.1,097 including Rs.99 shipping. Shall I place the order?");
});

test("a model failure after a tool ran sends one fallback and never re-runs the tool", async () => {
  const id = seedConversation("conv-fail-after-tool");
  await aiAgentService.recordInboundMessage(id, { content: "show me frames", waMessageId: "wamid.f1" });
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    if (calls === 1) return toolCallReply(null, "search_products");
    throw new Error("503 from provider");
  };

  const restore = silenceConsole();
  try {
    await aiAgentService.scheduleConversationProcessing(id);
  } finally {
    restore();
  }

  assert.deepEqual(toolRuns, ["search_products"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].body, "Sorry, one moment please.");
  assert.deepEqual(
    metricRows.map((row) => row.finishReason === "error"),
    [false, true],
    "both the successful and the failed call are recorded"
  );
});

test("older long messages are clipped in history; the newest is sent in full", async () => {
  const id = seedConversation("conv-history");
  const essay = "x".repeat(2000);
  await aiAgentService.recordInboundMessage(id, { content: essay, waMessageId: "wamid.h1" });
  await aiAgentService.scheduleConversationProcessing(id);
  await aiAgentService.recordInboundMessage(id, { content: essay, waMessageId: "wamid.h2" });

  let historyLengths = null;
  completionImpl = async (request) => {
    historyLengths = request.messages.slice(1).map((message) => message.content.length);
    return reply("ok");
  };
  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(historyLengths.at(-1), 2000, "newest message intact");
  assert.equal(historyLengths[0], 503, "older message clipped to 500 chars + ...");
});

test("after a search, the follow-up round can't save a product the customer didn't name", async () => {
  const id = seedConversation("conv-post-search", { agentContext: { shownProducts: [{ productId: 3, title: "Premium Print" }] } });
  await aiAgentService.recordInboundMessage(id, { content: "frames for a wedding gift?", waMessageId: "wamid.ps1" });
  const offered = [];
  let calls = 0;
  completionImpl = async (request) => {
    calls += 1;
    offered.push(request.tools.map((tool) => tool.function.name));
    return calls === 1 ? toolCallReply(null, "search_products") : reply("Our Premium Print is Rs.499. Want it?");
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.ok(offered[0].includes("update_draft_order"));
  assert.ok(!offered[1].includes("update_draft_order"), "no draft updates straight after searching");
});

test("a customer who names the product can still have it saved after the search", async () => {
  const id = seedConversation("conv-post-search-named", { agentContext: { shownProducts: [{ productId: 3, title: "Premium Print" }] } });
  await aiAgentService.recordInboundMessage(id, { content: "I want the Premium Print", waMessageId: "wamid.ps2" });
  const offered = [];
  let calls = 0;
  completionImpl = async (request) => {
    calls += 1;
    offered.push(request.tools.map((tool) => tool.function.name));
    return calls === 1 ? toolCallReply(null, "search_products") : reply("Great, how many?");
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.ok(offered[1].includes("update_draft_order"));
});

test("a stage move is sent in one call when the reply already asks for what the new stage needs", async () => {
  const id = seedConversation("conv-stage-fits", { status: "PRODUCT_RECOMMENDATION" });
  await aiAgentService.recordInboundMessage(id, { content: "I'll take it", waMessageId: "wamid.sf1" });
  runToolImpl = async () => {
    db.conversations.get(id).status = "PHOTO_REQUIRED";
    return { stage: "PHOTO_REQUIRED" };
  };
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return toolCallWithArgs(null, ["update_draft_order", { productId: 3, reply: "Great choice! Please send the photo you'd like printed." }]);
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 1);
  assert.match(sent[0].body, /send the photo/);
});

test("a small catalog is in the prompt, so product questions take one call and no search", async () => {
  catalog = { inline: true, text: "#1 Classic Frame Rs.999; #2 Mini Frame Rs.499", products: [] };
  const id = seedConversation("conv-inline-catalog", { agentContext: { shownProducts: [{ productId: 9, title: "Old", basePrice: 1 }] } });
  await aiAgentService.recordInboundMessage(id, { content: "what do you have?", waMessageId: "wamid.ic1" });
  let request = null;
  let calls = 0;
  completionImpl = async (body) => {
    calls += 1;
    request = body;
    return reply("Classic Frame Rs.999 or Mini Frame Rs.499. Which one?");
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 1);
  assert.ok(request.messages[0].content.includes("Catalog (complete; answer product and price questions from it): #1 Classic Frame Rs.999"));
  assert.ok(!request.messages[0].content.includes("Shown already"), "the catalog replaces the shown-products list");
  assert.ok(!request.tools.map((tool) => tool.function.name).includes("search_products"));
});

test("a held-back product with a reply that asks the customer is sent in one call", async () => {
  const id = seedConversation("conv-held-asks");
  await aiAgentService.recordInboundMessage(id, { content: "a gift for my mom", waMessageId: "wamid.h1" });
  runToolImpl = async () => ({ stage: "DISCOVERY", draftOrder: {}, productNotSaved: "#3 not saved" });
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return toolCallWithArgs(null, ["update_draft_order", { productId: 3, reply: "Our Premium Print is Rs.499. Want it?" }]);
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 1);
  assert.equal(sent[0].body, "Our Premium Print is Rs.499. Want it?");
});

test("a held-back product with a reply that assumes the choice gets a follow-up call", async () => {
  const id = seedConversation("conv-held-assumes");
  await aiAgentService.recordInboundMessage(id, { content: "a gift for my mom", waMessageId: "wamid.h2" });
  runToolImpl = async () => ({ stage: "DISCOVERY", draftOrder: {}, productNotSaved: "#3 not saved" });
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return calls === 1
      ? toolCallWithArgs(null, ["update_draft_order", { productId: 3, reply: "Great choice! Send your photo." }])
      : reply("Our Premium Print is Rs.499. Would you like it?");
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 2);
  assert.match(sent[0].body, /Would you like it/);
});

test("a reply mentioning free shipping doesn't pass as asking for address details", async () => {
  const id = seedConversation("conv-shipping-word", { status: "PRODUCT_RECOMMENDATION" });
  // The customer asks something too, so the model (not a fixed question) must reply.
  await aiAgentService.recordInboundMessage(id, { content: "I'll take the desk frame, is it sturdy?", waMessageId: "wamid.sw1" });
  runToolImpl = async () => {
    db.conversations.get(id).status = "ADDRESS_REQUIRED";
    return { stage: "ADDRESS_REQUIRED" };
  };
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return calls === 1
      ? toolCallWithArgs(null, ["update_draft_order", { productId: 2, reply: "Added with free shipping! Send your photo." }])
      : reply("Great! What name should we deliver to?");
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 2, "the carried reply didn't ask for anything the new stage needs");
  assert.match(sent[0].body, /What name/);
});

test("asking how many counts as asking for what the address stage needs", async () => {
  const id = seedConversation("conv-how-many", { status: "PRODUCT_RECOMMENDATION" });
  await aiAgentService.recordInboundMessage(id, { content: "I'll take the desk frame", waMessageId: "wamid.hm1" });
  runToolImpl = async () => {
    db.conversations.get(id).status = "ADDRESS_REQUIRED";
    return { stage: "ADDRESS_REQUIRED" };
  };
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return toolCallWithArgs(null, ["update_draft_order", { productId: 2, reply: "Great choice! How many would you like?" }]);
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 1);
});

test("model replies are sent as plain text: no emojis or bold", async () => {
  const id = seedConversation("conv-plain");
  await aiAgentService.recordInboundMessage(id, { content: "any discount?", waMessageId: "wamid.pl1" });
  completionImpl = async () => reply("No discount right now 🎁, the **Premium Print** is Rs.499 👍🏽");

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(sent[0].body, "No discount right now, the Premium Print is Rs.499");
});

test("a reply that is only emojis falls back to a real sentence", async () => {
  const id = seedConversation("conv-only-emoji");
  await aiAgentService.recordInboundMessage(id, { content: "ok", waMessageId: "wamid.pl2" });
  completionImpl = async () => reply("👍😊");

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(sent[0].body, "Sorry, could you repeat?");
});

test("an off-track reply after choosing a product becomes the next detail question", async () => {
  const id = seedConversation("conv-next-detail", { status: "PRODUCT_RECOMMENDATION" });
  await aiAgentService.recordInboundMessage(id, { content: "I'll take the desk frame", waMessageId: "wamid.nd1" });
  runToolImpl = async () => {
    db.conversations.get(id).status = "ADDRESS_REQUIRED";
    return { stage: "ADDRESS_REQUIRED", draftOrder: { productId: 2, quantity: 2 } };
  };
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return toolCallWithArgs(null, ["update_draft_order", { productId: 2, reply: "Please send the photo you want on the frame." }]);
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 1);
  assert.equal(sent[0].body, "Got it. What name should I put on the delivery?");
});

test("asking for a photo during address collection is replaced by the next question", async () => {
  const id = seedConversation("conv-no-photo", { status: "ADDRESS_REQUIRED" });
  await aiAgentService.recordInboundMessage(id, { content: "2 pieces", waMessageId: "wamid.np1" });
  runToolImpl = async () => ({ stage: "ADDRESS_REQUIRED", draftOrder: { productId: 2, quantity: 2, fullName: "Asha" } });
  completionImpl = async () => toolCallWithArgs(null, ["update_draft_order", { quantity: 2, reply: "Please share your photo." }]);

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(sent[0].body, "Got it. What's your phone number?");
});

// ---- Acknowledgements ---------------------------------------------------------

async function replyThen(id, agentText, customerText, waMessageId) {
  await aiAgentService.recordInboundMessage(id, { content: "I will order later", waMessageId: `${waMessageId}.a` });
  completionImpl = async () => reply(agentText);
  await aiAgentService.scheduleConversationProcessing(id);
  await aiAgentService.recordInboundMessage(id, { content: customerText, waMessageId: `${waMessageId}.b` });
}

test("an acknowledgement after a closing reply gets no reply and no model call", async () => {
  const id = seedConversation("conv-ack-loop");
  await replyThen(id, "No problem, let me know whenever you are ready.", "ok", "wamid.ack1");
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return reply("Let me know if you need any help later.");
  };

  await aiAgentService.scheduleConversationProcessing(id);
  await aiAgentService.recordInboundMessage(id, { content: "thanks 👍", waMessageId: "wamid.ack1.c" });
  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 0);
  assert.equal(sent.length, 1, "only the original reply was sent");
});

test("an acknowledgement answering our question still goes to the model", async () => {
  const id = seedConversation("conv-ack-answer");
  await replyThen(id, "Shall I place the order?", "ok", "wamid.ack2");
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return reply("Done, here is your payment link.");
  };

  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 1);
});

test("an acknowledgement with a real question, or a first-message ok, still gets a reply", async () => {
  const withQuestion = seedConversation("conv-ack-question");
  await replyThen(withQuestion, "Let me know whenever you are ready.", "ok, how long is delivery", "wamid.ack3");
  completionImpl = async () => reply("5-7 days.");
  await aiAgentService.scheduleConversationProcessing(withQuestion);

  const firstMessage = seedConversation("conv-ack-first");
  await aiAgentService.recordInboundMessage(firstMessage, { content: "ok", waMessageId: "wamid.ack4" });
  await aiAgentService.scheduleConversationProcessing(firstMessage);

  assert.deepEqual(sent.map((message) => message.body).slice(-2), ["5-7 days.", "5-7 days."]);
});

// ---- Greetings mid-conversation -----------------------------------------------

test("a returning customer's hi gets a short instant greeting when no order is under way", async () => {
  const id = seedConversation("conv-returning-hi");
  await aiAgentService.recordInboundMessage(id, { content: "i will order later", waMessageId: "wamid.rh1" });
  completionImpl = async () => reply("No problem, let me know whenever you are ready.");
  await aiAgentService.scheduleConversationProcessing(id);
  let calls = 0;
  completionImpl = async () => {
    calls += 1;
    return reply("Hello! How can I help you with our custom acrylic photo frames today?");
  };

  await aiAgentService.recordInboundMessage(id, { content: "hi", waMessageId: "wamid.rh2" });
  await aiAgentService.scheduleConversationProcessing(id);
  await aiAgentService.recordInboundMessage(id, { content: "ok", waMessageId: "wamid.rh3" });
  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(calls, 0);
  assert.deepEqual(sent.map((message) => message.body).slice(-1), ["Hi, how can I help you?"]);
  assert.equal(sent.length, 2, "the ok after the greeting got no reply");
});

test("a hi in the middle of an order goes to the model to pick it back up", async () => {
  const id = seedConversation("conv-midorder-hi", { status: "ADDRESS_REQUIRED" });
  await aiAgentService.recordInboundMessage(id, { content: "2 pieces", waMessageId: "wamid.mh1" });
  completionImpl = async () => reply("What name should I put on the delivery?");
  await aiAgentService.scheduleConversationProcessing(id);
  completionImpl = async () => reply("Hi, shall we continue? What name should I put on the delivery?");

  await aiAgentService.recordInboundMessage(id, { content: "hi", waMessageId: "wamid.mh2" });
  await aiAgentService.scheduleConversationProcessing(id);

  assert.equal(sent.at(-1).body, "Hi, shall we continue? What name should I put on the delivery?");
});
