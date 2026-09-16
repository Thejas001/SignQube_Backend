const crypto = require("crypto");
const https = require("https");
const env = require("../config/env");
const AppError = require("./appError");

const GRAPH_HOST = "graph.facebook.com";
// WhatsApp only delivers free-form messages within 24h of the customer's last
// inbound message; outside that window only approved templates go through.
const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function getWhatsappConfig() {
  if (!env.whatsapp.accessToken || !env.whatsapp.phoneNumberId) {
    throw new AppError("WhatsApp is not configured on server", 500);
  }

  return env.whatsapp;
}

function sendGraphRequest(path, payload, method = "POST") {
  const { accessToken } = getWhatsappConfig();
  const body = payload ? JSON.stringify(payload) : null;

  return new Promise((resolve, reject) => {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
    };

    if (body) {
      headers["Content-Type"] = "application/json";
      headers["Content-Length"] = Buffer.byteLength(body);
    }

    const request = https.request(
      {
        hostname: GRAPH_HOST,
        path,
        method,
        headers,
      },
      (response) => {
        let responseBody = "";

        response.on("data", (chunk) => {
          responseBody += chunk;
        });

        response.on("end", () => {
          let parsedBody = {};

          if (responseBody) {
            try {
              parsedBody = JSON.parse(responseBody);
            } catch (error) {
              parsedBody = {};
            }
          }

          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(parsedBody);
            return;
          }

          reject(
            new AppError(
              parsedBody.error?.message || "WhatsApp Graph API request failed",
              response.statusCode || 502
            )
          );
        });
      }
    );

    request.on("error", (error) => {
      reject(new AppError(error.message || "WhatsApp request failed", 502));
    });

    if (body) {
      request.write(body);
    }

    request.end();
  });
}

async function sendTextMessage(toPhoneNumber, body) {
  const { apiVersion, phoneNumberId } = getWhatsappConfig();

  return sendGraphRequest(`/${apiVersion}/${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to: toPhoneNumber,
    type: "text",
    text: { body, preview_url: false },
  });
}

async function sendTemplateMessage(toPhoneNumber, templateName, languageCode, components) {
  const { apiVersion, phoneNumberId } = getWhatsappConfig();

  return sendGraphRequest(`/${apiVersion}/${phoneNumberId}/messages`, {
    messaging_product: "whatsapp",
    to: toPhoneNumber,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode || "en" },
      components: components || [],
    },
  });
}

async function getMediaUrl(mediaId) {
  const { apiVersion } = getWhatsappConfig();
  const result = await sendGraphRequest(`/${apiVersion}/${mediaId}`, null, "GET");

  if (!result.url) {
    throw new AppError("Could not resolve WhatsApp media URL", 502);
  }

  return result.url;
}

function downloadMedia(mediaUrl) {
  const { accessToken } = getWhatsappConfig();

  return new Promise((resolve, reject) => {
    const request = https.request(
      mediaUrl,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      (response) => {
        const chunks = [];

        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new AppError("Failed to download WhatsApp media", response.statusCode || 502));
          return;
        }

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: response.headers["content-type"] || "application/octet-stream",
          });
        });
      }
    );

    request.on("error", (error) => {
      reject(new AppError(error.message || "Failed to download WhatsApp media", 502));
    });

    request.end();
  });
}

function getServiceWindowClosesAt(lastInboundAt) {
  return lastInboundAt ? new Date(new Date(lastInboundAt).getTime() + SERVICE_WINDOW_MS) : null;
}

function isWithinServiceWindow(lastInboundAt, now = new Date()) {
  const closesAt = getServiceWindowClosesAt(lastInboundAt);
  return Boolean(closesAt) && now < closesAt;
}

function verifyWebhookSignature(rawBody, receivedSignatureHeader) {
  if (!env.whatsapp.appSecret) {
    throw new AppError("WhatsApp app secret is not configured on server", 500);
  }

  if (!receivedSignatureHeader) {
    return false;
  }

  const expected =
    "sha256=" + crypto.createHmac("sha256", env.whatsapp.appSecret).update(rawBody).digest("hex");

  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(receivedSignatureHeader);

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

module.exports = {
  sendTextMessage,
  sendTemplateMessage,
  getMediaUrl,
  downloadMedia,
  SERVICE_WINDOW_MS,
  getServiceWindowClosesAt,
  isWithinServiceWindow,
  verifyWebhookSignature,
};
