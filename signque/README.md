# SIGNQUE — order-to-print production system

An order management system for SIGNQUE, an Indian store selling custom acrylic
photo frames. A customer orders online and pays; the order then moves through
admin review, design, customer approval of the design, and print production.
When printing is done the customer is told the order is complete.

One backend (Node + Express + PostgreSQL via Prisma) and one React app with four
role areas: **customer storefront**, **admin panel**, **designer panel** and
**printing panel**. The signed-in user's role decides which area they can open.

---

## Contents

- [Quick start](#quick-start)
- [The order workflow](#the-order-workflow)
- [Architecture](#architecture)
- [The API](#the-api)
- [Database](#database)
- [Security](#security)
- [Notifications](#notifications)
- [Tests](#tests)
- [Environment variables](#environment-variables)
- [Troubleshooting](#troubleshooting)

---

## Quick start

You need **Node 20+** and either Docker or a local **PostgreSQL 16+**.

### 1. The database

With Docker:

```bash
docker compose up -d db
```

That starts `postgres:16-alpine` on port 5432 with a named volume, as user
`signque` / password `password` / database `signque`.

Using a PostgreSQL you already run instead? Create the two databases and point
`DATABASE_URL` at the first one:

```bash
createdb signque && createdb signque_test
```

### 2. The API

```bash
cd signque
```

```bash
cp .env.example .env
```

Fill in `.env` (see [Environment variables](#environment-variables) — every one
is validated at startup, and the process exits with a readable message if any is
missing or invalid). Then:

```bash
npm install
```

```bash
npx prisma migrate dev
```

```bash
npm run seed
```

```bash
npm run dev
```

The API is on <http://localhost:4000>, with interactive docs at
<http://localhost:4000/docs>.

### 3. The web app

```bash
cd signque/web
```

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:5173>. Vite proxies `/api` to the backend, so no CORS
setup is needed in development.

### 4. Sign in

The seed creates one account per role, four products, and one sample order
sitting at each of `PLACED`, `DESIGN_SUBMITTED`, `AWAITING_CUSTOMER_APPROVAL`
and `PRINTING`, so every panel has something to show. The login page has a
button for each.

| Role | Email | Password |
|---|---|---|
| Admin | `admin@signque.in` | `Admin@123` |
| Designer | `designer1@signque.in` | `Designer@123` |
| Designer | `designer2@signque.in` | `Designer@123` |
| Printing | `printer1@signque.in` | `Printer@123` |
| Customer | `customer@signque.in` | `Customer@123` |

> The seeded photos and designs are placeholder images with no S3 object behind
> them. Real uploads go to S3 and are served through pre-signed URLs.

### Running everything in Docker

```bash
docker compose up --build
```

This starts PostgreSQL and the API together; the API container runs
`prisma migrate deploy` before it starts listening.

---

## The order workflow

### The steps

1. **Order and payment.** The customer picks a product, uploads a photo and an
   address, and places the order. It is created as `PENDING_PAYMENT` and they
   pay through Razorpay Checkout.
   - Payment captured, confirmed by the webhook → `PLACED`, and the admins are
     notified.
   - Payment failed → `PAYMENT_FAILED`. The customer can retry, which takes the
     order back to `PENDING_PAYMENT` with a fresh Razorpay order.
2. **Admin review.** The admin opens the order and checks the photo.
   - Approve and pick a designer → `DESIGN_ASSIGNED`, designer notified.
   - Reject with a reason → `REJECTED`, a full refund is started, customer
     notified.
3. **Designer takes the job** → `DESIGN_IN_PROGRESS`.
4. **Designer submits.** A design file (PNG, JPG or PDF, max 25 MB) with an
   optional note. This creates a new `DesignVersion` with the next version
   number, the order moves to `DESIGN_SUBMITTED`, and the admins are notified.
5. **Admin checks the design.**
   - Approve → `AWAITING_CUSTOMER_APPROVAL`; the version becomes
     `SENT_TO_CUSTOMER`, which is what makes it visible to the customer.
   - Send back with notes (required) → `DESIGN_IN_PROGRESS`; the version is
     marked `ADMIN_REJECTED` and the customer never sees it.
6. **Customer reviews the design.**
   - Approve → `CUSTOMER_APPROVED`, admins notified.
   - Request changes with a comment (required) → `DESIGN_IN_PROGRESS`; the
     designer and the admins are notified.
   - Up to `MAX_FREE_REVISIONS` (default 3) change requests. After that the
     button is hidden and the customer sees *Contact support for more changes*.
7. **Admin sets the print spec and assigns a printing user** → `PRINT_ASSIGNED`.
   The spec is material colour (`WHITE` | `BLACK`), thickness in mm
   (`2|3|4|5|6|8`) and size (`A1|A2|A3|A4`).
8. **Printing user takes the job** → `PRINTING`, and works through the
   production stages `CUTTING` → `PRINTING` → `QUALITY_CHECK`. A failed quality
   check can go back to `CUTTING` or `PRINTING`. The order status stays
   `PRINTING` throughout.
9. **Printing user marks it done.** Only allowed from stage `QUALITY_CHECK`.
   The order moves to `PRINT_COMPLETED`.
10. **The system completes the order.** In the same request, `PRINT_COMPLETED` →
    `COMPLETED`, and the customer is told the order is complete.

At any non-final status the admin can cancel with a reason → `CANCELLED`, and a
paid order is refunded. The admin can also reassign the designer (at
`DESIGN_ASSIGNED` or `DESIGN_IN_PROGRESS`) and the printing user (at
`PRINT_ASSIGNED` or `PRINTING`); that does not change the status, but it does
write a history row.

Final statuses: `COMPLETED`, `REJECTED`, `CANCELLED`.

### Flowchart

```mermaid
flowchart TD
  A([Customer places order]) --> B[Pays via Razorpay]
  B --> C{Payment captured?}
  C -- No --> C1[PAYMENT_FAILED] --> B
  C -- Yes --> D[PLACED]
  D --> E{Admin reviews}
  E -- Reject --> E1[REJECTED + refund] --> Z1([End])
  E -- Approve --> F[Admin assigns designer]
  F --> G[Designer takes job]
  G --> H[Designer submits design]
  H --> I{Admin checks design}
  I -- Send back --> G
  I -- Approve --> J[Customer reviews design]
  J -- Request changes --> G
  J -- Approve --> K[Admin sets colour / thickness / size]
  K --> L[Admin assigns printing user]
  L --> M[Printer takes job]
  M --> N[Cutting → Printing → Quality check]
  N -- QC fails --> N
  N -- QC passes --> O[Printer marks complete]
  O --> P[COMPLETED, customer notified] --> Z2([End])
```

### The transition table

Every allowed status change lives in exactly one place,
[`src/services/workflow/transitions.js`](src/services/workflow/transitions.js).
Nothing else in the codebase decides what may follow what.

| From | To | By |
|---|---|---|
| `PENDING_PAYMENT` | `PLACED`, `PAYMENT_FAILED` | SYSTEM |
| `PENDING_PAYMENT` | `CANCELLED` | ADMIN |
| `PAYMENT_FAILED` | `PENDING_PAYMENT` | CUSTOMER |
| `PAYMENT_FAILED` | `CANCELLED` | ADMIN |
| `PLACED` | `DESIGN_ASSIGNED`, `REJECTED`, `CANCELLED` | ADMIN |
| `DESIGN_ASSIGNED` | `DESIGN_IN_PROGRESS` | DESIGNER |
| `DESIGN_ASSIGNED` | `CANCELLED` | ADMIN |
| `DESIGN_IN_PROGRESS` | `DESIGN_SUBMITTED` | DESIGNER |
| `DESIGN_IN_PROGRESS` | `CANCELLED` | ADMIN |
| `DESIGN_SUBMITTED` | `AWAITING_CUSTOMER_APPROVAL`, `DESIGN_IN_PROGRESS`, `CANCELLED` | ADMIN |
| `AWAITING_CUSTOMER_APPROVAL` | `CUSTOMER_APPROVED`, `DESIGN_IN_PROGRESS` | CUSTOMER |
| `AWAITING_CUSTOMER_APPROVAL` | `CANCELLED` | ADMIN |
| `CUSTOMER_APPROVED` | `PRINT_ASSIGNED`, `CANCELLED` | ADMIN |
| `PRINT_ASSIGNED` | `PRINTING` | PRINTER |
| `PRINT_ASSIGNED` | `CANCELLED` | ADMIN |
| `PRINTING` | `PRINT_COMPLETED` | PRINTER |
| `PRINTING` | `CANCELLED` | ADMIN |
| `PRINT_COMPLETED` | `COMPLETED` | SYSTEM |
| `COMPLETED`, `REJECTED`, `CANCELLED` | — | — |

### The rules the engine guarantees

Every status change goes through
`orderWorkflowService.transition({ orderId, to, actor, note, extra })`. No other
code writes `Order.status`.

- **Invalid transitions** — a move that is not in the table, or one attempted by
  the wrong role — return `409 INVALID_TRANSITION`.
- **Ownership.** A designer can only act on orders where
  `assignedDesignerId = me`, a printing user where `assignedPrinterId = me`, a
  customer on their own orders. Anything else is `403`. The check runs before
  the write *and* as an extra `WHERE` clause on it.
- **Atomic claim.** Every transition is a conditional update, so two clicks or
  two users can never both succeed:

  ```js
  const { count } = await tx.order.updateMany({
    where: { id: orderId, status: fromStatus, assignedDesignerId: actor.id },
    data:  { status: to, updatedAt: new Date() },
  });
  if (count === 0) throw new ConflictError('Order was changed by someone else. Refresh and try again.');
  ```

  The loser gets `409`, and the UI shows *This order was updated by someone
  else. Refreshed.*
- **One transaction per transition.** The status update, the
  `OrderStatusHistory` row and any related rows (design version, review, print
  job, payment) are written in a single `prisma.$transaction`. If a related
  write fails, the status change rolls back with it.
- **Side effects run after commit.** Notifications, emails and Razorpay refunds
  only run once the transaction has committed, and a failure there is logged and
  swallowed — a failing email can never undo a status change.
- **Server-side prices.** Totals are always recomputed from `Product.basePrice`
  as `subtotal + SHIPPING_FEE`. A price sent by a client is ignored. The maths is
  done in integer paise, so no float rounding can creep into a total.
- **Idempotent webhook.** The Razorpay webhook verifies its signature against
  the **raw** body, stores `razorpayEventId` under a unique constraint so a
  redelivered event is a no-op, and refuses to move a payment that is already in
  a final state.
- **Customer visibility.** A customer only ever sees design versions that are
  `SENT_TO_CUSTOMER` or later. Versions the admin rejected are never returned to
  them.

---

## Architecture

Strict layers: each one calls only the layer directly below it.

```
src/
  server.js              boot: validate env, connect to the DB, start listening
  app.js                 express app: raw-body webhook BEFORE express.json(), then /docs, /api
  config/                env.js (Zod-validated env), constants.js
  routes/                URL → controller only, one file per area
  controllers/           read req → call ONE service method → return utils/apiResponse
  validators/            Zod schemas per endpoint
  middlewares/           authenticate, requireRole, validate, rateLimit,
                         upload, errorHandler, notFound, requestLogger
  services/              the business rules
    workflow/            transitions.js, orderWorkflowService.js
    orderService.js      order creation, totals, customer views, admin review
    designService.js     versions, admin and customer reviews, the revision limit
    printService.js      the print spec, print jobs, stages, completion
    paymentService.js    Razorpay order, verification, webhook, refunds
    notificationService.js
    userService.js, productService.js, authService.js, uploadService.js,
    addressService.js, customizationService.js
  repositories/          ALL Prisma calls, one file per aggregate. Every function
                         takes an optional `tx` so services can compose transactions.
  integrations/          razorpayClient, s3Client, mailClient, smsClient (stub)
  utils/                 apiResponse, errors, price, orderNumber, logger, asyncHandler
  docs/                  the OpenAPI spec
prisma/                  schema.prisma, migrations/, seed.js
tests/                   unit/, integration/, helpers/
web/                     React 18 + Vite + Tailwind + TanStack Query
```

The rules:

- Controllers never import Prisma or a repository.
- Services never touch `req` or `res`.
- Repositories hold no business rules.
- Every response has the shape
  `{ success: boolean, message: string, data: any | null, error: { code, details } | null }`.
- Errors are thrown as `AppError` subclasses and turned into responses in
  exactly one place, `middlewares/errorHandler.js`.

### The frontend

One Vite app, four role areas, routed by the signed-in user's role:

| Area | Routes |
|---|---|
| Customer | `/`, `/products/:id`, `/checkout`, `/orders`, `/orders/:id` |
| Admin | `/admin`, `/admin/orders`, `/admin/orders/:id`, `/admin/users`, `/admin/products` |
| Designer | `/designer`, `/designer/jobs/:orderId` |
| Printing | `/printer`, `/printer/jobs/:orderId` |

Everything is built on TanStack Query and refetches after every action. A `409`
is caught and shown as *This order was updated by someone else. Refreshed.* The
layout is responsive down to phone width.

The admin order page has a **context-aware action panel**: it reads
`availableActions` from the API — which the workflow engine derives from the
transition table — and shows only what is allowed at the current status. The
customer order page has the six-step progress tracker (Order placed → In review
→ Designing → Your approval → Printing → Completed) plus the full history.

---

## The API

Interactive documentation, with every endpoint, role and schema, is at
**<http://localhost:4000/docs>** (the raw spec is at `/docs.json`).

Everything is under `/api` and needs `authenticate` unless marked public.

### Auth — public, 20 requests per 15 minutes

`POST /auth/register` · `POST /auth/login` · `POST /auth/refresh` ·
`POST /auth/logout` · `GET /auth/me`

### Products — public

`GET /products` (active only) · `GET /products/:id`

### Customer

`POST /uploads/photo` · `POST /customizations` ·
`GET|POST|PATCH|DELETE /addresses` · `POST /orders` ·
`POST /orders/:id/verify-payment` · `POST /orders/:id/retry-payment` ·
`GET /orders/mine` · `GET /orders/:id` · `GET /orders/:id/design` ·
`POST /orders/:id/design/approve` · `POST /orders/:id/design/request-changes`

### Admin

`GET /admin/dashboard` · `GET /admin/orders` · `GET /admin/orders/:id` ·
`POST /admin/orders/:id/approve` · `POST /admin/orders/:id/reject` ·
`POST /admin/orders/:id/cancel` · `POST /admin/orders/:id/reassign-designer` ·
`POST /admin/orders/:id/design/approve` ·
`POST /admin/orders/:id/design/send-back` · `POST /admin/orders/:id/print-job` ·
`POST /admin/orders/:id/reassign-printer` · `GET|POST|PATCH /admin/users` ·
`GET|POST|PATCH /admin/products` · `GET /admin/print-options`

`GET /admin/users?role=DESIGNER|PRINTER` returns each user with their count of
open jobs, for the assignment dropdowns.

### Designer

`GET /designer/jobs` · `GET /designer/jobs/:orderId` ·
`POST /designer/jobs/:orderId/take` · `POST /designer/jobs/:orderId/submit`

### Printing user

`GET /printer/jobs` · `GET /printer/jobs/:orderId` ·
`POST /printer/jobs/:orderId/take` · `PATCH /printer/jobs/:orderId/stage` ·
`POST /printer/jobs/:orderId/complete`

### Notifications — any authenticated user

`GET /notifications` · `PATCH /notifications/:id/read` ·
`PATCH /notifications/read-all`

### Payments

`POST /payments/razorpay/webhook` — public, raw body, signature verified. It
handles `payment.captured` and `order.paid` (→ `PLACED`), `payment.failed`
(→ `PAYMENT_FAILED`) and `refund.processed`.

---

## Database

PostgreSQL through Prisma. Prisma enums for every fixed set of values, so
Postgres enforces them and Zod validates the same lists at the API.

Tables: `users`, `refresh_tokens`, `products`, `addresses`, `customizations`,
`orders`, `order_items`, `payments`, `payment_events`, `design_versions`,
`design_reviews`, `print_jobs`, `order_status_history`, `notifications`.

Conventions:

- `Int @id @default(autoincrement())` primary keys; snake_case tables and
  columns via `@@map` / `@map`.
- `@db.Decimal(10, 2)` for money, `DateTime @db.Timestamptz(3)` for timestamps,
  `Json` (jsonb) for raw webhook payloads.
- `Order` points at `User` three times (`customer`, `assignedDesigner`,
  `assignedPrinter`), so those relations are named explicitly and use
  `onDelete: Restrict`. Users and products are soft-deleted via `isActive`.
- Public order numbers look like `SQ-2026-000123` and are drawn from a Postgres
  sequence (`order_number_seq`), so two concurrent orders can never collide.

### CHECK constraints

Thickness is a number, so it cannot be a Prisma enum. These are hand-written at
the end of the first migration:

- `print_jobs.thickness_mm IN (2,3,4,5,6,8)`
- `orders.total >= 0`, `orders.subtotal >= 0`, `orders.shipping_fee >= 0`,
  `orders.customer_revision_count >= 0`
- `order_items.quantity > 0`, `order_items.unit_price >= 0`,
  `order_items.line_total >= 0`
- `payments.amount >= 0`
- `design_versions.version_no > 0`

To add more, use `npx prisma migrate dev --create-only`, append the
`ALTER TABLE … ADD CONSTRAINT … CHECK (…)` statements, then `npx prisma migrate dev`.

### Indexes

`Order(status)`, `Order(customerId, createdAt)`,
`Order(assignedDesignerId, status)`, `Order(assignedPrinterId, status)`,
`OrderStatusHistory(orderId, createdAt)`, `DesignVersion(orderId)`,
`Notification(userId, isRead)`.

---

## Security

- **Passwords** — bcrypt, cost 12, minimum length 8.
- **Tokens** — a 15-minute JWT access token in the `Authorization: Bearer`
  header, and a 7-day refresh token in an httpOnly, `sameSite` cookie. Refresh
  tokens are stored **hashed** (SHA-256) and **rotated on every refresh**;
  presenting one that has already been rotated is treated as a leak and revokes
  every token for that user.
- **Deactivation takes effect immediately** — every request re-reads the user,
  so a deactivated account stops working at once rather than when its token
  expires.
- **`requireRole`** sits on every non-public route, and ownership is checked
  again in the service layer.
- **Uploads** — both the MIME type and the file extension are checked, in multer
  and again in `uploadService`. Photos: jpg/png/heic, max 15 MB. Designs:
  png/jpg/pdf, max 25 MB. S3 keys are random
  (`photos/{userId}/{uuid}.jpg`, `designs/{orderId}/v{n}-{uuid}.png`), the bucket
  stays private, and files are served only through **pre-signed GET URLs valid
  for 10 minutes**.
- **Rate limits** — auth 20 per 15 min, uploads 30 per 15 min, the rest of the
  API 600 per 15 min.
- **Input limits** — a 1 MB JSON body cap, page sizes capped at 100, and Zod
  length limits on every free-text field.
- **helmet**, and a strict CORS origin allow-list from `CORS_ORIGINS`.
- **Logs** — passwords, tokens, signatures, cookies and full payment payloads
  are redacted before anything is written.

---

## Notifications

Every event writes a row to `notifications` (shown in the in-app bell) and sends
an email; SMS goes through a console stub behind an interface, so swapping in a
real gateway touches one file.

| Event | Who | Message |
|---|---|---|
| Order paid | All admins | New order SQ-… is waiting for review |
| Order paid | Customer | We received your order SQ-… |
| Designer assigned | Designer | New design job SQ-… |
| Design submitted | Admins | Design v{n} for SQ-… is ready to check |
| Admin sends design back | Designer | Changes needed on SQ-…: {note} |
| Design sent to customer | Customer | Your design is ready. Please review and approve. |
| Customer requests changes | Designer and admins | Customer asked for changes on SQ-…: {comment} |
| Customer approves | Admins | SQ-… design approved. Assign for printing. |
| Print assigned | Printing user | New print job SQ-… ({colour}, {thickness} mm, {size}) |
| Order completed | Customer | Your order SQ-… is complete |
| Rejected or cancelled | Customer | Your order SQ-… was {rejected/cancelled}: {reason}. A refund has been started. |

Email templates are plain HTML in
[`src/integrations/mail/templates/`](src/integrations/mail/templates), each
carrying the order number, a status line and a link to the right page for that
recipient's role.

---

## Tests

Jest and Supertest, run serially against a **separate** PostgreSQL database
(`DATABASE_URL` in `.env.test`, which is git-ignored — copy `.env.test.example`
to `.env.test` and fill in your local Postgres credentials). Only S3, Razorpay's
network calls and SMTP are mocked — Express, Prisma, the transactions and the CHECK constraints are all
real, so the tests exercise the behaviour that actually matters.

```bash
cd signque
```

```bash
npm test
```

Set the test database up once with:

```bash
cd signque && cross-env DATABASE_URL="postgresql://USER:PASS@localhost:5432/signque_test?schema=public" npx prisma migrate deploy
```

> `tests/helpers/db.js` refuses to run against any database whose name does not
> end in `_test`, because it truncates every table.

What is covered — **451 tests**:

- **The workflow engine.** Every allowed transition succeeds with the right
  role; every one of the 100+ moves *not* in the table is refused with 409; every
  wrong-role combination is refused; a wrong assignee gets 403; two simultaneous
  "take"s leave exactly one winner; a history row is written on every transition;
  a failed related write rolls the status back; notifications are not sent when
  the transaction fails, and a failing notification does not undo a committed
  change.
- **Prices** — the maths, the shipping fee, and that a price sent by the client
  is ignored.
- **The revision limit** — allowed below the limit, refused at it, and two
  simultaneous requests still only count one.
- **Print spec validation** — rejects `7` mm, `A5` and `RED`, at both the Zod
  schema and the service.
- **Completion** — blocked unless the stage is `QUALITY_CHECK`, and the stage
  machine including a failed quality check.
- **Integration** — the full happy path from register to `COMPLETED`, a design
  send-back loop, a customer change-request loop (including hitting the limit),
  reject with a refund, payment failure and retry, auth and token rotation, the
  role guards, and the webhook: a real HMAC, a rejected signature, a tampered
  body, and a redelivered event proving the no-op.

---

## Environment variables

All of these are validated with Zod at startup.

| Variable | Notes |
|---|---|
| `NODE_ENV` | `development` \| `test` \| `production` |
| `PORT` | default `4000` |
| `DATABASE_URL` | `postgresql://signque:password@localhost:5432/signque?schema=public` |
| `JWT_ACCESS_SECRET` | at least 16 characters |
| `JWT_REFRESH_SECRET` | at least 16 characters |
| `JWT_ACCESS_TTL` | default `15m` |
| `JWT_REFRESH_TTL` | default `7d` |
| `CORS_ORIGINS` | comma-separated, e.g. `http://localhost:5173` |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` | private bucket |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | |
| `SHIPPING_FEE` | default `99` |
| `MAX_FREE_REVISIONS` | default `3` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | |
| `APP_BASE_URL` | where email links point, e.g. `http://localhost:5173` |

---

## Troubleshooting

**The app starts and exits with "Invalid environment configuration".** That is
the Zod check doing its job — the message names every variable that is missing
or malformed. Compare `.env` against `.env.example`.

**Payments never leave `PENDING_PAYMENT` in local development.** The webhook is
the source of truth, and Razorpay cannot reach `localhost`. Point a tunnel at
`http://localhost:4000/api/payments/razorpay/webhook` and set that URL, with
`RAZORPAY_WEBHOOK_SECRET`, in the Razorpay dashboard. The `verify-payment`
endpoint only gives the UI faster feedback; it deliberately does not move the
order.

**A webhook returns 401.** The signature is computed over the *raw* bytes.
Anything that re-serialises the JSON on the way in will break it — that is why
the webhook route is mounted with `express.raw()` before `express.json()`.

**Images 404 in the seeded data.** The seeded photos and designs are placeholder
images, not real S3 objects. Upload a real photo to see the full path.

**`npm test` complains about the database name.** The suite truncates every
table, so it refuses to run unless `DATABASE_URL` in `.env.test` points at a
database whose name ends in `_test`.
