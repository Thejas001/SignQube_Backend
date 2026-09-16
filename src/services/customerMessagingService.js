const prisma = require("../prisma/client");
const env = require("../config/env");
const { sendTextMessage, sendTemplateMessage, isWithinServiceWindow } = require("../utils/whatsapp");

// Dashboard test-chat sessions use this waPhoneNumber prefix. Nothing is ever
// sent to WhatsApp for them, and they're kept out of the customer list.
const TEST_PHONE_PREFIX = "TEST-";

function isTestConversation(conversation) {
  return Boolean(conversation?.waPhoneNumber?.startsWith(TEST_PHONE_PREFIX));
}

/**
 * Sends a backend-originated notice (payment confirmed, link expired) and
 * records it in the thread so the agent sees it in its history. Inside the
 * 24-hour service window it goes out as plain text; outside it, as the given
 * approved template if one is configured, otherwise it's recorded as not
 * delivered rather than failing at the Graph API.
 */
async function notifyCustomer(conversation, text, { template } = {}) {
  let delivered = false;
  let note = null;

  if (isTestConversation(conversation)) {
    delivered = true;
  } else if (isWithinServiceWindow(conversation.lastInboundAt)) {
    try {
      await sendTextMessage(conversation.waPhoneNumber, text);
      delivered = true;
    } catch (error) {
      note = "not delivered: WhatsApp send failed";
      console.error("Failed to send WhatsApp notice:", error.message);
    }
  } else if (template?.name) {
    try {
      await sendTemplateMessage(
        conversation.waPhoneNumber,
        template.name,
        env.whatsapp.templateLanguage,
        template.components
      );
      delivered = true;
      note = `sent as template "${template.name}" because the 24-hour window was closed`;
    } catch (error) {
      note = "not delivered: WhatsApp template send failed";
      console.error("Failed to send WhatsApp template notice:", error.message);
    }
  } else {
    note = "not delivered: 24-hour window closed and no template configured";
  }

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: "ASSISTANT",
      direction: "OUTBOUND",
      content: note ? `${text}\n[${note}]` : text,
    },
  });

  if (delivered) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastOutboundAt: new Date() },
    });
  }

  return { delivered, message };
}

module.exports = {
  TEST_PHONE_PREFIX,
  isTestConversation,
  notifyCustomer,
};
