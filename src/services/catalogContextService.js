const prisma = require("../prisma/client");
const env = require("../config/env");

// A small catalog is cheaper to hand the model outright than to search: the
// compact list costs a few dozen tokens per call, while a search costs a whole
// extra model call (the model must read the results before it can answer).
// Past the size budget the list would cost more than it saves, so the agent
// falls back to search_products.
const DESCRIPTION_CHARS = 70;
const CACHE_TTL_MS = 60 * 1000;

let cached = null;
let cachedAt = 0;

function clip(text, maxChars) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean.length > maxChars ? `${clean.slice(0, maxChars).trimEnd()}...` : clean;
}

function formatProduct(product) {
  const description = clip(product.description, DESCRIPTION_CHARS);
  return `#${product.publicId} ${product.title} Rs.${Number(product.basePrice)}${description ? ` (${description})` : ""}`;
}

/**
 * The active catalog as the model sees it. `inline` is false when the list
 * would exceed the size budget (AGENT_INLINE_CATALOG_MAX_CHARS); `products`
 * is always filled so tools can validate product ids against it.
 */
async function getCatalogContext() {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return cached;
  }

  const rows = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: { publicId: "asc" },
    select: { publicId: true, title: true, description: true, basePrice: true },
  });

  const text = rows.map(formatProduct).join("; ");

  cached = {
    inline: rows.length > 0 && text.length <= env.agent.inlineCatalogMaxChars,
    text,
    products: rows.map((row) => ({ productId: row.publicId, title: row.title, basePrice: Number(row.basePrice) })),
  };
  cachedAt = Date.now();

  return cached;
}

// Called when an admin creates or edits a product, so this process never
// quotes a stale price; other processes pick changes up within the TTL.
function invalidateCatalogContext() {
  cached = null;
  cachedAt = 0;
}

module.exports = {
  getCatalogContext,
  invalidateCatalogContext,
};
