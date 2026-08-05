# SIGNQUE Backend

Production-ready Node.js backend for the SIGNQUE custom acrylic photo frame ecommerce app. It provides JWT auth, PostgreSQL with Prisma, product browsing, image uploads, customizations, cart management, addresses, and order placement for an Indian ecommerce flow.

## Stack

- Node.js
- Express.js
- PostgreSQL
- Prisma ORM
- JWT access and refresh tokens
- bcrypt
- Zod
- multer
- helmet, cors, express-rate-limit
- morgan

## Project Structure

```text
src/
  config/
  controllers/
  middlewares/
  prisma/
  routes/
  services/
  utils/
  validators/
prisma/
uploads/
```

## Features

- User registration and login with hashed passwords
- Refresh token rotation stored in PostgreSQL
- Public product APIs for active products
- Local image upload with static file serving
- User-linked product customizations
- Per-user cart with backend-controlled pricing
- Address creation and retrieval
- Order creation from cart with payment method capture
- Razorpay order creation, checkout handoff, payment verification, and webhook processing
- Payment record creation for UPI, CARD, and COD
- Consistent JSON response format
- Security middleware and rate limiting on auth routes

## Environment Variables

Copy `.env.example` to `.env` and update the values:

```env
PORT=5000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/signque_db?schema=public"
JWT_ACCESS_SECRET=your-super-secret-access-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
SHIPPING_FEE=99
UPLOAD_MAX_FILE_SIZE=5242880
ADMIN_USERNAME=admin@signqube.com
ADMIN_PASSWORD=admin123
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
RAZORPAY_CURRENCY=INR
RAZORPAY_COMPANY_NAME=SIGNQUE
```

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create a PostgreSQL database, for example `signque_db`.

3. Generate Prisma client:

```bash
npm run prisma:generate
```

4. Run the first migration:

```bash
npm run prisma:migrate -- --name init
```

5. Seed sample products:

```bash
npm run prisma:db:seed
```

6. Start the dev server:

```bash
npm run dev
```

The API will be available at `http://localhost:5000/api`.
Swagger UI will be available at `http://localhost:5000/docs`.

## Available Scripts

- `npm run dev` - Start the development server with nodemon
- `npm run build` - Placeholder build step for deployment workflows
- `npm start` - Start the production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run Prisma migrate dev
- `npm run prisma:db:seed` - Seed sample product data

## API Docs

- Swagger UI: `GET /docs`
- OpenAPI JSON: `GET /docs/openapi.json`

## API Response Format

Every endpoint returns a consistent JSON shape:

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {},
  "error": null
}
```

## API Endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

### Products

- `GET /api/products`
- `GET /api/products/:id`

### Uploads and Customizations

- `POST /api/uploads/image`
- `POST /api/customizations`

### Cart

- `GET /api/cart`
- `POST /api/cart/items`
- `PATCH /api/cart/items/:id`
- `DELETE /api/cart/items/:id`
- `DELETE /api/cart`

### Addresses

- `POST /api/addresses`
- `GET /api/addresses`

### Orders

- `POST /api/orders`
- `GET /api/orders`
- `GET /api/orders/:id`
- `POST /api/orders/:id/verify-payment`
- `POST /api/payments/razorpay/webhook`

### Admin

- `GET /admin`
- `GET /api/admin/insights`
- `GET /api/admin/orders`
- `GET /api/admin/orders/:id`
- `PATCH /api/admin/orders/:id/status`
- `GET /api/admin/products`
- `POST /api/admin/products`
- `PATCH /api/admin/products/:id`

## Sample Requests

### Register

Request:

```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "Aarav Sharma",
  "email": "aarav@example.com",
  "password": "StrongPass123",
  "phone": "9876543210"
}
```

Response:

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "accessToken": "jwt-access-token",
    "refreshToken": "jwt-refresh-token",
    "user": {
      "id": "uuid",
      "name": "Aarav Sharma",
      "email": "aarav@example.com",
      "phone": "9876543210"
    }
  },
  "error": null
}
```

### Login

Request:

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "aarav@example.com",
  "password": "StrongPass123"
}
```

### Upload Image

Request:

```http
POST /api/uploads/image
Authorization: Bearer <access-token>
Content-Type: multipart/form-data

image=<file>
```

### Create Customization

```http
POST /api/customizations
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "productId": "product-uuid",
  "uploadedImageUrl": "/uploads/1710000000000-frame.jpg",
  "previewImageUrl": "/uploads/1710000000000-preview.jpg",
  "quantity": 1,
  "notes": "Please center the image and keep a minimal border."
}
```

### Add Item to Cart

```http
POST /api/cart/items
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "productId": "product-uuid",
  "customizationId": "customization-uuid",
  "quantity": 2
}
```

### Create Address

```http
POST /api/addresses
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "fullName": "Aarav Sharma",
  "phone": "9876543210",
  "line1": "221B MG Road",
  "line2": "Near Metro Station",
  "city": "Bengaluru",
  "state": "Karnataka",
  "postalCode": "560001",
  "country": "India"
}
```

### Place Order

```http
POST /api/orders
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "addressId": "address-uuid",
  "paymentMethod": "UPI"
}
```

Response for `UPI` or `CARD` includes `paymentSession`. Use that object to open Razorpay Checkout on frontend.

### Verify Razorpay Payment

```http
POST /api/orders/:id/verify-payment
Authorization: Bearer <access-token>
Content-Type: application/json

{
  "razorpayOrderId": "order_RB58MiP5SPFYyM",
  "razorpayPaymentId": "pay_RB59abc123",
  "razorpaySignature": "generated-signature"
}
```

### Get Orders

```http
GET /api/orders
Authorization: Bearer <access-token>
```

## Frontend Fetch Examples

### Register

```js
const response = await fetch("http://localhost:5000/api/auth/register", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "Aarav Sharma",
    email: "aarav@example.com",
    password: "StrongPass123",
    phone: "9876543210",
  }),
});

const result = await response.json();
```

### Login

```js
const response = await fetch("http://localhost:5000/api/auth/login", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    email: "aarav@example.com",
    password: "StrongPass123",
  }),
});

const result = await response.json();
```

### Get Products

```js
const response = await fetch("http://localhost:5000/api/products");
const result = await response.json();
```

### Upload Image

```js
const formData = new FormData();
formData.append("image", selectedFile);

const response = await fetch("http://localhost:5000/api/uploads/image", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
  body: formData,
});

const result = await response.json();
```

### Create Customization

```js
const response = await fetch("http://localhost:5000/api/customizations", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    productId,
    uploadedImageUrl: uploadResult.data.path,
    previewImageUrl: uploadResult.data.path,
    quantity: 1,
    notes: "Landscape crop, warm finish.",
  }),
});

const result = await response.json();
```

### Add Item to Cart

```js
const response = await fetch("http://localhost:5000/api/cart/items", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    productId,
    customizationId,
    quantity: 1,
  }),
});

const result = await response.json();
```

### Get Cart

```js
const response = await fetch("http://localhost:5000/api/cart", {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});

const result = await response.json();
```

### Create Address

```js
const response = await fetch("http://localhost:5000/api/addresses", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify(addressPayload),
});

const result = await response.json();
```

### Place Order

```js
const response = await fetch("http://localhost:5000/api/orders", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  },
  body: JSON.stringify({
    addressId,
    paymentMethod: "UPI",
  }),
});

const result = await response.json();

if (result.data.paymentSession) {
  const razorpay = new window.Razorpay({
    key: result.data.paymentSession.key,
    amount: result.data.paymentSession.amount,
    currency: result.data.paymentSession.currency,
    name: result.data.paymentSession.name,
    description: result.data.paymentSession.description,
    order_id: result.data.paymentSession.orderId,
    prefill: result.data.paymentSession.prefill,
    notes: result.data.paymentSession.notes,
    handler: async (paymentResult) => {
      await fetch(`http://localhost:5000/api/orders/${result.data.id}/verify-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          razorpayOrderId: paymentResult.razorpay_order_id,
          razorpayPaymentId: paymentResult.razorpay_payment_id,
          razorpaySignature: paymentResult.razorpay_signature,
        }),
      });
    },
  });

  razorpay.open();
}
```

### Get Orders

```js
const response = await fetch("http://localhost:5000/api/orders", {
  headers: {
    Authorization: `Bearer ${accessToken}`,
  },
});

const result = await response.json();
```

## Notes

- Prices and totals are always recalculated on the backend.
- Shipping uses the configurable `SHIPPING_FEE` environment variable.
- Uploaded files are served from `/uploads`.
- Razorpay webhook is server-to-server. Configure `/api/payments/razorpay/webhook` on Razorpay Dashboard with same `RAZORPAY_WEBHOOK_SECRET` value set in backend.
- Frontend should not call webhook endpoint directly. Frontend opens Checkout and then calls `POST /api/orders/:id/verify-payment` after successful payment handler.
- Razorpay does not send webhooks to localhost. Use public staging URL or tunnel when testing locally.
- Seeded image URLs are placeholders you can replace with your own uploaded product images.
#   S i g n Q u b e _ B a c k e n d  
 