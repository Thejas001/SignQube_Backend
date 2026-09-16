const { getOpenAiClient } = require("./openai");
const env = require("../config/env");

async function getEmbedding(text) {
  const client = getOpenAiClient();
  const response = await client.embeddings.create({
    model: env.openai.embeddingModel,
    input: text,
  });

  return response.data[0].embedding;
}

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

module.exports = {
  getEmbedding,
  cosineSimilarity,
};
