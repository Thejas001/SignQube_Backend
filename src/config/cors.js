const env = require("./env");

const allowedOrigins = new Set([
  env.clientUrl,
  "http://localhost:5000",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
]);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(new Error("CORS policy does not allow this origin"));
  },
  credentials: true,
};

module.exports = corsOptions;
