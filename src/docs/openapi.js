const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "SIGNQUE Backend API",
    version: "1.0.0",
    description:
      "Swagger documentation for the SIGNQUE ecommerce backend, including customer and admin APIs.",
  },
  servers: [
    {
      url: "http://localhost:5000",
      description: "Local development server",
    },
  ],
  tags: [
    { name: "Health", description: "Service health checks" },
    { name: "Auth", description: "Authentication and session APIs" },
    { name: "Products", description: "Public product APIs" },
    { name: "Uploads", description: "Authenticated image uploads" },
    { name: "Customizations", description: "Product customization APIs" },
    { name: "Cart", description: "User cart management" },
    { name: "Addresses", description: "User address management" },
    { name: "Orders", description: "User order management" },
    { name: "Admin", description: "Admin analytics, order, and product APIs" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      SuccessEnvelope: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Operation successful" },
          data: {},
          error: {
            nullable: true,
            oneOf: [{ type: "string" }, { type: "array" }, { type: "object" }],
          },
        },
      },
      ErrorEnvelope: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          message: { type: "string", example: "Validation failed" },
          data: { nullable: true, example: null },
          error: {
            nullable: true,
            oneOf: [{ type: "string" }, { type: "array" }, { type: "object" }],
          },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
          email: { type: "string", format: "email" },
          phone: { type: "string", nullable: true },
          role: { type: "string", enum: ["CUSTOMER", "ADMIN"] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      AuthTokens: {
        type: "object",
        properties: {
          accessToken: { type: "string" },
          refreshToken: { type: "string" },
          user: { $ref: "#/components/schemas/User" },
        },
      },
      Product: {
        type: "object",
        properties: {
          publicId: { type: "integer" },
          id: { type: "string", format: "uuid" },
          title: { type: "string" },
          description: { type: "string", nullable: true },
          basePrice: { type: "number", example: 999 },
          imageUrl: { type: "string", nullable: true },
          detailImages: { type: "array", items: { type: "object" } },
          attributes: { type: "array", items: { type: "object" } },
          pricing: { nullable: true, oneOf: [{ type: "object" }, { type: "null" }] },
          pricingRules: { type: "array", items: { type: "object" } },
          addons: { type: "array", items: { type: "object" } },
          uploadConfig: { nullable: true, oneOf: [{ type: "object" }, { type: "null" }] },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ProductListingItem: {
        type: "object",
        properties: {
          ProductID: { type: "integer" },
          ProductName: { type: "string" },
          Description: { type: "string", nullable: true },
          ProductImage: { type: "string", nullable: true },
        },
      },
      ProductDetailsWithPricing: {
        type: "object",
        properties: {
          ProductID: { type: "integer" },
          ProductName: { type: "string" },
          Description: { type: "string", nullable: true },
          ProductImage: { type: "string", nullable: true },
          ProductDetailsImages: { type: "array", items: { type: "object" } },
          Attributes: { type: "array", items: { type: "object" } },
          Pricing: { nullable: true, oneOf: [{ type: "object" }, { type: "null" }] },
          PricingRules: { type: "array", items: { type: "object" } },
          Addons: { type: "array", items: { type: "object" } },
          UploadConfig: { nullable: true, oneOf: [{ type: "object" }, { type: "null" }] },
        },
      },
      ProductAdmin: {
        allOf: [
          { $ref: "#/components/schemas/Product" },
          {
            type: "object",
            properties: {
              _count: {
                type: "object",
                properties: {
                  orderItems: { type: "integer" },
                  cartItems: { type: "integer" },
                  customizations: { type: "integer" },
                },
              },
            },
          },
        ],
      },
      Customization: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          productId: {
            oneOf: [{ type: "string", format: "uuid" }, { type: "integer" }],
          },
          uploadedImageUrl: { type: "string" },
          previewImageUrl: { type: "string", nullable: true },
          quantity: { type: "integer" },
          notes: { type: "string", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Address: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          fullName: { type: "string" },
          phone: { type: "string" },
          line1: { type: "string" },
          line2: { type: "string", nullable: true },
          city: { type: "string" },
          state: { type: "string" },
          postalCode: { type: "string" },
          country: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Payment: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          orderId: { type: "string", format: "uuid" },
          method: { type: "string", enum: ["UPI", "CARD", "COD"] },
          status: { type: "string", enum: ["PENDING", "SUCCESS", "FAILED", "REFUNDED"] },
          transactionRef: { type: "string", nullable: true },
          gatewayOrderId: { type: "string", nullable: true },
          gatewayPaymentId: { type: "string", nullable: true },
          gatewaySignature: { type: "string", nullable: true },
          amount: { type: "number" },
          paidAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      RazorpayCheckoutSession: {
        type: "object",
        nullable: true,
        properties: {
          key: { type: "string" },
          amount: { type: "integer" },
          currency: { type: "string", example: "INR" },
          name: { type: "string" },
          description: { type: "string" },
          orderId: { type: "string" },
          orderNumber: { type: "string" },
          prefill: {
            type: "object",
            properties: {
              name: { type: "string" },
              contact: { type: "string" },
            },
          },
          notes: {
            type: "object",
            properties: {
              appOrderId: { type: "string", format: "uuid" },
              orderNumber: { type: "string" },
            },
          },
        },
      },
      OrderItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          orderId: { type: "string", format: "uuid" },
          productId: {
            oneOf: [{ type: "string", format: "uuid" }, { type: "integer" }],
          },
          customizationId: { type: "string", format: "uuid", nullable: true },
          productName: { type: "string" },
          unitPrice: { type: "number" },
          quantity: { type: "integer" },
          lineTotal: { type: "number" },
          createdAt: { type: "string", format: "date-time" },
          customization: {
            oneOf: [{ $ref: "#/components/schemas/Customization" }, { type: "null" }],
          },
          product: {
            oneOf: [{ $ref: "#/components/schemas/Product" }, { type: "null" }],
          },
        },
      },
      Order: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          addressId: { type: "string", format: "uuid" },
          orderNumber: { type: "string" },
          status: { type: "string", enum: ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] },
          paymentMethod: { type: "string", enum: ["UPI", "CARD", "COD"] },
          subtotal: { type: "number" },
          shippingFee: { type: "number" },
          totalAmount: { type: "number" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          address: { $ref: "#/components/schemas/Address" },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/OrderItem" },
          },
          payments: {
            type: "array",
            items: { $ref: "#/components/schemas/Payment" },
          },
          paymentSession: { $ref: "#/components/schemas/RazorpayCheckoutSession" },
          user: { $ref: "#/components/schemas/User" },
        },
      },
      CartItem: {
        type: "object",
        properties: {
          id: { type: "string", format: "uuid" },
          userId: { type: "string", format: "uuid" },
          productId: { type: "string", format: "uuid" },
          customizationId: { type: "string", format: "uuid", nullable: true },
          quantity: { type: "integer" },
          unitPrice: { type: "number" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Cart: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/CartItem" },
          },
          subtotal: { type: "number" },
          shippingFee: { type: "number" },
          totalAmount: { type: "number" },
        },
      },
      Insights: {
        type: "object",
        properties: {
          metrics: {
            type: "object",
            properties: {
              orderCount: { type: "integer" },
              productCount: { type: "integer" },
              activeProductCount: { type: "integer" },
              pendingOrderCount: { type: "integer" },
              totalRevenue: { type: "number" },
              averageOrderValue: { type: "number" },
            },
          },
          orderStatusBreakdown: {
            type: "array",
            items: {
              type: "object",
              properties: {
                status: { type: "string" },
                count: { type: "integer" },
              },
            },
          },
          salesByDay: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", example: "2026-05-24" },
                revenue: { type: "number" },
                orders: { type: "integer" },
              },
            },
          },
          topProducts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productName: { type: "string" },
                quantitySold: { type: "integer" },
                revenue: { type: "number" },
              },
            },
          },
          recentOrders: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                orderNumber: { type: "string" },
                status: { type: "string" },
                totalAmount: { type: "number" },
                createdAt: { type: "string", format: "date-time" },
                user: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                  },
                },
              },
            },
          },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["name", "email", "password"],
        properties: {
          name: { type: "string", example: "Aarav Sharma" },
          email: { type: "string", format: "email", example: "aarav@example.com" },
          password: { type: "string", format: "password", minLength: 8, example: "StrongPass123" },
          phone: { type: "string", example: "9876543210", nullable: true },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", format: "password" },
        },
      },
      AdminLoginRequest: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "admin@signqube.com" },
          password: { type: "string", format: "password", example: "admin123" },
        },
      },
      RefreshRequest: {
        type: "object",
        required: ["refreshToken"],
        properties: {
          refreshToken: { type: "string" },
        },
      },
      CreateCustomizationRequest: {
        type: "object",
        required: ["productId", "uploadedImageUrl", "quantity"],
        properties: {
          productId: { type: "string", format: "uuid" },
          uploadedImageUrl: {
            type: "string",
            example: "https://sign-qube-test-v1.s3.ap-south-1.amazonaws.com/images/1784384517341-frame.jpg",
          },
          previewImageUrl: { type: "string", nullable: true },
          quantity: { type: "integer", minimum: 1, maximum: 20, default: 1 },
          notes: { type: "string", nullable: true },
        },
      },
      AddCartItemRequest: {
        type: "object",
        required: ["productId", "quantity"],
        properties: {
          productId: { type: "string", format: "uuid" },
          customizationId: { type: "string", format: "uuid", nullable: true },
          quantity: { type: "integer", minimum: 1, maximum: 20 },
        },
      },
      UpdateCartItemRequest: {
        type: "object",
        required: ["quantity"],
        properties: {
          quantity: { type: "integer", minimum: 1, maximum: 20 },
        },
      },
      CreateAddressRequest: {
        type: "object",
        required: ["fullName", "phone", "line1", "city", "state", "postalCode"],
        properties: {
          fullName: { type: "string" },
          phone: { type: "string", example: "9876543210" },
          line1: { type: "string" },
          line2: { type: "string", nullable: true },
          city: { type: "string" },
          state: { type: "string" },
          postalCode: { type: "string" },
          country: { type: "string", default: "India" },
        },
      },
      CreateOrderRequest: {
        type: "object",
        required: ["addressId", "paymentMethod"],
        properties: {
          addressId: { type: "string", format: "uuid" },
          paymentMethod: { type: "string", enum: ["UPI", "CARD", "COD"] },
        },
      },
      VerifyOrderPaymentRequest: {
        type: "object",
        required: ["razorpayOrderId", "razorpayPaymentId", "razorpaySignature"],
        properties: {
          razorpayOrderId: { type: "string" },
          razorpayPaymentId: { type: "string" },
          razorpaySignature: { type: "string" },
        },
      },
      AdminProductRequest: {
        type: "object",
        required: ["title", "basePrice"],
        properties: {
          title: { type: "string" },
          description: { type: "string", nullable: true },
          basePrice: { type: "number", minimum: 0.01 },
          imageUrl: { type: "string", format: "uri", nullable: true },
          detailImages: { type: "array", items: { type: "object" } },
          attributes: { type: "array", items: { type: "object" } },
          pricing: { nullable: true, oneOf: [{ type: "object" }, { type: "null" }] },
          pricingRules: { type: "array", items: { type: "object" } },
          addons: { type: "array", items: { type: "object" } },
          uploadConfig: { nullable: true, oneOf: [{ type: "object" }, { type: "null" }] },
          isActive: { type: "boolean", default: true },
        },
      },
      AdminOrderStatusRequest: {
        type: "object",
        required: ["status"],
        properties: {
          status: {
            type: "string",
            enum: ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"],
          },
        },
      },
    },
    parameters: {
      UuidId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    },
    responses: {
      ValidationError: {
        description: "Validation failed",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorEnvelope" },
          },
        },
      },
      Unauthorized: {
        description: "Authentication failed",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorEnvelope" },
          },
        },
      },
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        responses: {
          200: {
            description: "Backend is healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/auth/register": {
      post: {
        tags: ["Auth"],
        summary: "Register a user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "User registered",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/AuthTokens" },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Auth"],
        summary: "Login user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Login successful",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/AuthTokens" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Auth"],
        summary: "Refresh auth tokens",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RefreshRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Token refreshed",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/AuthTokens" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Get current user",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Current user",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/products": {
      get: {
        tags: ["Products"],
        summary: "List active products",
        responses: {
          200: {
            description: "Products fetched",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ProductListingItem" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/products/details-with-pricing/{publicId}": {
      get: {
        tags: ["Products"],
        summary: "Get public product details with pricing",
        parameters: [
          {
            name: "publicId",
            in: "path",
            required: true,
            schema: { type: "integer", minimum: 1 },
          },
        ],
        responses: {
          200: {
            description: "Product details with pricing fetched",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ProductDetailsWithPricing" },
              },
            },
          },
        },
      },
    },
    "/api/products/{id}": {
      get: {
        tags: ["Products"],
        summary: "Get product by id",
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          200: {
            description: "Product fetched",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/Product" },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/ValidationError" },
        },
      },
    },
    "/api/uploads/image": {
      post: {
        tags: ["Uploads"],
        summary: "Upload an image",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["image"],
                properties: {
                  image: {
                    type: "string",
                    format: "binary",
                  },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Image uploaded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/customizations": {
      post: {
        tags: ["Customizations"],
        summary: "Create a customization",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateCustomizationRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "Customization created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/cart": {
      get: {
        tags: ["Cart"],
        summary: "Get current cart",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Cart fetched",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/Cart" },
                  },
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Cart"],
        summary: "Clear current cart",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Cart cleared",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/cart/items": {
      post: {
        tags: ["Cart"],
        summary: "Add item to cart",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AddCartItemRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "Cart item added",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/cart/items/{id}": {
      patch: {
        tags: ["Cart"],
        summary: "Update cart item quantity",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UpdateCartItemRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Cart item updated",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Cart"],
        summary: "Remove cart item",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          200: {
            description: "Cart item removed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/addresses": {
      get: {
        tags: ["Addresses"],
        summary: "List user addresses",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Addresses fetched",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Address" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Addresses"],
        summary: "Create a new address",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateAddressRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "Address created",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/orders": {
      get: {
        tags: ["Orders"],
        summary: "List current user's orders",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Orders fetched",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Order" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Orders"],
        summary: "Create a new order from cart",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/CreateOrderRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "Order created",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/Order" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/orders/{id}": {
      get: {
        tags: ["Orders"],
        summary: "Get order by id",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          200: {
            description: "Order fetched",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/Order" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/orders/{id}/verify-payment": {
      post: {
        tags: ["Orders"],
        summary: "Verify Razorpay checkout success for an order",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/VerifyOrderPaymentRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Payment verified",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/Order" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/payments/razorpay/webhook": {
      post: {
        tags: ["Orders"],
        summary: "Receive Razorpay webhook events",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                additionalProperties: true,
              },
            },
          },
        },
        responses: {
          200: {
            description: "Webhook processed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SuccessEnvelope" },
              },
            },
          },
        },
      },
    },
    "/api/admin/insights": {
      get: {
        tags: ["Admin"],
        summary: "Get admin analytics and dashboard insights",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Insights fetched",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/Insights" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/admin/login": {
      post: {
        tags: ["Admin"],
        summary: "Login as admin",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AdminLoginRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Admin login successful",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/AuthTokens" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/Unauthorized" },
        },
      },
    },
    "/api/admin/me": {
      get: {
        tags: ["Admin"],
        summary: "Get current admin profile",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Admin profile fetched",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/admin/orders": {
      get: {
        tags: ["Admin"],
        summary: "List orders for admin",
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "status",
            in: "query",
            schema: {
              type: "string",
              enum: ["ALL", "PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"],
            },
          },
          {
            name: "search",
            in: "query",
            schema: { type: "string" },
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "limit",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 50, default: 10 },
          },
        ],
        responses: {
          200: {
            description: "Admin orders fetched",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        items: {
                          type: "array",
                          items: { $ref: "#/components/schemas/Order" },
                        },
                        pagination: {
                          type: "object",
                          properties: {
                            page: { type: "integer" },
                            limit: { type: "integer" },
                            totalItems: { type: "integer" },
                            totalPages: { type: "integer" },
                            hasNextPage: { type: "boolean" },
                            hasPreviousPage: { type: "boolean" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/admin/orders/{id}": {
      get: {
        tags: ["Admin"],
        summary: "Get admin order detail",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        responses: {
          200: {
            description: "Admin order fetched",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/Order" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/admin/orders/{id}/status": {
      patch: {
        tags: ["Admin"],
        summary: "Update order status",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AdminOrderStatusRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Order status updated",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/Order" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/admin/products": {
      get: {
        tags: ["Admin"],
        summary: "List products for admin",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Admin products fetched",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ProductAdmin" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Admin"],
        summary: "Create a product",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AdminProductRequest" },
            },
          },
        },
        responses: {
          201: {
            description: "Product created",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/Product" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/admin/products/{id}": {
      patch: {
        tags: ["Admin"],
        summary: "Update a product",
        security: [{ bearerAuth: [] }],
        parameters: [{ $ref: "#/components/parameters/UuidId" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/AdminProductRequest" },
            },
          },
        },
        responses: {
          200: {
            description: "Product updated",
            content: {
              "application/json": {
                schema: {
                  allOf: [{ $ref: "#/components/schemas/SuccessEnvelope" }],
                  properties: {
                    data: { $ref: "#/components/schemas/Product" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

module.exports = openApiDocument;
