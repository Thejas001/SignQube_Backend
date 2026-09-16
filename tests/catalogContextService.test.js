process.env.AGENT_INLINE_CATALOG_MAX_CHARS = "120";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mockModule } = require("./helpers/mockModule");

let rows = [];
let queries = 0;
mockModule("src/prisma/client.js", {
  product: {
    async findMany({ select }) {
      queries += 1;
      assert.equal(select.embedding, undefined, "never loads vectors");
      return rows;
    },
  },
});

const { getCatalogContext, invalidateCatalogContext } = require("../src/services/catalogContextService");

test.beforeEach(() => {
  invalidateCatalogContext();
  queries = 0;
});

test("a small catalog is inlined as a compact list", async () => {
  rows = [
    { publicId: 1, title: "Test", description: null, basePrice: 250 },
    { publicId: 3, title: "Premium Print", description: "HD\nscratch-proof", basePrice: "499.00" },
  ];

  const catalog = await getCatalogContext();

  assert.equal(catalog.inline, true);
  assert.equal(catalog.text, "#1 Test Rs.250; #3 Premium Print Rs.499 (HD scratch-proof)");
  assert.deepEqual(catalog.products.map((product) => product.productId), [1, 3]);
});

test("a catalog over the size budget falls back to search", async () => {
  rows = Array.from({ length: 10 }, (_, index) => ({ publicId: index + 1, title: "Frame " + (index + 1), description: "x".repeat(40), basePrice: 100 }));

  const catalog = await getCatalogContext();

  assert.equal(catalog.inline, false);
  assert.equal(catalog.products.length, 10, "products are still available for validation");
});

test("results are cached until a product changes", async () => {
  rows = [{ publicId: 1, title: "Test", description: null, basePrice: 250 }];

  await getCatalogContext();
  await getCatalogContext();
  assert.equal(queries, 1);

  rows = [{ publicId: 1, title: "Test", description: null, basePrice: 300 }];
  invalidateCatalogContext();
  assert.ok((await getCatalogContext()).text.includes("Rs.300"));
  assert.equal(queries, 2);
});
