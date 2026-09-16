const crypto = require("crypto");
const prisma = require("../prisma/client");
const env = require("../config/env");
const { getOpenAiClient } = require("../utils/openai");
const { sendTextMessage, getMediaUrl, downloadMedia, SERVICE_WINDOW_MS } = require("../utils/whatsapp");
const { uploadToS3 } = require("./s3Service");
const agentSettingsService = require("./agentSettingsService");
const { REPLY_TOOLS, getToolsForConversation, messageNamesProduct, runTool, attachPhotoToDraft } = require("./agentTools");
const { toModelDraft, describeOrderProgress, buildOrderSummary, nextDetailQuestion } = require("./conversationStageService");
const { estimateTokens, classifyRequest, recordModelCalls } = require("./agentMetricsService");
const { getCatalogContext } = require("./catalogContextService");
const { scheduleConversationWork } = require("./conversationQueue");
const { TEST_PHONE_PREFIX, isTestConversation } = require("./customerMessagingService");

const MAX_TOOL_ROUNDS = 6;
const HISTORY_ROLE_TO_OPENAI = {
  USER: "user",
  ASSISTANT: "assistant",
  ADMIN: "assistant",
};
const REPLY_FALLBACK_TEXT = "Sorry, one moment please.";

function isUniqueViolation(error) {
  return error?.code === "P2002";
}

async function getOrCreateConversation(waPhoneNumber, waProfileName) {
  const existing = await prisma.conversation.findUnique({
    where: { waPhoneNumber },
  });

  if (existing) {
    if (waProfileName && waProfileName !== existing.waProfileName) {
      return prisma.conversation.update({
        where: { id: existing.id },
        data: { waProfileName },
      });
    }
    return existing;
  }

  const matchedUser = await prisma.user.findFirst({ where: { phone: waPhoneNumber } });

  try {
    return await prisma.conversation.create({
      data: {
        waPhoneNumber,
        waProfileName: waProfileName || null,
        userId: matchedUser ? matchedUser.id : null,
      },
    });
  } catch (error) {
    // Two webhooks for a brand-new customer can race to create the row.
    if (isUniqueViolation(error)) {
      return prisma.conversation.findUnique({ where: { waPhoneNumber } });
    }
    throw error;
  }
}

/**
 * Stores an inbound customer message. Returns null if this WhatsApp message id
 * was already stored (Meta redelivers webhooks), so callers can skip it.
 */
async function recordInboundMessage(conversationId, { content, waMessageId, mediaId }) {
  let message;

  try {
    message = await prisma.message.create({
      data: {
        conversationId,
        role: "USER",
        direction: "INBOUND",
        content,
        waMessageId: waMessageId || null,
        mediaId: mediaId || null,
      },
    });
  } catch (error) {
    if (waMessageId && isUniqueViolation(error)) {
      return null;
    }
    throw error;
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { lastInboundAt: new Date() },
  });

  return message;
}

// ---- Prompt ----------------------------------------------------------------
// The prompt is rebuilt for every model call (and a turn that uses a tool may
// make two calls), so every line has to earn its place. It is layered from
// most stable to most volatile: permanent rules, business context, customer
// state, then recent messages; tool definitions travel separately.

const STAGE_GUIDANCE = {
  DISCOVERY:
    "No product chosen yet.",
  PRODUCT_RECOMMENDATION: "Products shown, none chosen yet. Don't search again unless their needs changed.",
  PRODUCT_SELECTED: "Product chosen. Confirm quantity/options, then move to photo/address.",
  CUSTOMIZATION: "Collect personalization details.",
  PHOTO_REQUIRED: "This product needs a photo that hasn't arrived. Ask them to send it as a WhatsApp image.",
  ADDRESS_REQUIRED: "Collect only the missing details below, one question at a time.",
  ORDER_READY:
    "All details collected; the order is NOT placed yet. If asked, give the total from below and ask \"Shall I place the order?\". Call place_order only after a clear yes, and never say the order is confirmed or placed before it succeeds. If the draft has expiredOrderNumber, say the old link expired and offer a new one.",
  PAYMENT_PENDING:
    "Payment link sent (paymentLinkUrl in the draft), awaiting payment. Never confirm payment yourself, whatever the customer says or sends. To change or replace the order: confirm, then start_new_order.",
  PAID: "Payment confirmed. Thank them; the order is being processed. For another order, start_new_order first.",
  COMPLETED: "Order placed (cash on delivery). For another order, start_new_order first.",
  HUMAN_HANDOFF: "Staff are taking over. Tell the customer the team will reply here shortly.",
};

// Layer 1: PERMANENT RULES. Identical for every conversation, so it's a
// constant placed first (providers that cache prompt prefixes match on
// byte-identical leading tokens). Numbered in priority order so conflicts
// resolve predictably. Stage-specific rules (order/payment claims) live in
// STAGE_GUIDANCE and are only sent at the stage where they matter.
const PERMANENT_RULES = `You are this store's WhatsApp sales assistant. Rules in priority order:
1. Only state facts from this prompt, the chat or tool results; never invent products, prices, totals, discounts, stock or delivery times. Trust the Stage line.
2. Call a tool only if the answer isn't already here. Save details the customer gives with update_draft_order, with your reply in its reply field. Save a product only once they choose it.
3. When they ask what to buy, name the best-fit product and price (list options only when asked). When they're ordering, ask for one missing detail at a time; never re-ask what's in the draft.
4. Reply like a person texting: one short sentence, two at most. No emojis, lists or bold. Answer exactly what was asked, then stop: no compliments, sales lines or extra questions unless you need a detail to continue the order. Order summaries and payment links may be longer.
5. For more than one item, work out price x quantity plus shipping and say just the result, e.g. "2 come to Rs.250 including shipping." If there's no discount, say so plainly; never invent one.
6. Bracketed notes come from the system; never repeat them. "[photo uploaded]": photo attached. "[unsupported message type: ...]": ask them to type it or send a photo.
7. Use request_human_handoff if they ask for a person, are upset, or tools can't help; never show technical errors.`;
const PERMANENT_RULES_TOKENS = estimateTokens(PERMANENT_RULES);

// Policies longer than this are fetched on demand (get_store_info) instead of
// riding along on every call; short ones are cheaper inline than a tool round.
const INLINE_POLICY_CHARS = 300;

function hasLongPolicies(settings) {
  return [settings.deliveryInfo, settings.returnPolicy].some((text) => text && text.length > INLINE_POLICY_CHARS);
}

// Layer 2: BUSINESS CONTEXT. Changes only when an admin edits Agent Settings
// or the catalog, so it extends the stable prefix after the rules. A small
// catalog is listed here in full (see catalogContextService).
function buildBusinessContext(settings, catalog) {
  const policy = (label, text) => {
    if (!text) return null;
    return text.length > INLINE_POLICY_CHARS ? `${label}: ask get_store_info.` : `${label}: ${text}`;
  };

  // Checkout adds this to every order, so any total the model quotes must too.
  const shipping = env.shippingFee > 0 ? `Shipping: Rs.${env.shippingFee} per order, added to the total.` : "Shipping: free.";

  return [
    `Store: ${settings.businessName}, custom acrylic photo frames, India. Tone: ${settings.tone}.`,
    shipping,
    policy("Delivery", settings.deliveryInfo),
    policy("Returns", settings.returnPolicy),
    settings.systemPromptExtra || null,
    catalog?.inline ? `Catalog (complete; answer product and price questions from it): ${catalog.text}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatShownProducts(agentContext) {
  const shownProducts = Array.isArray(agentContext?.shownProducts) ? agentContext.shownProducts : [];

  if (shownProducts.length === 0) {
    return null;
  }

  const lines = shownProducts.map((product) => {
    const price = product.basePrice != null ? ` Rs.${product.basePrice}` : "";
    return `#${product.productId} ${product.title}${price}`;
  });

  return `Shown already, answer from this list instead of searching: ${lines.join("; ")}`;
}

// Layer 3: CUSTOMER STATE. Structured, backend-owned facts, so the model never
// has to rediscover them from old messages: the stage and what it requires,
// exactly which details are missing, the checkout-computed total, the draft,
// and the products already shown.
async function buildCustomerState(conversation, catalog) {
  const stage = conversation.status;
  const progress = await describeOrderProgress(stage, conversation.draftOrder);
  const draft = toModelDraft(conversation.draftOrder);

  return [
    `Stage: ${stage}. ${STAGE_GUIDANCE[stage] || ""}${progress ? ` ${progress}` : ""}`,
    Object.keys(draft).length > 0 ? `Draft (never re-ask): ${JSON.stringify(draft)}` : null,
    // With the whole catalog in the prompt, the shown-products list repeats it.
    catalog?.inline ? null : formatShownProducts(conversation.agentContext),
  ]
    .filter(Boolean)
    .join("\n");
}

// ---- History ---------------------------------------------------------------
// Layer 4: RECENT MESSAGES. A window of the last N messages (env). Durable facts
// (product, quantity, address, needs, shown products) live in the customer
// state above, so dropping older messages loses no order data. Older messages
// are also clipped so one pasted essay doesn't ride along for N more turns;
// the newest message is always sent in full.
const HISTORY_MESSAGE_CHARS = 500;

async function loadHistory(conversationId) {
  const records = await prisma.message.findMany({
    where: {
      conversationId,
      role: { in: ["USER", "ASSISTANT", "ADMIN"] },
    },
    orderBy: { createdAt: "desc" },
    take: env.openai.maxHistoryMessages,
  });

  const newest = records[0] || null;

  return {
    newestRole: newest?.role || null,
    // Newest customer message the model gets to see — used afterwards to tell
    // whether more messages arrived while the reply was being generated.
    lastUserMessageId: records.find((message) => message.role === "USER")?.id || null,
    messages: records.reverse().map((message) => {
      const clip = message !== newest && message.content.length > HISTORY_MESSAGE_CHARS;
      return {
        role: HISTORY_ROLE_TO_OPENAI[message.role] || "user",
        content: clip ? `${message.content.slice(0, HISTORY_MESSAGE_CHARS)}...` : message.content,
      };
    }),
  };
}

// ---- Replies without a model call -------------------------------------------
// A brand-new conversation that opens with a bare greeting gets the configured
// welcome message instantly: the model would only produce a greeting anyway.
// Anything with content ("hi, I need a frame"), a returning customer, or an
// empty welcome message setting goes to the model as usual.
const GREETING_PATTERN = /^(hi+|hii+|hello+|hey+|helo+|hai|hlo|namaste|namaskar|hola|good (morning|afternoon|evening))( there)?$/;

function isPureGreeting(text) {
  const normalized = (text || "")
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return GREETING_PATTERN.test(normalized);
}

// What we say to a returning customer's bare "hi" when no order is under way.
const GREETING_REPLY = "Hi, how can I help you?";
// Stages where nothing is in progress that a greeting should pick back up.
const IDLE_STAGES = ["DISCOVERY", "PRODUCT_RECOMMENDATION"];

function renderWelcomeMessage(settings) {
  const template = settings.welcomeMessage?.trim();
  return template ? template.replaceAll("{businessName}", settings.businessName) : null;
}

/**
 * The customer's messages we haven't answered yet (oldest first), and our
 * last reply before them.
 */
function splitUnanswered(history) {
  const messages = history.messages;
  let index = messages.length - 1;

  while (index >= 0 && messages[index].role === "user") {
    index -= 1;
  }

  return { ourLastMessage: index >= 0 ? messages[index] : null, customerMessages: messages.slice(index + 1) };
}

function getInstantReply(conversation, history, settings) {
  const { ourLastMessage, customerMessages } = splitUnanswered(history);
  const greetingOnly =
    customerMessages.some((message) => isPureGreeting(message.content)) &&
    customerMessages.every((message) => isPureGreeting(message.content) || isAcknowledgement(message.content));

  if (!greetingOnly) {
    return null;
  }

  // A brand-new chat gets the welcome message (the model answers if it's empty).
  if (!ourLastMessage) {
    return renderWelcomeMessage(settings);
  }

  // Mid-order, the model picks the conversation back up instead.
  return IDLE_STAGES.includes(conversation.status) ? GREETING_REPLY : null;
}

// ---- Messages that need no reply ---------------------------------------------
// "ok", "thanks", a thumbs-up: after we've said all there is to say, a person
// just doesn't answer. Replying anyway starts a loop of sign-offs ("Let me
// know if you need anything else." / "ok" / "Feel free to reach out..." /
// "ok"...). An acknowledgement only gets a reply when our last message asked
// something, because then "ok" is an answer ("Shall I place the order?" "ok").
const ACKNOWLEDGEMENT_WORDS = new Set([
  "ok", "okay", "okey", "okk", "okkk", "k", "kk", "sure", "fine", "cool", "alright", "alrighty",
  "great", "nice", "noted", "got", "it", "thanks", "thank", "thankyou", "you", "u", "thx", "ty",
  "tq", "so", "much", "a", "lot", "hmm", "hm", "hmmm", "done", "np", "welcome",
]);

function isAcknowledgement(text) {
  // Emoji and punctuation are dropped, so "👍" or "ok!!" reduce to nothing or "ok".
  const words = (text || "").toLowerCase().replace(/[^\p{L}\s]/gu, " ").split(/\s+/).filter(Boolean);
  return words.every((word) => ACKNOWLEDGEMENT_WORDS.has(word));
}

function needsNoReply(history, settings) {
  const { ourLastMessage, customerMessages } = splitUnanswered(history);

  if (!ourLastMessage || customerMessages.length === 0) {
    return false;
  }

  if (!customerMessages.every((message) => isAcknowledgement(message.content))) {
    return false;
  }

  // "How can I help you?" isn't waiting on an answer the way "Shall I place
  // the order?" is, so "ok" after a greeting needs no reply either.
  const isGreeting = [GREETING_REPLY, renderWelcomeMessage(settings)].includes(ourLastMessage.content);
  return isGreeting || !ourLastMessage.content.includes("?");
}

// ---- Model loop --------------------------------------------------------------

function addUsage(totals, usage) {
  if (!usage) {
    return;
  }
  totals.promptTokens += usage.prompt_tokens || 0;
  totals.completionTokens += usage.completion_tokens || 0;
  totals.totalTokens += usage.total_tokens || 0;
}

// When a save moves the order to a new stage, the model wrote its reply
// before seeing that stage's guidance. The reply can still go out as-is if it
// already does what the new stage asks; otherwise the model gets one more
// round. ORDER_READY always gets that round: its summary needs the
// checkout-computed total, which only appears in the new state.
// Whole words only: "shipping" must not count as asking for a PIN.
const REPLY_FITS_STAGE = {
  PHOTO_REQUIRED: /\b(photos?|images?|pictures?|pics?)\b/i,
  ADDRESS_REQUIRED: /\b(how many|quantity|name|address|city|state|pin|pincode|postal|phone|number)\b/i,
};

const PHOTO_WORDS = /\b(photos?|images?|pictures?|pics?)\b/i;

function replyFitsStage(stage, reply) {
  return Boolean(REPLY_FITS_STAGE[stage] && typeof reply === "string" && REPLY_FITS_STAGE[stage].test(reply));
}

function customerNamedShownProduct(conversation, customerText) {
  const shownProducts = conversation.agentContext?.shownProducts || [];
  return shownProducts.some((product) => messageNamesProduct(customerText, product.title));
}

const toolTokenEstimates = new WeakMap();

function estimateToolTokens(tools) {
  if (!toolTokenEstimates.has(tools)) {
    toolTokenEstimates.set(tools, estimateTokens(tools));
  }
  return toolTokenEstimates.get(tools);
}

async function runToolCallingLoop(initialConversation, history, settings) {
  const client = getOpenAiClient();
  const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const startedAt = Date.now();
  const calls = [];
  const toolNames = [];
  // Model turns and tool results accumulated during this reply.
  const turnMessages = [];
  const longPolicies = hasLongPolicies(settings);
  const catalog = await getCatalogContext();
  const businessContext = buildBusinessContext(settings, catalog);
  const systemTokens = PERMANENT_RULES_TOKENS + estimateTokens(businessContext);
  const historyTokens = estimateTokens(history.messages.map((message) => message.content).join("\n"));
  const customerText = [...history.messages].reverse().find((message) => message.role === "user")?.content || "";
  let conversation = initialConversation;
  let handedOff = false;
  let searchedThisTurn = false;

  const finish = (text) => ({
    text: toPlainReply(text) || "Sorry, could you repeat?",
    usage,
    durationMs: Date.now() - startedAt,
    handedOff,
    calls,
    toolNames,
  });

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      // After a tool round, re-read the conversation so the stage guidance,
      // draft and offered tools reflect what those tools just changed.
      if (round > 0) {
        conversation = await prisma.conversation.findUnique({ where: { id: conversation.id } });
      }

      // Right after a search, the model tends to save the product it is about
      // to recommend, costing an extra round and committing a product the
      // customer never chose. So the follow-up round can't update the draft,
      // unless the customer's own message named a product ("I want the X").
      const tools = getToolsForConversation(conversation, {
        longPolicies,
        withoutDraftUpdates: searchedThisTurn && !customerNamedShownProduct(conversation, customerText),
        catalogInline: catalog.inline,
      });
      const offeredTools = new Set(tools.map((tool) => tool.function.name));
      const customerState = await buildCustomerState(conversation, catalog);
      const requestMessages = [
        { role: "system", content: [PERMANENT_RULES, businessContext, customerState].join("\n\n") },
        ...history.messages,
        ...turnMessages,
      ];

      const callMetrics = {
        round,
        stage: conversation.status,
        model: env.openai.model,
        messageCount: requestMessages.length,
        estSystemTokens: systemTokens,
        estContextTokens: estimateTokens(customerState),
        estHistoryTokens: historyTokens + estimateTokens(turnMessages),
        estToolTokens: estimateToolTokens(tools),
      };
      const callStartedAt = Date.now();
      let response;

      try {
        response = await client.chat.completions.create({
          model: env.openai.model,
          max_tokens: env.openai.maxTokens,
          messages: requestMessages,
          ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
          ...(env.openai.temperature !== undefined ? { temperature: env.openai.temperature } : {}),
          ...(env.openai.reasoningEffort ? { reasoning_effort: env.openai.reasoningEffort } : {}),
        });
      } catch (error) {
        // Record the failed attempt (after the SDK's own bounded retries) so
        // failures show up in the metrics rather than vanishing.
        calls.push({
          ...callMetrics,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          latencyMs: Date.now() - callStartedAt,
          toolNames: [],
          finishReason: "error",
        });
        throw error;
      }

      addUsage(usage, response.usage);
      const assistantMessage = response.choices[0].message;
      const toolCalls = assistantMessage.tool_calls || [];
      turnMessages.push(assistantMessage);

      calls.push({
        ...callMetrics,
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
        cachedTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? null,
        latencyMs: Date.now() - callStartedAt,
        toolNames: toolCalls.map((toolCall) => toolCall.function.name),
        finishReason: response.choices[0].finish_reason || null,
      });

      if (toolCalls.length === 0) {
        return finish(assistantMessage.content || "Sorry, could you repeat?");
      }

      let needsFollowUpRound = false;
      let toolReply = null;
      // A reply built in code (order summary, next detail question) that
      // takes precedence over what the model wrote.
      let summaryReply = null;

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        let args = {};
        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch (error) {
          args = {};
        }
        const { reply, ...toolArgs } = args;

        let result;
        if (!offeredTools.has(toolName)) {
          result = { error: `${toolName} isn't available at stage ${conversation.status}` };
        } else {
          try {
            result = await runTool(toolName, conversation.id, toolArgs);
          } catch (error) {
            result = { error: error.message || "Tool call failed" };
          }
        }

        toolNames.push(toolName);

        if (toolName === "search_products" && !result?.error) {
          searchedThisTurn = true;
        }

        if (toolName === "request_human_handoff" && result?.handedOff) {
          handedOff = true;
        }

        // A reply written alongside the tool call can be sent as-is only if the
        // tool succeeded and nothing the model didn't know about changed: a
        // stage change brings new guidance (e.g. "ask for the photo", "read
        // back the total"), so the model gets a follow-up round to see it.
        // If the product was held back (customer hadn't chosen it), only a
        // reply that asks them to pick is still right to send as-is.
        const replyAsks = typeof reply === "string" && reply.includes("?");
        const canCarryReply =
          REPLY_TOOLS.includes(toolName) && !result?.error && (!result?.productNotSaved || replyAsks);
        const movedStage = toolName === "update_draft_order" && result?.stage && result.stage !== conversation.status;

        // Becoming ready to order gets the exact, code-built summary instead
        // of a model-written one.
        const orderSummary =
          canCarryReply && movedStage && result.stage === "ORDER_READY" ? await buildOrderSummary(result.draftOrder) : null;

        // While collecting address details, asking for a photo is never right:
        // a product that needs one can't reach this stage without it. An
        // off-track reply there (or one that doesn't ask for anything after the
        // product was just chosen) is replaced by the next missing detail's
        // question, unless the customer asked something the model must answer.
        const offTrackForAddress =
          canCarryReply &&
          result.stage === "ADDRESS_REQUIRED" &&
          !customerText.includes("?") &&
          (PHOTO_WORDS.test(reply || "") || (movedStage && !replyFitsStage(result.stage, reply)));
        const detailQuestion = offTrackForAddress ? nextDetailQuestion(result.draftOrder) : null;

        if (orderSummary) {
          summaryReply = orderSummary;
        } else if (detailQuestion) {
          summaryReply = `Got it. ${detailQuestion}`;
        } else if (!canCarryReply || (movedStage && !replyFitsStage(result.stage, reply))) {
          needsFollowUpRound = true;
        } else if (typeof reply === "string" && reply.trim()) {
          toolReply = reply.trim();
        }

        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            role: "TOOL",
            direction: "OUTBOUND",
            content: JSON.stringify(result).slice(0, 2000),
            toolName,
            toolPayload: args,
          },
        });

        turnMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      if (!needsFollowUpRound) {
        const text = summaryReply || assistantMessage.content?.trim() || toolReply;

        if (text) {
          return finish(text);
        }
      }
    }
  } catch (error) {
    // Keep the calls that did happen so a failed reply is still observable.
    error.agentCalls = calls;
    error.agentToolNames = toolNames;
    throw error;
  }

  return finish("One moment, checking.");
}

// ---- Persistence ---------------------------------------------------------------

// Emoji and markdown bold are stripped from model replies before sending:
// the prompt asks for plain text, and this guarantees it when the model slips.
const EMOJI_PATTERN = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\u200D\uFE0F]/gu;

function toPlainReply(text) {
  return String(text || "")
    .replace(EMOJI_PATTERN, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/[ \t]+([.,!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

async function sendAndPersistReply(conversation, reply) {
  const assistantMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "ASSISTANT",
      direction: "OUTBOUND",
      content: reply.text,
      promptTokens: reply.usage?.promptTokens ?? null,
      completionTokens: reply.usage?.completionTokens ?? null,
      totalTokens: reply.usage?.totalTokens ?? null,
      durationMs: reply.durationMs ?? null,
      modelCalls: reply.calls ? reply.calls.length : null,
      toolCalls: reply.toolNames ? reply.toolNames.length : null,
    },
  });

  let waMessageId = null;

  if (!isTestConversation(conversation)) {
    try {
      const sendResult = await sendTextMessage(conversation.waPhoneNumber, reply.text);
      waMessageId = sendResult?.messages?.[0]?.id || null;
    } catch (error) {
      console.error("Failed to send WhatsApp reply:", error.message);
    }
  }

  // Independent writes; neither depends on the other.
  await Promise.all([
    waMessageId ? prisma.message.update({ where: { id: assistantMessage.id }, data: { waMessageId } }) : null,
    prisma.conversation.update({ where: { id: conversation.id }, data: { lastOutboundAt: new Date() } }),
  ]);

  return assistantMessage;
}

async function recordReplyMetrics(conversationId, messageId, reply) {
  if (!reply.calls || reply.calls.length === 0) {
    return;
  }

  try {
    await recordModelCalls({
      conversationId,
      messageId,
      requestType: classifyRequest(reply.toolNames || [], { failed: reply.failed }),
      calls: reply.calls,
    });
  } catch (error) {
    // Metrics must never break a customer reply.
    console.error("Failed to record agent metrics:", error.message);
  }
}

function imageExtension(contentType) {
  if (contentType.includes("png")) {
    return "png";
  }
  if (contentType.includes("webp")) {
    return "webp";
  }
  return "jpg";
}

/**
 * Downloads any customer photos that were received but not yet stored, moves
 * them to S3 and attaches them to the draft order. Photos are processed from
 * the stored message (not the webhook payload) so a restart mid-download
 * doesn't lose them. Returns how many were handled.
 */
async function processPendingPhotos(conversationId) {
  const pending = await prisma.message.findMany({
    where: { conversationId, role: "USER", mediaId: { not: null }, mediaUrl: null },
    orderBy: { createdAt: "asc" },
  });

  for (const message of pending) {
    let photoUrl;

    try {
      const mediaUrl = await getMediaUrl(message.mediaId);
      const { buffer, contentType } = await downloadMedia(mediaUrl);
      const uploadResult = await uploadToS3(
        buffer,
        `wa-photo-${Date.now()}.${imageExtension(contentType)}`,
        contentType,
        "customizations"
      );
      photoUrl = uploadResult.url;

      await prisma.message.update({ where: { id: message.id }, data: { mediaUrl: photoUrl } });
    } catch (error) {
      console.error("Failed to process WhatsApp photo:", error.message);
      // Clear mediaId so this isn't retried forever; the note tells the agent
      // to ask for the photo again.
      await prisma.message.update({
        where: { id: message.id },
        data: {
          mediaId: null,
          content: `${message.content} [this photo couldn't be processed - ask the customer to send it again]`,
        },
      });
      continue;
    }

    try {
      await attachPhotoToDraft(conversationId, photoUrl);
    } catch (error) {
      // The photo is saved on the draft already; place_order re-links it.
      console.error("Failed to link WhatsApp photo to the draft order:", error.message);
    }
  }

  return pending.length;
}

async function getLatestCustomerMessageId(conversationId) {
  const latest = await prisma.message.findFirst({
    where: { conversationId, role: "USER" },
    orderBy: { createdAt: "desc" },
  });

  return latest?.id || null;
}

// Replies are stored after any messages that arrived while they were being
// generated, so "is the last message from the customer?" alone would treat
// those as answered. Each pass therefore checks whether the customer wrote
// anything the model didn't see, and goes again if so (bounded).
const MAX_REPLY_PASSES = 3;

async function processConversationOnce(conversationId) {
  let hasUnseenMessages = false;

  for (let pass = 0; pass < MAX_REPLY_PASSES; pass += 1) {
    let conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });

    if (!conversation || conversation.status === "HUMAN_HANDOFF") {
      return;
    }

    if ((await processPendingPhotos(conversationId)) > 0) {
      // Photos can change the draft and stage.
      conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    }

    const history = await loadHistory(conversationId);

    if (!hasUnseenMessages && history.newestRole !== "USER") {
      return;
    }

    const settings = await agentSettingsService.getAgentSettings();

    if (needsNoReply(history, settings)) {
      return;
    }

    const startedAt = Date.now();
    const instantText = getInstantReply(conversation, history, settings);
    let reply;

    if (instantText) {
      reply = {
        text: instantText,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        durationMs: Date.now() - startedAt,
        handedOff: false,
        calls: [],
        toolNames: [],
      };
    } else {
      try {
        reply = await runToolCallingLoop(conversation, history, settings);
      } catch (error) {
        // Test chat surfaces the real error to the admin instead.
        if (isTestConversation(conversation)) {
          throw error;
        }

        console.error(`AI reply failed for conversation ${conversationId}:`, error.message);
        reply = {
          text: REPLY_FALLBACK_TEXT,
          usage: null,
          durationMs: Date.now() - startedAt,
          handedOff: false,
          failed: true,
          calls: error.agentCalls || [],
          toolNames: error.agentToolNames || [],
        };
      }
    }

    const fresh = await prisma.conversation.findUnique({ where: { id: conversationId } });

    // Staff took over while the reply was being generated: drop it. A handoff the
    // agent requested itself still sends its "the team will reply" message.
    if (fresh.status === "HUMAN_HANDOFF" && !reply.handedOff) {
      await recordReplyMetrics(conversationId, null, reply);
      return;
    }

    const message = await sendAndPersistReply(fresh, reply);
    await recordReplyMetrics(conversationId, message.id, reply);

    // Never loop after a fallback: the AI is failing, one apology is enough.
    if (reply.failed || !history.lastUserMessageId) {
      return;
    }

    hasUnseenMessages = (await getLatestCustomerMessageId(conversationId)) !== history.lastUserMessageId;

    if (!hasUnseenMessages) {
      return;
    }
  }
}

/**
 * Runs the agent for a conversation: processes pending photos and replies to
 * anything unanswered. Serialized per conversation, and messages that arrive
 * mid-run are covered by one follow-up pass rather than parallel replies.
 */
function scheduleConversationProcessing(conversationId) {
  return scheduleConversationWork(conversationId, () => processConversationOnce(conversationId));
}

/**
 * Picks up conversations whose last customer message never got a reply —
 * e.g. the server restarted between storing the message and replying. Only
 * within the 24-hour window, since a late free-form reply can't be delivered
 * after that.
 */
async function resumePendingConversations() {
  const candidates = await prisma.conversation.findMany({
    where: {
      lastInboundAt: { gte: new Date(Date.now() - SERVICE_WINDOW_MS) },
      status: { not: "HUMAN_HANDOFF" },
      NOT: { waPhoneNumber: { startsWith: TEST_PHONE_PREFIX } },
    },
    select: { id: true, lastInboundAt: true, lastOutboundAt: true },
  });

  const pending = candidates.filter(
    (conversation) => !conversation.lastOutboundAt || conversation.lastOutboundAt < conversation.lastInboundAt
  );

  for (const conversation of pending) {
    scheduleConversationProcessing(conversation.id).catch(() => {
      // Already logged by the conversation queue.
    });
  }

  return pending.length;
}

async function createTestConversation() {
  const suffix = crypto.randomBytes(6).toString("hex");

  return prisma.conversation.create({
    data: {
      waPhoneNumber: `${TEST_PHONE_PREFIX}${suffix}`,
      waProfileName: "Dashboard Test Customer",
    },
  });
}

async function handleTestChatMessage(conversationId, text) {
  let conversation = conversationId
    ? await prisma.conversation.findUnique({ where: { id: conversationId } })
    : null;

  if (!conversation || !isTestConversation(conversation)) {
    conversation = await createTestConversation();
  }

  await recordInboundMessage(conversation.id, { content: text });
  await scheduleConversationProcessing(conversation.id);

  return prisma.conversation.findUnique({
    where: { id: conversation.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

module.exports = {
  getOrCreateConversation,
  recordInboundMessage,
  scheduleConversationProcessing,
  resumePendingConversations,
  handleTestChatMessage,
  TEST_PHONE_PREFIX,
};
