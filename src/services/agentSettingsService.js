const prisma = require("../prisma/client");

const SETTINGS_ID = "default";
const CACHE_TTL_MS = 30 * 1000;

// Business context changes rarely (only when an admin edits Agent Settings)
// and is read on every single inbound message, so it's worth a short-lived
// in-process cache to avoid a DB round trip per turn. updateAgentSettings
// refreshes the cache immediately so admin edits are never stale for 30s.
let cachedSettings = null;
let cacheExpiresAt = 0;

async function getAgentSettings() {
  if (cachedSettings && Date.now() < cacheExpiresAt) {
    return cachedSettings;
  }

  let settings = await prisma.agentSettings.findUnique({
    where: { id: SETTINGS_ID },
  });

  if (!settings) {
    settings = await prisma.agentSettings.create({
      data: { id: SETTINGS_ID },
    });
  }

  cachedSettings = settings;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;

  return settings;
}

async function updateAgentSettings(payload) {
  const settings = await prisma.agentSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      ...payload,
    },
    update: payload,
  });

  cachedSettings = settings;
  cacheExpiresAt = Date.now() + CACHE_TTL_MS;

  return settings;
}

module.exports = {
  getAgentSettings,
  updateAgentSettings,
};
