const test = require("node:test");
const assert = require("node:assert/strict");
const { mockModule } = require("./helpers/mockModule");

process.env.OPENAI_EMBEDDING_MODEL = "test-embed";

const products = [
  { id: "p1", publicId: 1, title: "Wedding Frame", description: "", basePrice: 999, embeddingModel: "test-embed", embeddingUpdatedAt: new Date("2026-09-01") },
  { id: "p2", publicId: 2, title: "Desk Frame", description: "", basePrice: 499, embeddingModel: "test-embed", embeddingUpdatedAt: new Date("2026-09-01") },
];
const vectors = { p1: [1, 0], p2: [0, 1] };
const counts = { vectorReads: 0, embedCalls: 0 };
let embedFails = false;

mockModule("src/prisma/client.js", {
  product: {
    async findMany({ where, select }) {
      if (where.id?.in) {
        counts.vectorReads += 1;
        return where.id.in.map((id) => ({ id, embedding: vectors[id], embeddingUpdatedAt: products.find((p) => p.id === id).embeddingUpdatedAt }));
      }
      assert.equal(select.embedding, undefined, "catalog query never loads vectors");
      return products.map((product) => ({ ...product }));
    },
  },
});
mockModule("src/utils/embeddings.js", {
  async getEmbedding(text) {
    counts.embedCalls += 1;
    if (embedFails) throw new Error("embedding API down");
    return /wedding/i.test(text) ? [1, 0] : [0, 1];
  },
  cosineSimilarity(a, b) {
    return a[0] * b[0] + a[1] * b[1];
  },
});

const { searchProductsByQuery } = require("../src/services/productEmbeddingService");

test("ranks by similarity, reading vectors from the DB only once", async () => {
  const first = await searchProductsByQuery("wedding gift", 1);
  const second = await searchProductsByQuery("desk decor", 1);

  assert.equal(first[0].title, "Wedding Frame");
  assert.equal(second[0].title, "Desk Frame");
  assert.equal(counts.vectorReads, 1, "second search served from the vector cache");
});

test("repeated queries reuse the cached query embedding", async () => {
  const before = counts.embedCalls;

  await searchProductsByQuery("Wedding  Gift", 1);
  await searchProductsByQuery("wedding gift", 1);

  assert.equal(counts.embedCalls - before, 0, "both normalise to an already-cached query");
});

test("an edited product (new embeddingUpdatedAt) is re-read, not served stale", async () => {
  const readsBefore = counts.vectorReads;
  products[0].embeddingUpdatedAt = new Date("2026-09-15");

  await searchProductsByQuery("wedding gift", 1);

  assert.equal(counts.vectorReads - readsBefore, 1);
});

test("falls back to keyword search when the embedding API fails", async () => {
  embedFails = true;
  const original = console.error;
  console.error = () => {};
  try {
    const results = await searchProductsByQuery("brand new query about desk", 5);
    assert.deepEqual(results, []);
    const keyword = await searchProductsByQuery("desk", 5);
    assert.equal(keyword[0].title, "Desk Frame");
  } finally {
    console.error = original;
    embedFails = false;
  }
});
