/* eslint-disable no-console */
// Runs a fixed matrix of realistic conversations through the real agent and
// reports tokens, latency, model calls and tool calls per turn.
//
// - Uses the dashboard test-chat path (TEST- conversations): nothing is sent
//   to WhatsApp, and no scenario confirms an order, so no Razorpay link or
//   order is ever created.
// - Makes REAL model and embedding calls with the configured provider/key.
//
// Usage:
//   node scripts/agentBenchmark.js                 run all scenarios
//   node scripts/agentBenchmark.js --only greeting run one scenario
//   node scripts/agentBenchmark.js --out r.json    also save raw results
//   node scripts/agentBenchmark.js --pace 4500     min ms between API calls
//                                                  (stay under provider RPM limits;
//                                                  waiting is excluded from latency)
const fs = require("fs");
const openaiUtil = require("../src/utils/openai");
const prisma = require("../src/prisma/client");
const { handleTestChatMessage } = require("../src/services/aiAgentService");

const SCENARIOS = [
  { name: "greeting", type: "simple", turns: ["Hi"], expect: { noTools: true } },
  { name: "simple-question", type: "simple", turns: ["Do you deliver to Mysore?"], expect: { noTools: true, reply: /deliver|yes/i } },
  {
    name: "normal",
    type: "normal",
    turns: ["Hi", "I want a photo frame for my mom's birthday", "Is there anything cheaper?"],
    expect: { reply: /250|499/ },
  },
  {
    name: "long-flow",
    type: "long",
    turns: [
      "Hi",
      "I need a frame for my office desk",
      "what options do you have?",
      "I'll take the Test Product 2026-07-23",
      "2 pieces",
      "My name is Rahul Verma",
      "phone 9876543210",
      "12 MG Road",
      "Bengaluru",
      "Karnataka",
      "560001",
      "what is the total?",
    ],
    // 2 x Rs.499 + Rs.99 SHIPPING_FEE (from .env) = Rs.1,097, the amount checkout charges.
    expect: { stage: "ORDER_READY", reply: /1,?097/, draft: { productId: 2, quantity: 2, postalCode: "560001" } },
  },
  {
    name: "complex",
    type: "complex",
    turns: ["I need 3 frames: one for my parents' anniversary and two for my office. What do you suggest and what would the total be?"],
    expect: { reply: /\d/ },
  },
  // No photo was sent in this scenario, so the reply must not mention one.
  { name: "tool-required", type: "tool", turns: ["Show me frames for a wedding gift"], expect: { reply: /^(?![\s\S]*already uploaded)[\s\S]*Rs\.?\s?\d/ } },
  {
    name: "multi-tool",
    type: "multi-tool",
    turns: ["What products do you have?", "Tell me more about the Premium UV one, I'll take 2"],
    expect: { toolsInclude: ["update_draft_order"], draft: { productId: 3, quantity: 2 } },
  },
  {
    name: "state-dependent",
    type: "state",
    turns: ["I want the Premium UV Acrylic Photo Prints", "1 piece", "what do I need to do next?"],
    expect: { stage: "PHOTO_REQUIRED", toolsExclude: ["search_products"], reply: /photo/i },
  },
  {
    name: "context-dependent",
    type: "context",
    turns: ["What products do you have?", "how much was the cheapest one?"],
    expect: { toolsExclude: ["search_products"], reply: /250/ },
  },
  {
    name: "edge-bare-number",
    type: "edge",
    // "2" may be a quantity or, if the agent just asked "Test1 or Test2?", a size.
    turns: ["What products do you have?", "Premium UV one please", "2"],
    expect: { draft: { productId: 3 } },
  },
  {
    name: "price-and-discount",
    type: "normal",
    turns: ["Hi , what is the cost of 2 acrylic photos", "is there any discount", "any other discount in in this 499"],
    expect: { reply: /\b(no|not|don't|doesn't|isn't)\b/i },
  },
  { name: "edge-unsupported", type: "edge", turns: ["[unsupported message type: audio]"], expect: { noTools: true, reply: /typ|text|write|send/i } },
  { name: "edge-emoji", type: "edge", turns: ["👍"], expect: { noTools: true } },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  return { only: get("--only"), out: get("--out"), dump: get("--dump"), pace: Number(get("--pace") || 6000) };
}

const ARGS = parseArgs();
const estimate = (text) => Math.ceil((text || "").length / 4);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Pacing keeps the run under the provider's requests-per-minute limit. Time
// spent waiting here is tracked so it can be subtracted from turn latency.
let lastApiCallAt = 0;
let pacingWaitMs = 0;
async function pace() {
  const waitMs = lastApiCallAt + ARGS.pace - Date.now();
  if (waitMs > 0) {
    pacingWaitMs += waitMs;
    await sleep(waitMs);
  }
  lastApiCallAt = Date.now();
}

async function withRateLimitRetry(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error.status !== 429) throw error;
    console.log("\n  (429 rate limit: waiting 60s, excluded from latency)");
    pacingWaitMs += 60000;
    await sleep(60000);
    lastApiCallAt = Date.now();
    return fn();
  }
}

// Wrap the shared client so every model call is measured, regardless of
// which version of the agent code is running.
const callLog = [];
const client = openaiUtil.getOpenAiClient();
// The SDK would otherwise retry 429s itself with backoff, and that waiting would
// be counted as model latency. Retries are handled (and excluded) above instead.
client.maxRetries = 0;
const originalCreate = client.chat.completions.create.bind(client.chat.completions);
client.chat.completions.create = async (request, options) => {
  if (ARGS.dump) {
    // Exact request payloads, one JSON per line, for auditing what is sent.
    fs.appendFileSync(ARGS.dump, `${JSON.stringify(request)}\n`);
  }
  await pace();
  const startedAt = Date.now();
  const response = await withRateLimitRetry(() => originalCreate(request, options));
  const [system, ...rest] = request.messages;
  const message = response.choices[0].message;
  callLog.push({
    latencyMs: Date.now() - startedAt,
    inputTokens: response.usage?.prompt_tokens ?? 0,
    outputTokens: response.usage?.completion_tokens ?? 0,
    totalTokens: response.usage?.total_tokens ?? 0,
    messages: request.messages.length,
    estSystem: estimate(system.content),
    estHistoryAndTurn: estimate(rest.map((m) => m.content || JSON.stringify(m.tool_calls || "")).join("")),
    estTools: estimate(JSON.stringify(request.tools || [])),
    toolsOffered: (request.tools || []).map((tool) => tool.function.name),
    toolCallsReturned: (message.tool_calls || []).map((call) => call.function.name),
  });
  return response;
};

let embeddingCalls = 0;
const originalEmbed = client.embeddings.create.bind(client.embeddings);
client.embeddings.create = async (...args) => {
  embeddingCalls += 1;
  await pace();
  return withRateLimitRetry(() => originalEmbed(...args));
};

const words = (text) => (text || "").trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;

function checkExpectations(expect, lastTurn, conversation) {
  const failures = [];
  const draft = conversation.draftOrder || {};

  if (expect.noTools && lastTurn.tools.length > 0) failures.push(`expected no tools, got ${lastTurn.tools.join(",")}`);
  for (const tool of expect.toolsInclude || []) {
    if (!lastTurn.allToolsInScenario.includes(tool)) failures.push(`expected tool ${tool}`);
  }
  for (const tool of expect.toolsExclude || []) {
    if (lastTurn.tools.includes(tool)) failures.push(`unexpected tool ${tool} on last turn`);
  }
  if (expect.stage && conversation.status !== expect.stage) failures.push(`stage ${conversation.status} != ${expect.stage}`);
  if (expect.reply && !expect.reply.test(lastTurn.reply)) failures.push(`reply didn't match ${expect.reply}`);
  for (const [key, value] of Object.entries(expect.draft || {})) {
    if (draft[key] !== value) failures.push(`draft.${key}=${JSON.stringify(draft[key])} != ${JSON.stringify(value)}`);
  }
  return failures;
}

async function runScenario(scenario) {
  let conversationId = null;
  const turns = [];
  const allTools = [];

  for (const text of scenario.turns) {
    const callsBefore = callLog.length;
    const embeddingsBefore = embeddingCalls;
    const waitedBefore = pacingWaitMs;
    const startedAt = Date.now();
    const conversation = await handleTestChatMessage(conversationId, text);
    const wallMs = Date.now() - startedAt - (pacingWaitMs - waitedBefore);
    conversationId = conversation.id;

    const lastUserIndex = conversation.messages.map((m) => m.role).lastIndexOf("USER");
    const turnMessages = conversation.messages.slice(lastUserIndex + 1);
    const tools = turnMessages.filter((m) => m.role === "TOOL").map((m) => m.toolName);
    const reply = turnMessages.filter((m) => m.role === "ASSISTANT").at(-1)?.content || "";
    const calls = callLog.slice(callsBefore);
    allTools.push(...tools);

    turns.push({
      customer: text,
      reply,
      replyWords: words(reply),
      stage: conversation.status,
      wallMs,
      modelCalls: calls.length,
      embeddingCalls: embeddingCalls - embeddingsBefore,
      tools,
      inputTokens: calls.reduce((sum, call) => sum + call.inputTokens, 0),
      outputTokens: calls.reduce((sum, call) => sum + call.outputTokens, 0),
      totalTokens: calls.reduce((sum, call) => sum + call.totalTokens, 0),
      calls,
    });
  }

  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  const lastTurn = { ...turns.at(-1), allToolsInScenario: allTools };
  // Every reply in every scenario must be plain text.
  const emojiTurns = turns.filter((turn) => /\p{Extended_Pictographic}/u.test(turn.reply));
  return {
    name: scenario.name,
    type: scenario.type,
    conversationId,
    finalStage: conversation.status,
    finalDraft: conversation.draftOrder,
    failures: [
      ...checkExpectations(scenario.expect || {}, lastTurn, conversation),
      ...emojiTurns.map((turn) => `emoji in reply to "${turn.customer}"`),
    ],
    turns,
  };
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const avg = (values) => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0);

async function main() {
  const { only, out } = ARGS;
  const scenarios = SCENARIOS.filter((scenario) => !only || scenario.name === only);
  const results = [];

  for (const scenario of scenarios) {
    process.stdout.write(`running ${scenario.name}... `);
    try {
      const result = await runScenario(scenario);
      results.push(result);
      console.log(result.failures.length ? `CHECK FAILED: ${result.failures.join("; ")}` : "ok");
    } catch (error) {
      console.log(`ERROR: ${error.message}`);
      results.push({ name: scenario.name, type: scenario.type, error: error.message, turns: [], failures: [error.message] });
    }
  }

  const turns = results.flatMap((result) => result.turns);
  const calls = turns.flatMap((turn) => turn.calls);

  console.log("\nPer turn:");
  for (const result of results) {
    for (const turn of result.turns) {
      console.log(
        `  ${result.name.padEnd(18)} ${String(turn.totalTokens).padStart(5)} tok  ${String(turn.modelCalls)} calls  ${String(turn.wallMs).padStart(5)}ms  ${turn.stage.padEnd(22)} [${turn.tools.join(",") || "-"}]  "${turn.customer}" -> "${turn.reply}"`
      );
    }
  }

  console.log("\nSummary (per customer turn):");
  const summary = {
    turns: turns.length,
    avgInputTokens: avg(turns.map((t) => t.inputTokens)),
    avgOutputTokens: avg(turns.map((t) => t.outputTokens)),
    avgTotalTokens: avg(turns.map((t) => t.totalTokens)),
    medianTotalTokens: percentile(turns.map((t) => t.totalTokens), 50),
    p95TotalTokens: percentile(turns.map((t) => t.totalTokens), 95),
    maxTotalTokens: Math.max(...turns.map((t) => t.totalTokens)),
    avgLatencyMs: avg(turns.map((t) => t.wallMs)),
    p95LatencyMs: percentile(turns.map((t) => t.wallMs), 95),
    totalModelCalls: calls.length,
    avgModelCallsPerTurn: (calls.length / Math.max(turns.length, 1)).toFixed(2),
    totalToolCalls: turns.reduce((sum, t) => sum + t.tools.length, 0),
    totalEmbeddingCalls: turns.reduce((sum, t) => sum + t.embeddingCalls, 0),
    avgTokensPerModelCall: avg(calls.map((c) => c.totalTokens)),
    avgEstSystemTokensPerCall: avg(calls.map((c) => c.estSystem)),
    avgEstToolTokensPerCall: avg(calls.map((c) => c.estTools)),
    avgEstHistoryTokensPerCall: avg(calls.map((c) => c.estHistoryAndTurn)),
    avgReplyWords: avg(turns.map((t) => t.replyWords)),
    maxReplyWords: Math.max(...turns.map((t) => t.replyWords)),
    checksPassed: `${results.filter((r) => r.failures.length === 0).length}/${results.length}`,
  };
  console.table(summary);

  if (out) {
    fs.writeFileSync(out, JSON.stringify({ summary, results }, null, 2));
    console.log(`raw results written to ${out}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
