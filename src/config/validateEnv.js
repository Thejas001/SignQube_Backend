const env = require("./env");

const requiredKeys = [
  "databaseUrl",
  "jwtAccessSecret",
  "jwtRefreshSecret",
];

function validateEnv() {
  const missing = requiredKeys.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

module.exports = validateEnv;
