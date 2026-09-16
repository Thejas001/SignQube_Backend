const AppError = require("../utils/appError");
const { verifyWebhookSignature } = require("../utils/whatsapp");
const aiAgentService = require("./aiAgentService");

function verifyAndParseWebhook(rawBodyBuffer, signatureHeader) {
  const isValid = verifyWebhookSignature(rawBodyBuffer, signatureHeader);

  if (!isValid) {
    throw new AppError("Invalid WhatsApp webhook signature", 400);
  }

  try {
    return JSON.parse(rawBodyBuffer.toString("utf8"));
  } catch (error) {
    throw new AppError("Invalid WhatsApp webhook payload", 400);
  }
}

function extractProfileName(value, from) {
  const contact = (value.contacts || []).find((entry) => entry.wa_id === from);
  return contact?.profile?.name || null;
}

function describeInboundMessage(message) {
  switch (message.type) {
    case "text":
      return { content: message.text?.body || "" };
    case "image": {
      const caption = message.image?.caption;
      return {
        content: caption ? `[photo uploaded] ${caption}` : "[photo uploaded]",
        mediaId: message.image?.id || null,
      };
    }
    case "button":
      return { content: message.button?.text || "" };
    case "interactive":
      return {
        content:
          message.interactive?.button_reply?.title ||
          message.interactive?.list_reply?.title ||
          "[unsupported message type: interactive]",
      };
    default:
      return { content: `[unsupported message type: ${message.type}]` };
  }
}

/**
 * Stores one inbound message. Returns the conversation id if the agent should
 * process it, or null for duplicates and conversations staff have taken over.
 */
async function ingestInboundMessage(value, message) {
  const from = message.from;
  const waMessageId = message.id;

  if (!from || !waMessageId) {
    return null;
  }

  const conversation = await aiAgentService.getOrCreateConversation(from, extractProfileName(value, from));
  const { content, mediaId } = describeInboundMessage(message);
  const recorded = await aiAgentService.recordInboundMessage(conversation.id, { content, waMessageId, mediaId });

  if (!recorded || conversation.status === "HUMAN_HANDOFF") {
    return null;
  }

  return conversation.id;
}

/**
 * Persists every message in the webhook before it's acknowledged. If this
 * throws, the controller responds with an error and Meta redelivers the event;
 * already-stored messages are skipped by their unique WhatsApp message id.
 */
async function ingestEvent(event) {
  const conversationIds = new Set();

  for (const entry of event.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      for (const message of value.messages || []) {
        const conversationId = await ingestInboundMessage(value, message);

        if (conversationId) {
          conversationIds.add(conversationId);
        }
      }
    }
  }

  return [...conversationIds];
}

function processConversationsInBackground(conversationIds) {
  for (const conversationId of conversationIds) {
    aiAgentService.scheduleConversationProcessing(conversationId).catch(() => {
      // Already logged by the conversation queue; the stored message is picked
      // up again by resumePendingConversations on the next restart.
    });
  }
}

module.exports = {
  verifyAndParseWebhook,
  ingestEvent,
  processConversationsInBackground,
};
