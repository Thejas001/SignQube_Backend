const OpenAI = require("openai");
const env = require("../config/env");

let client = null;

if (env.openai.apiKey) {
  client = new OpenAI({
    apiKey: env.openai.apiKey,
    baseURL: env.openai.baseURL,
    // SDK defaults are a 10-minute timeout with 2 retries, long enough to stall
    // a customer's conversation queue. Retries only fire before a response is
    // received, so they never re-run tool calls.
    timeout: env.openai.timeoutMs,
    maxRetries: env.openai.maxRetries,
  });
}

function getOpenAiClient() {
  if (!client) {
    throw new Error("OpenAI is not configured. Check OPENAI_API_KEY.");
  }

  return client;
}

module.exports = {
  getOpenAiClient,
};
