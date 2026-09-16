const prisma = require("../prisma/client");
const env = require("../config/env");
const { getEmbedding, cosineSimilarity } = require("../utils/embeddings");

// Product rows are always read fresh (prices, titles, active flag can change),
// but without their embedding column: a vector is thousands of floats per
// product, and it only changes when embeddingUpdatedAt does. Vectors are cached
// in-process keyed by that timestamp, so an edited product is re-read
// automatically and nothing stale is ever scored.
const PRODUCT_SELECT = {
  id: true,
  publicId: true,
  title: true,
  description: true,
  basePrice: true,
  imageUrl: true,
  attributes: true,
  embeddingModel: true,
  embeddingUpdatedAt: true,
};
const vectorCache = new Map();

// Embeddings of the same text never change, so repeated searches ("frame for
// mom") skip the embedding API call entirely. Bounded LRU.
const QUERY_CACHE_LIMIT = 500;
const queryEmbeddingCache = new Map();

function buildEmbeddingText(product) {
  const attributeText = Array.isArray(product.attributes)
    ? product.attributes
        .map((attribute) => `${attribute.AttributeName}: ${(attribute.Values || []).join(", ")}`)
        .join("; ")
    : "";

  return [product.title, product.description, attributeText].filter(Boolean).join("\n");
}

function cacheVector(productId, embeddingUpdatedAt, embedding) {
  vectorCache.set(productId, { version: embeddingUpdatedAt ? new Date(embeddingUpdatedAt).getTime() : 0, embedding });
}

async function regenerateEmbedding(productId) {
  const product = await prisma.product.findUnique({ where: { id: productId } });

  if (!product) {
    return null;
  }

  const embedding = await getEmbedding(buildEmbeddingText(product));

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      embedding,
      embeddingModel: env.openai.embeddingModel,
      embeddingUpdatedAt: new Date(),
    },
  });

  cacheVector(updated.id, updated.embeddingUpdatedAt, embedding);
  return updated;
}

function isEmbeddingCurrent(product) {
  return product.embeddingModel === env.openai.embeddingModel && Boolean(product.embeddingUpdatedAt);
}

/**
 * Returns a map of productId -> vector for the given products, reading vectors
 * from the DB only for cache misses and generating any that are missing or
 * were made with a different embedding model.
 */
async function loadVectors(products) {
  const vectors = new Map();
  const toFetch = [];
  const toGenerate = [];

  for (const product of products) {
    if (!isEmbeddingCurrent(product)) {
      toGenerate.push(product);
      continue;
    }

    const cached = vectorCache.get(product.id);

    if (cached && cached.version === new Date(product.embeddingUpdatedAt).getTime()) {
      vectors.set(product.id, cached.embedding);
    } else {
      toFetch.push(product.id);
    }
  }

  if (toFetch.length > 0) {
    const rows = await prisma.product.findMany({
      where: { id: { in: toFetch } },
      select: { id: true, embedding: true, embeddingUpdatedAt: true },
    });

    for (const row of rows) {
      if (Array.isArray(row.embedding)) {
        cacheVector(row.id, row.embeddingUpdatedAt, row.embedding);
        vectors.set(row.id, row.embedding);
      }
    }
  }

  for (const product of toGenerate) {
    try {
      const embedding = await getEmbedding(buildEmbeddingText(product));
      const embeddingUpdatedAt = new Date();

      await prisma.product.update({
        where: { id: product.id },
        data: { embedding, embeddingModel: env.openai.embeddingModel, embeddingUpdatedAt },
      });

      cacheVector(product.id, embeddingUpdatedAt, embedding);
      vectors.set(product.id, embedding);
    } catch (error) {
      console.error(`Failed to generate embedding for product ${product.id}:`, error.message);
    }
  }

  return vectors;
}

async function getQueryEmbedding(query) {
  const key = `${env.openai.embeddingModel}:${query.toLowerCase().replace(/\s+/g, " ")}`;
  const cached = queryEmbeddingCache.get(key);

  if (cached) {
    // Refresh recency for LRU eviction.
    queryEmbeddingCache.delete(key);
    queryEmbeddingCache.set(key, cached);
    return cached;
  }

  const embedding = await getEmbedding(query);
  queryEmbeddingCache.set(key, embedding);

  if (queryEmbeddingCache.size > QUERY_CACHE_LIMIT) {
    queryEmbeddingCache.delete(queryEmbeddingCache.keys().next().value);
  }

  return embedding;
}

function keywordSearch(products, query, limit) {
  const needle = query.toLowerCase();

  return products
    .filter(
      (product) =>
        (product.title || "").toLowerCase().includes(needle) ||
        (product.description || "").toLowerCase().includes(needle)
    )
    .slice(0, limit);
}

async function searchProductsByQuery(query, limit = 5) {
  const products = await prisma.product.findMany({ where: { isActive: true }, select: PRODUCT_SELECT });

  if (products.length === 0) {
    return [];
  }

  const trimmedQuery = (query || "").trim();

  if (!trimmedQuery) {
    return products.slice(0, limit);
  }

  try {
    const [vectors, queryEmbedding] = await Promise.all([loadVectors(products), getQueryEmbedding(trimmedQuery)]);

    const scored = products
      .filter((product) => vectors.has(product.id))
      .map((product) => ({ product, score: cosineSimilarity(queryEmbedding, vectors.get(product.id)) }))
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      return scored.slice(0, limit).map((entry) => entry.product);
    }
  } catch (error) {
    console.error("Embedding-based product search failed, falling back to keyword match:", error.message);
  }

  return keywordSearch(products, trimmedQuery, limit);
}

module.exports = {
  buildEmbeddingText,
  regenerateEmbedding,
  searchProductsByQuery,
};
