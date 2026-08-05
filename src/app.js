const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const corsOptions = require("./config/cors");
const routes = require("./routes");
const docsRoutes = require("./routes/docsRoutes");
const adminPageRoutes = require("./routes/adminPageRoutes");
const paymentController = require("./controllers/paymentController");
const notFound = require("./middlewares/notFound");
const errorHandler = require("./middlewares/errorHandler");

const app = express();

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many authentication attempts. Please try again later.",
    data: null,
    error: null,
  },
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
        "style-src": ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
        "img-src": ["'self'", "data:", "cdn.jsdelivr.net"],
      },
    },
  })
);
app.use(cors(corsOptions));
app.use(morgan("dev"));
app.post(
  "/api/payments/razorpay/webhook",
  express.raw({ type: "application/json" }),
  paymentController.handleRazorpayWebhook
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.get("/", (req, res) => {
  res.redirect("/admin");
});

app.use("/api/auth", authRateLimiter);
app.use("/docs", docsRoutes);
app.use("/admin", adminPageRoutes);
app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
