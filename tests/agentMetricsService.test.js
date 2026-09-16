const test = require("node:test");
const assert = require("node:assert/strict");
const { mockModule } = require("./helpers/mockModule");

mockModule("src/prisma/client.js", {});

const { summarizeMetrics, classifyRequest, estimateTokens } = require("../src/services/agentMetricsService");

const call = (messageId, overrides = {}) => ({
  messageId,
  stage: "DISCOVERY",
  requestType: "answer",
  totalTokens: 500,
  cachedTokens: null,
  latencyMs: 1000,
  messageCount: 3,
  estSystemTokens: 250,
  estContextTokens: 40,
  estHistoryTokens: 30,
  estToolTokens: 200,
  toolNames: [],
  ...overrides,
});

test("summarizes replies, percentiles, stages, request types and tool use", () => {
  const calls = [
    call("m1"),
    call("m2", { stage: "PRODUCT_RECOMMENDATION", requestType: "catalog", toolNames: ["search_products"] }),
    call("m2", { stage: "PRODUCT_RECOMMENDATION", requestType: "catalog" }),
  ];
  const replies = [
    { id: "m1", totalTokens: 500, promptTokens: 480, completionTokens: 20, durationMs: 1000, modelCalls: 1, toolCalls: 0 },
    { id: "m2", totalTokens: 1100, promptTokens: 1060, completionTokens: 40, durationMs: 2500, modelCalls: 2, toolCalls: 1 },
    { id: "m3", totalTokens: 0, promptTokens: 0, completionTokens: 0, durationMs: 2, modelCalls: 0, toolCalls: 0 },
  ];

  const metrics = summarizeMetrics(calls, replies);

  assert.equal(metrics.replies.count, 3);
  assert.equal(metrics.replies.instantReplies, 1);
  assert.equal(metrics.replies.totalTokens.avg, 533);
  assert.equal(metrics.replies.totalTokens.median, 500);
  assert.equal(metrics.replies.totalTokens.p95, 1100);
  assert.equal(metrics.replies.avgModelCalls, 1);
  assert.equal(metrics.modelCalls.count, 3);
  assert.deepEqual(metrics.modelCalls.avgInputBreakdown, { systemRules: 250, dynamicContext: 40, history: 30, tools: 200 });
  assert.deepEqual(
    metrics.byRequestType.map((row) => [row.requestType, row.replies]).sort(),
    [["answer", 1], ["catalog", 1], ["static", 1]]
  );
  assert.deepEqual(metrics.toolFrequency, [{ tool: "search_products", count: 1 }]);
});

test("request types and token estimates", () => {
  assert.equal(classifyRequest([]), "answer");
  assert.equal(classifyRequest(["search_products", "update_draft_order"]), "catalog");
  assert.equal(classifyRequest(["update_draft_order"]), "save_details");
  assert.equal(classifyRequest(["update_draft_order", "place_order"]), "order");
  assert.equal(classifyRequest([], { failed: true }), "fallback");
  assert.equal(estimateTokens("abcdefgh"), 2);
});
