const crypto = require("crypto");
const https = require("https");
const env = require("../config/env");
const AppError = require("./appError");

const RAZORPAY_API_HOST = "api.razorpay.com";

function getRazorpayConfig() {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) {
    throw new AppError("Razorpay is not configured on server", 500);
  }

  return env.razorpay;
}

function sendRazorpayRequest(path, payload) {
  const { keyId, keySecret } = getRazorpayConfig();
  const authToken = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const body = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: RAZORPAY_API_HOST,
        path,
        method: "POST",
        headers: {
          Authorization: `Basic ${authToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
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
              parsedBody.error?.description || "Failed to create Razorpay order",
              response.statusCode || 502
            )
          );
        });
      }
    );

    request.on("error", (error) => {
      reject(new AppError(error.message || "Razorpay request failed", 502));
    });

    request.write(body);
    request.end();
  });
}

async function createRazorpayOrder({ amountInPaise, receipt, notes }) {
  return sendRazorpayRequest("/v1/orders", {
    amount: amountInPaise,
    currency: env.razorpay.currency,
    receipt,
    notes,
  });
}

function createHmacSignature(payload, secret) {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function verifyRazorpayPaymentSignature({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
}) {
  const { keySecret } = getRazorpayConfig();
  const expectedSignature = createHmacSignature(
    `${razorpayOrderId}|${razorpayPaymentId}`,
    keySecret
  );

  return expectedSignature === razorpaySignature;
}

function verifyRazorpayWebhookSignature(rawBody, receivedSignature) {
  if (!env.razorpay.webhookSecret) {
    throw new AppError("Razorpay webhook secret is not configured on server", 500);
  }

  const expectedSignature = createHmacSignature(rawBody, env.razorpay.webhookSecret);
  return expectedSignature === receivedSignature;
}

module.exports = {
  createRazorpayOrder,
  getRazorpayConfig,
  verifyRazorpayPaymentSignature,
  verifyRazorpayWebhookSignature,
};
