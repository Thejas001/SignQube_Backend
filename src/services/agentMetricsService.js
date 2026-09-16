const prisma = require("../prisma/client");
const { TEST_PHONE_PREFIX } = require("./customerMessagingService");

const MAX_ROWS = 50000;

// Rough token estimate (~4 characters per token for English/JSON). Used only
// to attribute a call's input tokens to its parts (rules, context, history,
// tools); the totals themselves come from the provider's usage numbers.
function estimateTokens(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return Math.ceil(text.length / 4);
}

/** Buckets a reply by what it needed, for "average by request type". */
function classifyRequest(toolNames, { failed = false } = {}) {
  if (failed) return "fallback";
  if (toolNames.includes("place_order")) return "order";
  if (toolNames.includes("request_human_handoff")) return "handoff";
  if (toolNames.includes("start_new_order")) return "new_order";
  if (toolNames.includes("search_products") || toolNames.includes("get_product_details")) return "catalog";
  if (toolNames.includes("get_store_info")) return "store_info";
  if (toolNames.includes("update_draft_order")) return "save_details";
  return "answer";
}

async function recordModelCalls({ conversationId, messageId, requestType, calls }) {
  if (!calls || calls.length === 0) {
    return;
  }

  await prisma.agentModelCall.createMany({
    data: calls.map((call) => ({
      conversationId,
      messageId: messageId || null,
      requestType,
      round: call.round,
      stage: call.stage,
      model: call.model,
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      totalTokens: call.totalTokens,
      cachedTokens: call.cachedTokens ?? null,
      latencyMs: call.latencyMs,
      messageCount: call.messageCount,
      estSystemTokens: call.estSystemTokens,
      estContextTokens: call.estContextTokens,
      estHistoryTokens: call.estHistoryTokens,
      estToolTokens: call.estToolTokens,
      toolCalls: call.toolNames.length,
      toolNames: call.toolNames,
      finishReason: call.finishReason || null,
    })),
  });
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))];
}

function average(values) {
  return values.length === 0 ? 0 : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function describe(values) {
  return { avg: average(values), median: percentile(values, 50), p95: percentile(values, 95) };
}

function groupBy(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

/**
 * Pure aggregation over model-call rows and reply rows, kept separate from the
 * queries so it can be tested. A "reply" is one agent answer to the customer,
 * which may take 0 (instant static reply), 1 or several model calls.
 */
function summarizeMetrics(calls, replies) {
  const callsByMessage = groupBy(calls.filter((call) => call.messageId), (call) => call.messageId);

  const replyRows = replies.map((reply) => {
    const replyCalls = callsByMessage.get(reply.id) || [];
    return {
      totalTokens: reply.totalTokens || 0,
      inputTokens: reply.promptTokens || 0,
      outputTokens: reply.completionTokens || 0,
      latencyMs: reply.durationMs || 0,
      modelCalls: reply.modelCalls || 0,
      toolCalls: reply.toolCalls || 0,
      stage: replyCalls[0]?.stage || "NONE",
      requestType: replyCalls[0]?.requestType || (reply.modelCalls === 0 ? "static" : "unknown"),
    };
  });

  const summarizeGroup = (rows) => ({
    replies: rows.length,
    tokens: describe(rows.map((row) => row.totalTokens)),
    avgLatencyMs: average(rows.map((row) => row.latencyMs)),
    avgModelCalls: rows.length ? Number((rows.reduce((sum, row) => sum + row.modelCalls, 0) / rows.length).toFixed(2)) : 0,
  });

  const toolFrequency = new Map();
  for (const call of calls) {
    for (const name of call.toolNames || []) {
      toolFrequency.set(name, (toolFrequency.get(name) || 0) + 1);
    }
  }

  return {
    replies: {
      count: replyRows.length,
      instantReplies: replyRows.filter((row) => row.modelCalls === 0).length,
      totalTokens: describe(replyRows.map((row) => row.totalTokens)),
      avgInputTokens: average(replyRows.map((row) => row.inputTokens)),
      avgOutputTokens: average(replyRows.map((row) => row.outputTokens)),
      latencyMs: describe(replyRows.map((row) => row.latencyMs)),
      avgModelCalls: summarizeGroup(replyRows).avgModelCalls,
      avgToolCalls: replyRows.length
        ? Number((replyRows.reduce((sum, row) => sum + row.toolCalls, 0) / replyRows.length).toFixed(2))
        : 0,
    },
    modelCalls: {
      count: calls.length,
      totalTokens: describe(calls.map((call) => call.totalTokens)),
      latencyMs: describe(calls.map((call) => call.latencyMs)),
      avgMessages: average(calls.map((call) => call.messageCount)),
      avgCachedTokens: average(calls.map((call) => call.cachedTokens || 0)),
      // Where each call's input goes, estimated.
      avgInputBreakdown: {
        systemRules: average(calls.map((call) => call.estSystemTokens)),
        dynamicContext: average(calls.map((call) => call.estContextTokens)),
        history: average(calls.map((call) => call.estHistoryTokens)),
        tools: average(calls.map((call) => call.estToolTokens)),
      },
    },
    byStage: [...groupBy(replyRows, (row) => row.stage)].map(([stage, rows]) => ({ stage, ...summarizeGroup(rows) })),
    byRequestType: [...groupBy(replyRows, (row) => row.requestType)].map(([requestType, rows]) => ({
      requestType,
      ...summarizeGroup(rows),
    })),
    toolFrequency: [...toolFrequency].map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count),
  };
}

async function getAgentMetrics({ days = 7, includeTest = true } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const conversationFilter = includeTest ? {} : { conversation: { NOT: { waPhoneNumber: { startsWith: TEST_PHONE_PREFIX } } } };

  const [calls, replies] = await Promise.all([
    prisma.agentModelCall.findMany({
      where: { createdAt: { gte: since }, ...conversationFilter },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
      select: {
        messageId: true,
        stage: true,
        requestType: true,
        totalTokens: true,
        cachedTokens: true,
        latencyMs: true,
        messageCount: true,
        estSystemTokens: true,
        estContextTokens: true,
        estHistoryTokens: true,
        estToolTokens: true,
        toolNames: true,
      },
    }),
    prisma.message.findMany({
      where: { role: "ASSISTANT", createdAt: { gte: since }, modelCalls: { not: null }, ...conversationFilter },
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
      select: {
        id: true,
        totalTokens: true,
        promptTokens: true,
        completionTokens: true,
        durationMs: true,
        modelCalls: true,
        toolCalls: true,
      },
    }),
  ]);

  return { windowDays: days, includeTest, since, ...summarizeMetrics(calls, replies) };
}

module.exports = {
  estimateTokens,
  classifyRequest,
  recordModelCalls,
  summarizeMetrics,
  getAgentMetrics,
};
