'use strict';

/**
 * The Express app.
 *
 * Order matters here: the Razorpay webhook needs the RAW body to verify its
 * signature, so it is mounted with express.raw() BEFORE express.json().
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const routes = require('./routes');
const paymentRoutes = require('./routes/paymentRoutes');
const openapiSpec = require('./docs/openapi');

const requestLogger = require('./middlewares/requestLogger');
const errorHandler = require('./middlewares/errorHandler');
const notFound = require('./middlewares/notFound');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  // Swagger UI needs inline styles and its own assets.
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

app.use(
  cors({
    origin(origin, callback) {
      // Same-origin and tools with no Origin header are allowed through.
      if (!origin) return callback(null, true);
      if (env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin ${origin} is not allowed`));
    },
    credentials: true,
  }),
);

app.use(requestLogger);
app.use(cookieParser());

// ---------------------------------------------------------------------------
// The webhook, with the raw body, BEFORE express.json().
// ---------------------------------------------------------------------------
app.use(
  '/api/payments',
  express.raw({ type: 'application/json', limit: '1mb' }),
  paymentRoutes,
);

// ---------------------------------------------------------------------------
// Everything else: parsed JSON.
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use(
  '/docs',
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec, {
    customSiteTitle: 'SIGNQUE API',
    swaggerOptions: { persistAuthorization: true, docExpansion: 'none' },
  }),
);
app.get('/docs.json', (req, res) => res.json(openapiSpec));

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
