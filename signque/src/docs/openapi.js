'use strict';

/** OpenAPI 3 spec served at /docs. */

const env = require('../config/env');
const {
  ORDER_STATUS,
  MATERIAL_COLORS,
  THICKNESSES_MM,
  SHEET_SIZES,
  PRINTER_SETTABLE_STAGES,
} = require('../config/constants');

const envelope = (dataSchema) => ({
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    message: { type: 'string' },
    data: dataSchema || { nullable: true },
    error: {
      nullable: true,
      type: 'object',
      properties: { code: { type: 'string' }, details: { nullable: true } },
    },
  },
});

const errorResponse = (description) => ({
  description,
  content: { 'application/json': { schema: envelope({ nullable: true }) } },
});

const COMMON_ERRORS = {
  400: errorResponse('Bad request'),
  401: errorResponse('Not authenticated'),
  403: errorResponse('Forbidden — wrong role, or not your order'),
  404: errorResponse('Not found'),
  409: errorResponse('INVALID_TRANSITION or CONFLICT — the order moved on'),
  422: errorResponse('Validation failed'),
  429: errorResponse('Rate limited'),
};

const okResponse = (description, dataSchema) => ({
  description,
  content: { 'application/json': { schema: envelope(dataSchema) } },
});

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

function op({ tag, summary, description, roles, params = [], body, responses, security = true }) {
  return {
    tags: [tag],
    summary,
    description: [description, roles ? `**Role:** ${roles}` : null].filter(Boolean).join('\n\n'),
    ...(security ? {} : { security: [] }),
    ...(params.length ? { parameters: params } : {}),
    ...(body ? { requestBody: body } : {}),
    responses: { ...(responses || { 200: okResponse('OK') }), ...COMMON_ERRORS },
  };
}

const pathId = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'integer', minimum: 1 },
};
const pathOrderId = { ...pathId, name: 'orderId' };

const jsonBody = (schema, required = true) => ({
  required,
  content: { 'application/json': { schema } },
});

const spec = {
  openapi: '3.0.3',
  info: {
    title: 'SIGNQUE API',
    version: '1.0.0',
    description: [
      'Order-to-print production system for SIGNQUE custom acrylic photo frames.',
      '',
      'Every response has the shape `{ success, message, data, error }`.',
      '',
      '**The order workflow.** Every status change goes through one gateway, and the',
      'allowed moves are defined in a single transition table. A move that is not in',
      'the table — or is attempted by the wrong role — returns `409 INVALID_TRANSITION`.',
      'When two people act at the same time, exactly one wins and the other gets',
      '`409 CONFLICT`.',
      '',
      '**Money.** Prices always come from `Product.basePrice` and totals are',
      'recomputed on the server. A price sent by a client is ignored.',
      '',
      '**Files.** The S3 bucket is private; `fileUrl` and `photoUrl` in responses are',
      'pre-signed GET URLs valid for 10 minutes.',
    ].join('\n'),
  },
  servers: [{ url: `http://localhost:${env.PORT}/api`, description: 'Local' }],
  tags: [
    { name: 'Auth', description: 'Register, sign in, refresh, sign out' },
    { name: 'Products', description: 'Public catalogue' },
    { name: 'Customer', description: 'Uploads, addresses, orders and design review' },
    { name: 'Admin', description: 'Review, assignment, print spec, users and products' },
    { name: 'Designer', description: 'Design jobs' },
    { name: 'Printer', description: 'Print jobs and production stages' },
    { name: 'Notifications', description: 'In-app notifications' },
    { name: 'Payments', description: 'Razorpay webhook' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      OrderStatus: { type: 'string', enum: Object.keys(ORDER_STATUS) },
      MaterialColor: { type: 'string', enum: MATERIAL_COLORS },
      SheetSize: { type: 'string', enum: SHEET_SIZES },
      ThicknessMm: { type: 'integer', enum: [...THICKNESSES_MM] },
      PrintStage: { type: 'string', enum: [...PRINTER_SETTABLE_STAGES] },
      Role: { type: 'string', enum: ['CUSTOMER', 'ADMIN', 'DESIGNER', 'PRINTER'] },

      User: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string', nullable: true },
          role: ref('Role'),
          isActive: { type: 'boolean' },
        },
      },

      Product: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          title: { type: 'string' },
          description: { type: 'string', nullable: true },
          basePrice: { type: 'string', example: '1299.00' },
          imageUrl: { type: 'string', nullable: true },
          isActive: { type: 'boolean' },
        },
      },

      Order: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          orderNumber: { type: 'string', example: 'SQ-2026-000123' },
          status: ref('OrderStatus'),
          subtotal: { type: 'string' },
          shippingFee: { type: 'string' },
          total: { type: 'string' },
          assignedDesignerId: { type: 'integer', nullable: true },
          assignedPrinterId: { type: 'integer', nullable: true },
          customerRevisionCount: { type: 'integer' },
          rejectReason: { type: 'string', nullable: true },
          cancelReason: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      DesignVersion: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          versionNo: { type: 'integer' },
          fileUrl: { type: 'string', description: 'Pre-signed GET URL, valid 10 minutes' },
          designerNote: { type: 'string', nullable: true },
          status: {
            type: 'string',
            enum: ['SUBMITTED', 'ADMIN_REJECTED', 'SENT_TO_CUSTOMER', 'CUSTOMER_APPROVED', 'CHANGES_REQUESTED'],
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      PrintJob: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          orderId: { type: 'integer' },
          printerId: { type: 'integer' },
          color: ref('MaterialColor'),
          thicknessMm: ref('ThicknessMm'),
          size: ref('SheetSize'),
          stage: { type: 'string', enum: ['ASSIGNED', 'CUTTING', 'PRINTING', 'QUALITY_CHECK', 'DONE'] },
          notes: { type: 'string', nullable: true },
        },
      },

      Notification: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          type: { type: 'string' },
          title: { type: 'string' },
          message: { type: 'string' },
          channel: { type: 'string', enum: ['IN_APP', 'EMAIL', 'SMS'] },
          isRead: { type: 'boolean' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      TimelineEntry: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          at: { type: 'string', format: 'date-time' },
          fromStatus: { nullable: true, ...ref('OrderStatus') },
          toStatus: ref('OrderStatus'),
          label: { type: 'string' },
          note: { type: 'string', nullable: true },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: op({
        tag: 'Auth',
        summary: 'Liveness check',
        security: false,
        responses: { 200: okResponse('The API is up') },
      }),
    },

    // ------------------------------------------------------------------ auth
    '/auth/register': {
      post: op({
        tag: 'Auth',
        summary: 'Register a customer',
        description: 'Always creates a CUSTOMER. Staff accounts are made by an admin. Rate limited to 20 requests per 15 minutes.',
        security: false,
        body: jsonBody({
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            phone: { type: 'string' },
            password: { type: 'string', minLength: 8 },
          },
        }),
        responses: {
          201: okResponse('Created', {
            type: 'object',
            properties: { user: ref('User'), accessToken: { type: 'string' } },
          }),
        },
      }),
    },
    '/auth/login': {
      post: op({
        tag: 'Auth',
        summary: 'Sign in',
        description: 'Returns an access token in the body and sets the refresh token as an httpOnly cookie.',
        security: false,
        body: jsonBody({
          type: 'object',
          required: ['email', 'password'],
          properties: { email: { type: 'string' }, password: { type: 'string' } },
        }),
        responses: {
          200: okResponse('Signed in', {
            type: 'object',
            properties: { user: ref('User'), accessToken: { type: 'string' } },
          }),
        },
      }),
    },
    '/auth/refresh': {
      post: op({
        tag: 'Auth',
        summary: 'Rotate the refresh token',
        description: 'Reads the httpOnly cookie, revokes it and issues a new pair. Reusing a rotated token revokes every token for that user.',
        security: false,
        responses: { 200: okResponse('Refreshed') },
      }),
    },
    '/auth/logout': {
      post: op({ tag: 'Auth', summary: 'Sign out', security: false, responses: { 200: okResponse('Signed out') } }),
    },
    '/auth/me': {
      get: op({
        tag: 'Auth',
        summary: 'The signed-in user',
        responses: { 200: okResponse('OK', { type: 'object', properties: { user: ref('User') } }) },
      }),
    },

    // -------------------------------------------------------------- products
    '/products': {
      get: op({
        tag: 'Products',
        summary: 'Active products',
        security: false,
        responses: {
          200: okResponse('OK', {
            type: 'object',
            properties: { products: { type: 'array', items: ref('Product') } },
          }),
        },
      }),
    },
    '/products/{id}': {
      get: op({ tag: 'Products', summary: 'One active product', security: false, params: [pathId] }),
    },

    // -------------------------------------------------------------- customer
    '/uploads/photo': {
      post: op({
        tag: 'Customer',
        summary: 'Upload a customer photo',
        roles: 'CUSTOMER',
        description: 'multipart/form-data, field `photo`. jpg/png/heic, max 15 MB. Returns `{ url, key }` — pass both to POST /customizations.',
        body: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['photo'],
                properties: { photo: { type: 'string', format: 'binary' } },
              },
            },
          },
        },
        responses: {
          201: okResponse('Uploaded', {
            type: 'object',
            properties: { url: { type: 'string' }, key: { type: 'string' } },
          }),
        },
      }),
    },
    '/customizations': {
      post: op({
        tag: 'Customer',
        summary: 'Attach an uploaded photo to a product',
        roles: 'CUSTOMER',
        body: jsonBody({
          type: 'object',
          required: ['productId', 'photoUrl', 'photoKey'],
          properties: {
            productId: { type: 'integer' },
            photoUrl: { type: 'string' },
            photoKey: { type: 'string' },
          },
        }),
      }),
    },
    '/addresses': {
      get: op({ tag: 'Customer', summary: 'My addresses', roles: 'CUSTOMER' }),
      post: op({
        tag: 'Customer',
        summary: 'Add an address',
        roles: 'CUSTOMER',
        body: jsonBody({
          type: 'object',
          required: ['fullName', 'phone', 'line1', 'city', 'state', 'pincode'],
          properties: {
            fullName: { type: 'string' },
            phone: { type: 'string' },
            line1: { type: 'string' },
            line2: { type: 'string' },
            city: { type: 'string' },
            state: { type: 'string' },
            pincode: { type: 'string', pattern: '^[1-9][0-9]{5}$' },
            isDefault: { type: 'boolean' },
          },
        }),
      }),
    },
    '/addresses/{id}': {
      patch: op({ tag: 'Customer', summary: 'Update an address', roles: 'CUSTOMER', params: [pathId] }),
      delete: op({ tag: 'Customer', summary: 'Delete an unused address', roles: 'CUSTOMER', params: [pathId] }),
    },
    '/orders': {
      post: op({
        tag: 'Customer',
        summary: 'Place an order',
        roles: 'CUSTOMER',
        description: 'Creates the order as PENDING_PAYMENT and a Razorpay order. Totals are computed on the server from Product.basePrice plus the shipping fee — no price is accepted from the client.',
        body: jsonBody({
          type: 'object',
          required: ['items', 'addressId'],
          properties: {
            addressId: { type: 'integer' },
            items: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['productId', 'customizationId', 'quantity'],
                properties: {
                  productId: { type: 'integer' },
                  customizationId: { type: 'integer' },
                  quantity: { type: 'integer', minimum: 1 },
                },
              },
            },
          },
        }),
        responses: {
          201: okResponse('Created', {
            type: 'object',
            properties: {
              order: ref('Order'),
              razorpay: {
                type: 'object',
                properties: {
                  orderId: { type: 'string' },
                  amount: { type: 'integer', description: 'In paise' },
                  currency: { type: 'string' },
                  keyId: { type: 'string' },
                },
              },
            },
          }),
        },
      }),
    },
    '/orders/mine': {
      get: op({
        tag: 'Customer',
        summary: 'My orders',
        roles: 'CUSTOMER',
        params: [
          { name: 'status', in: 'query', schema: ref('OrderStatus') },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
      }),
    },
    '/orders/{id}': {
      get: op({
        tag: 'Customer',
        summary: 'One of my orders',
        roles: 'CUSTOMER',
        description: 'Items, the design (only if the admin has sent it), the 6-step progress tracker, the timeline and how many revisions are left.',
        params: [pathId],
        responses: {
          200: okResponse('OK', {
            type: 'object',
            properties: {
              order: {
                allOf: [
                  ref('Order'),
                  {
                    type: 'object',
                    properties: {
                      design: { nullable: true, ...ref('DesignVersion') },
                      timeline: { type: 'array', items: ref('TimelineEntry') },
                      progress: {
                        type: 'object',
                        properties: {
                          currentIndex: { type: 'integer' },
                          ended: { type: 'boolean' },
                          steps: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                key: { type: 'string' },
                                label: { type: 'string' },
                                state: { type: 'string', enum: ['done', 'current', 'todo', 'stopped'] },
                              },
                            },
                          },
                        },
                      },
                      revisions: {
                        type: 'object',
                        properties: {
                          used: { type: 'integer' },
                          left: { type: 'integer' },
                          max: { type: 'integer' },
                          canRequestChanges: { type: 'boolean' },
                        },
                      },
                    },
                  },
                ],
              },
            },
          }),
        },
      }),
    },
    '/orders/{id}/verify-payment': {
      post: op({
        tag: 'Customer',
        summary: 'Verify the checkout signature',
        roles: 'CUSTOMER',
        description: 'For fast UI feedback only. The webhook stays the source of truth, so this does not move the order.',
        params: [pathId],
        body: jsonBody({
          type: 'object',
          required: ['razorpayOrderId', 'razorpayPaymentId', 'razorpaySignature'],
          properties: {
            razorpayOrderId: { type: 'string' },
            razorpayPaymentId: { type: 'string' },
            razorpaySignature: { type: 'string' },
          },
        }),
      }),
    },
    '/orders/{id}/retry-payment': {
      post: op({
        tag: 'Customer',
        summary: 'Retry a failed payment',
        roles: 'CUSTOMER',
        description: 'From PAYMENT_FAILED only. Issues a new Razorpay order and moves the order back to PENDING_PAYMENT.',
        params: [pathId],
      }),
    },
    '/orders/{id}/design': {
      get: op({
        tag: 'Customer',
        summary: 'The latest design I may see',
        roles: 'CUSTOMER',
        description: 'Only versions the admin sent to the customer. Versions the admin rejected are never returned.',
        params: [pathId],
      }),
    },
    '/orders/{id}/design/approve': {
      post: op({
        tag: 'Customer',
        summary: 'Approve the design',
        roles: 'CUSTOMER',
        description: 'AWAITING_CUSTOMER_APPROVAL → CUSTOMER_APPROVED.',
        params: [pathId],
      }),
    },
    '/orders/{id}/design/request-changes': {
      post: op({
        tag: 'Customer',
        summary: 'Request changes',
        roles: 'CUSTOMER',
        description: `AWAITING_CUSTOMER_APPROVAL → DESIGN_IN_PROGRESS. Allowed up to MAX_FREE_REVISIONS (currently ${env.MAX_FREE_REVISIONS}) times; after that it returns 403.`,
        params: [pathId],
        body: jsonBody({
          type: 'object',
          required: ['comment'],
          properties: { comment: { type: 'string', minLength: 5, maxLength: 1000 } },
        }),
      }),
    },

    // ----------------------------------------------------------------- admin
    '/admin/dashboard': {
      get: op({
        tag: 'Admin',
        summary: 'Counts per status, and open jobs per designer and printer',
        roles: 'ADMIN',
      }),
    },
    '/admin/print-options': {
      get: op({
        tag: 'Admin',
        summary: 'Allowed colours, thicknesses and sizes',
        roles: 'ADMIN',
      }),
    },
    '/admin/orders': {
      get: op({
        tag: 'Admin',
        summary: 'Orders table',
        roles: 'ADMIN',
        description: 'Filter by status, date range, designer and printer; search by order number, customer name or phone.',
        params: [
          { name: 'status', in: 'query', schema: ref('OrderStatus') },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'designerId', in: 'query', schema: { type: 'integer' } },
          { name: 'printerId', in: 'query', schema: { type: 'integer' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
      }),
    },
    '/admin/orders/{id}': {
      get: op({
        tag: 'Admin',
        summary: 'Full order detail',
        roles: 'ADMIN',
        description: 'Every design version, every review, the print job, payments and the full history.',
        params: [pathId],
      }),
    },
    '/admin/orders/{id}/approve': {
      post: op({
        tag: 'Admin',
        summary: 'Approve the photo and assign a designer',
        roles: 'ADMIN',
        description: 'PLACED → DESIGN_ASSIGNED.',
        params: [pathId],
        body: jsonBody({
          type: 'object',
          required: ['designerId'],
          properties: { designerId: { type: 'integer' } },
        }),
      }),
    },
    '/admin/orders/{id}/reject': {
      post: op({
        tag: 'Admin',
        summary: 'Reject the order',
        roles: 'ADMIN',
        description: 'PLACED → REJECTED, and a full refund is started.',
        params: [pathId],
        body: jsonBody({
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 5 } },
        }),
      }),
    },
    '/admin/orders/{id}/cancel': {
      post: op({
        tag: 'Admin',
        summary: 'Cancel the order',
        roles: 'ADMIN',
        description: 'From any non-final status. A paid order is refunded.',
        params: [pathId],
        body: jsonBody({
          type: 'object',
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 5 } },
        }),
      }),
    },
    '/admin/orders/{id}/reassign-designer': {
      post: op({
        tag: 'Admin',
        summary: 'Swap the designer',
        roles: 'ADMIN',
        description: 'At DESIGN_ASSIGNED or DESIGN_IN_PROGRESS. The status does not change, but a history row is written.',
        params: [pathId],
        body: jsonBody({
          type: 'object',
          required: ['designerId'],
          properties: { designerId: { type: 'integer' } },
        }),
      }),
    },
    '/admin/orders/{id}/design/approve': {
      post: op({
        tag: 'Admin',
        summary: 'Send the latest design to the customer',
        roles: 'ADMIN',
        description: 'DESIGN_SUBMITTED → AWAITING_CUSTOMER_APPROVAL.',
        params: [pathId],
      }),
    },
    '/admin/orders/{id}/design/send-back': {
      post: op({
        tag: 'Admin',
        summary: 'Send the design back with notes',
        roles: 'ADMIN',
        description: 'DESIGN_SUBMITTED → DESIGN_IN_PROGRESS. The version is marked ADMIN_REJECTED and the customer never sees it.',
        params: [pathId],
        body: jsonBody({
          type: 'object',
          required: ['note'],
          properties: { note: { type: 'string', minLength: 5 } },
        }),
      }),
    },
    '/admin/orders/{id}/print-job': {
      post: op({
        tag: 'Admin',
        summary: 'Set the print spec and assign a printing user',
        roles: 'ADMIN',
        description: 'CUSTOMER_APPROVED → PRINT_ASSIGNED.',
        params: [pathId],
        body: jsonBody({
          type: 'object',
          required: ['printerId', 'color', 'thicknessMm', 'size'],
          properties: {
            printerId: { type: 'integer' },
            color: ref('MaterialColor'),
            thicknessMm: ref('ThicknessMm'),
            size: ref('SheetSize'),
            notes: { type: 'string' },
          },
        }),
        responses: {
          201: okResponse('Assigned', {
            type: 'object',
            properties: { order: ref('Order'), printJob: ref('PrintJob') },
          }),
        },
      }),
    },
    '/admin/orders/{id}/reassign-printer': {
      post: op({
        tag: 'Admin',
        summary: 'Swap the printing user',
        roles: 'ADMIN',
        description: 'At PRINT_ASSIGNED or PRINTING.',
        params: [pathId],
        body: jsonBody({
          type: 'object',
          required: ['printerId'],
          properties: { printerId: { type: 'integer' } },
        }),
      }),
    },
    '/admin/users': {
      get: op({
        tag: 'Admin',
        summary: 'Users',
        roles: 'ADMIN',
        description: '`?role=DESIGNER` or `?role=PRINTER` returns each user with their count of open jobs, for the assignment dropdowns.',
        params: [
          { name: 'role', in: 'query', schema: ref('Role') },
          { name: 'isActive', in: 'query', schema: { type: 'boolean' } },
        ],
      }),
      post: op({
        tag: 'Admin',
        summary: 'Create a staff account',
        roles: 'ADMIN',
        body: jsonBody({
          type: 'object',
          required: ['name', 'email', 'password', 'role'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string' },
            phone: { type: 'string' },
            password: { type: 'string', minLength: 8 },
            role: { type: 'string', enum: ['ADMIN', 'DESIGNER', 'PRINTER'] },
          },
        }),
      }),
    },
    '/admin/users/{id}': {
      patch: op({
        tag: 'Admin',
        summary: 'Update or deactivate a user',
        roles: 'ADMIN',
        params: [pathId],
        body: jsonBody({
          type: 'object',
          properties: {
            name: { type: 'string' },
            phone: { type: 'string' },
            password: { type: 'string' },
            role: ref('Role'),
            isActive: { type: 'boolean' },
          },
        }),
      }),
    },
    '/admin/products': {
      get: op({ tag: 'Admin', summary: 'All products, including deactivated', roles: 'ADMIN' }),
      post: op({
        tag: 'Admin',
        summary: 'Create a product',
        roles: 'ADMIN',
        body: jsonBody({
          type: 'object',
          required: ['title', 'basePrice'],
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            basePrice: { type: 'number' },
            imageUrl: { type: 'string' },
          },
        }),
      }),
    },
    '/admin/products/{id}': {
      patch: op({ tag: 'Admin', summary: 'Update or deactivate a product', roles: 'ADMIN', params: [pathId] }),
    },

    // -------------------------------------------------------------- designer
    '/designer/jobs': {
      get: op({
        tag: 'Designer',
        summary: 'My design jobs',
        roles: 'DESIGNER',
        params: [
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['DESIGN_ASSIGNED', 'DESIGN_IN_PROGRESS', 'DESIGN_SUBMITTED', 'all'],
              default: 'all',
            },
          },
        ],
      }),
    },
    '/designer/jobs/{orderId}': {
      get: op({
        tag: 'Designer',
        summary: 'One job',
        roles: 'DESIGNER',
        description: 'The customer photo, the product, every version of mine and every review comment.',
        params: [pathOrderId],
      }),
    },
    '/designer/jobs/{orderId}/take': {
      post: op({
        tag: 'Designer',
        summary: 'Take the job',
        roles: 'DESIGNER',
        description: 'DESIGN_ASSIGNED → DESIGN_IN_PROGRESS. Atomic: if two designers click at once, exactly one succeeds and the other gets 409.',
        params: [pathOrderId],
      }),
    },
    '/designer/jobs/{orderId}/submit': {
      post: op({
        tag: 'Designer',
        summary: 'Submit a design',
        roles: 'DESIGNER',
        description: 'multipart/form-data: `file` (png/jpg/pdf, max 25 MB) and an optional `note`. Creates the next DesignVersion and moves the order to DESIGN_SUBMITTED.',
        params: [pathOrderId],
        body: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  note: { type: 'string', maxLength: 1000 },
                },
              },
            },
          },
        },
        responses: {
          201: okResponse('Submitted', {
            type: 'object',
            properties: { order: ref('Order'), version: ref('DesignVersion') },
          }),
        },
      }),
    },

    // --------------------------------------------------------------- printer
    '/printer/jobs': {
      get: op({
        tag: 'Printer',
        summary: 'My print jobs',
        roles: 'PRINTER',
        params: [
          {
            name: 'stage',
            in: 'query',
            schema: { type: 'string', enum: ['ASSIGNED', 'CUTTING', 'PRINTING', 'QUALITY_CHECK', 'DONE'] },
          },
        ],
      }),
    },
    '/printer/jobs/{orderId}': {
      get: op({
        tag: 'Printer',
        summary: 'One job',
        roles: 'PRINTER',
        description: 'The approved design (pre-signed, downloadable), the print spec, the product and the quantity.',
        params: [pathOrderId],
      }),
    },
    '/printer/jobs/{orderId}/take': {
      post: op({
        tag: 'Printer',
        summary: 'Take the job',
        roles: 'PRINTER',
        description: 'PRINT_ASSIGNED → PRINTING, and the stage moves to CUTTING.',
        params: [pathOrderId],
      }),
    },
    '/printer/jobs/{orderId}/stage': {
      patch: op({
        tag: 'Printer',
        summary: 'Update the production stage',
        roles: 'PRINTER',
        description: 'CUTTING → PRINTING → QUALITY_CHECK, and back to CUTTING or PRINTING when a quality check fails. The order status stays PRINTING.',
        params: [pathOrderId],
        body: jsonBody({
          type: 'object',
          required: ['stage'],
          properties: { stage: ref('PrintStage'), notes: { type: 'string' } },
        }),
      }),
    },
    '/printer/jobs/{orderId}/complete': {
      post: op({
        tag: 'Printer',
        summary: 'Mark the job complete',
        roles: 'PRINTER',
        description: 'Only allowed from stage QUALITY_CHECK. Moves the order PRINTING → PRINT_COMPLETED → COMPLETED and notifies the customer.',
        params: [pathOrderId],
      }),
    },

    // --------------------------------------------------------- notifications
    '/notifications': {
      get: op({
        tag: 'Notifications',
        summary: 'My notifications',
        params: [{ name: 'unread', in: 'query', schema: { type: 'boolean' } }],
        responses: {
          200: okResponse('OK', {
            type: 'object',
            properties: {
              items: { type: 'array', items: ref('Notification') },
              unreadCount: { type: 'integer' },
            },
          }),
        },
      }),
    },
    '/notifications/{id}/read': {
      patch: op({ tag: 'Notifications', summary: 'Mark one as read', params: [pathId] }),
    },
    '/notifications/read-all': {
      patch: op({ tag: 'Notifications', summary: 'Mark all as read' }),
    },

    // -------------------------------------------------------------- payments
    '/payments/razorpay/webhook': {
      post: op({
        tag: 'Payments',
        summary: 'Razorpay webhook',
        security: false,
        description: [
          'Public, but the `x-razorpay-signature` header is verified as an HMAC-SHA256 of the RAW body.',
          '',
          'Handles `payment.captured` and `order.paid` (→ PLACED), `payment.failed`',
          '(→ PAYMENT_FAILED) and `refund.processed`. Idempotent: the event id is stored',
          'with a unique constraint, so a redelivered event is a no-op, and a payment',
          'already in a final state is never overwritten.',
        ].join('\n'),
        responses: { 200: okResponse('Received') },
      }),
    },
  },
};

module.exports = spec;
