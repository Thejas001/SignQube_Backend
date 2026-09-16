const asyncHandler = require("../utils/asyncHandler");
const env = require("../config/env");
const whatsappWebhookService = require("../services/whatsappWebhookService");

function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token && env.whatsapp.verifyToken && token === env.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
}

const handleIncomingMessage = asyncHandler(async (req, res) => {
  const event = whatsappWebhookService.verifyAndParseWebhook(
    req.body,
    req.headers["x-hub-signature-256"]
  );

  // Store first, acknowledge second: if storing fails Meta retries the event.
  // The agent itself runs after the 200 so slow AI replies never time out the webhook.
  const conversationIds = await whatsappWebhookService.ingestEvent(event);

  res.sendStatus(200);

  whatsappWebhookService.processConversationsInBackground(conversationIds);
});

module.exports = {
  verifyWebhook,
  handleIncomingMessage,
};
