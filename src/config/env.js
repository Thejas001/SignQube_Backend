const dotenv = require("dotenv");

dotenv.config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 5000),
  databaseUrl: process.env.DATABASE_URL,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || "1d",
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "7d",
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  shippingFee: Number(process.env.SHIPPING_FEE || 0),
  uploadMaxFileSize: Number(process.env.UPLOAD_MAX_FILE_SIZE || 5 * 1024 * 1024),
  adminUsername: process.env.ADMIN_USERNAME || "admin@signqube.com",
  adminPassword: process.env.ADMIN_PASSWORD || "admin123",
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
    currency: process.env.RAZORPAY_CURRENCY || "INR",
    companyName: process.env.RAZORPAY_COMPANY_NAME || "SIGNQUE",
    paymentLinkExpiryMinutes: Number(process.env.RAZORPAY_PAYMENT_LINK_EXPIRY_MINUTES || 1440),
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || "ap-south-1",
    bucketName: process.env.AWS_BUCKET_NAME || "sign-qube-test-v1",
  },
  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    apiVersion: process.env.WHATSAPP_API_VERSION || "v21.0",
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    templateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
    paymentConfirmedTemplate: process.env.WHATSAPP_PAYMENT_CONFIRMED_TEMPLATE || null,
    reengagementTemplate: process.env.WHATSAPP_REENGAGEMENT_TEMPLATE || null,
  },
  agent: {
    // Catalogs whose compact product list fits in this many characters
    // (~4 chars per token) are given to the model directly instead of searched.
    inlineCatalogMaxChars: Number(process.env.AGENT_INLINE_CATALOG_MAX_CHARS || 1200),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
    reasoningEffort: process.env.OPENAI_REASONING_EFFORT || undefined,
    maxHistoryMessages: Number(process.env.OPENAI_MAX_HISTORY_MESSAGES || 12),
    maxTokens: Number(process.env.OPENAI_MAX_TOKENS || 500),
    temperature: process.env.OPENAI_TEMPERATURE ? Number(process.env.OPENAI_TEMPERATURE) : undefined,
    // A reply should never hang a conversation: fail fast and let the bounded
    // retries (429/5xx/connection errors only) and the fallback message handle it.
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 30000),
    maxRetries: Number(process.env.OPENAI_MAX_RETRIES || 2),
  },
};

module.exports = env;
