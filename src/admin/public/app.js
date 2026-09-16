const DOCUMENT_TYPES = ["AI", "EPS", "JPG", "JPEG", "PDF", "PSD", "PNG", "TIF", "TIFF"];

const defaultProductConfig = () => ({
  attributes: [],
  pricing: {
    priceType: "Flat",
    replaceExistingRules: true,
  },
  pricingRules: [],
  addons: [],
  uploadConfig: {
    isUploadMandatory: false,
    minUploads: 0,
    maxUploads: 0,
    allowCustomerQuantity: false,
    minOrderQuantity: 1,
    maxOrderQuantity: 10,
    showDescriptionBox: false,
    descriptionRequired: false,
    descriptionFieldLabel: "Description / Instructions",
    descriptionPlaceholder: "Add any notes for production (optional)",
    allowedDocumentTypes: [],
    infoItems: [],
  },
});

const state = {
  token: localStorage.getItem("signque_admin_token") || "",
  refreshToken: localStorage.getItem("signque_admin_refresh_token") || "",
  admin: null,
  orders: [],
  pagination: {
    page: 1,
    limit: 10,
    totalItems: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
  products: [],
  insights: null,
  loadedViews: {
    orders: false,
    overview: false,
    products: false,
    conversations: false,
    "test-chat": false,
    "agent-settings": false,
  },
  conversations: [],
  conversationStatusFilter: "ALL",
  selectedConversationId: null,
  agentSettings: null,
  testChatConversationId: localStorage.getItem("signque_test_chat_conversation_id") || null,
  productSearch: "",
  activeProductStep: "basic",
  refreshPromise: null,
  selectedAttributeIndex: -1,
  productConfig: defaultProductConfig(),
};

const authScreen = document.getElementById("auth-screen");
const appShell = document.getElementById("app-shell");
const sidebar = document.getElementById("sidebar");
const sidebarToggle = document.getElementById("sidebar-toggle");
const loginForm = document.getElementById("login-form");
const authMessage = document.getElementById("auth-message");
const feedback = document.getElementById("feedback");
const pageTitle = document.getElementById("page-title");
const pageDescription = document.getElementById("page-description");
const views = Array.from(document.querySelectorAll(".view"));
const navLinks = Array.from(document.querySelectorAll(".nav-link"));
const productStepNav = document.getElementById("product-step-nav");
const productStepButtons = Array.from(document.querySelectorAll("[data-step-target]"));
const productSteps = Array.from(document.querySelectorAll("[data-config-step]"));
const metricsGrid = document.getElementById("metrics-grid");
const salesChart = document.getElementById("sales-chart");
const statusBreakdown = document.getElementById("status-breakdown");
const ordersSummary = document.getElementById("orders-summary");
const ordersTableBody = document.getElementById("orders-table-body");
const productsGrid = document.getElementById("products-grid");
const productSearchInput = document.getElementById("product-search");
const newProductButton = document.getElementById("new-product-button");
const orderDetailPanel = document.getElementById("order-detail-panel");
const orderSearchInput = document.getElementById("order-search");
const orderStatusFilter = document.getElementById("order-status-filter");
const orderPaymentFilter = document.getElementById("order-payment-filter");
const paginationLabel = document.getElementById("pagination-label");
const prevPageButton = document.getElementById("prev-page");
const nextPageButton = document.getElementById("next-page");
const productForm = document.getElementById("product-form");
const productFormTitle = document.getElementById("product-form-title");
const productImageInput = document.getElementById("product-image");
const productImageUploadInput = document.getElementById("product-image-upload");
const productImageStatus = document.getElementById("product-image-status");
const productImagePreview = document.getElementById("product-image-preview");
const attributeNameInput = document.getElementById("attribute-name-input");
const addAttributeButton = document.getElementById("add-attribute-button");
const attributeSelect = document.getElementById("attribute-select");
const attributeValueInput = document.getElementById("attribute-value-input");
const addAttributeValueButton = document.getElementById("add-attribute-value-button");
const pricingRelevantCheckbox = document.getElementById("pricing-relevant-checkbox");
const attributesList = document.getElementById("attributes-list");
const attributeValuesList = document.getElementById("attribute-values-list");
const priceTypeSelect = document.getElementById("price-type-select");
const pricingSummary = document.getElementById("pricing-summary");
const pricingHealth = document.getElementById("pricing-health");
const pricingRulesList = document.getElementById("pricing-rules-list");
const addPricingRuleButton = document.getElementById("add-pricing-rule-button");
const documentTypesList = document.getElementById("document-types-list");
const infoItemsList = document.getElementById("info-items-list");
const addInfoItemButton = document.getElementById("add-info-item-button");
const productConfigSummary = document.getElementById("product-config-summary");
const conversationStatusFilter = document.getElementById("conversation-status-filter");
const conversationSearchInput = document.getElementById("conversation-search");
const conversationsTableBody = document.getElementById("conversations-table-body");
const conversationDetailPanel = document.getElementById("conversation-detail-panel");
const agentSettingsForm = document.getElementById("agent-settings-form");
const testChatThread = document.getElementById("test-chat-thread");
const testChatUsageSummary = document.getElementById("test-chat-usage-summary");
const testChatForm = document.getElementById("test-chat-form");
const testChatInput = document.getElementById("test-chat-input");
const testChatResetButton = document.getElementById("test-chat-reset");

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateOnly(value) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getAdminRoute() {
  const path = window.location.pathname.replace(/\/+$/, "");
  const detailMatch = path.match(/\/admin\/orders\/([^/]+)$/);

  if (detailMatch) {
    return {
      view: "order-detail",
      orderId: detailMatch[1],
      page: Number(new URLSearchParams(window.location.search).get("page") || 1),
    };
  }

  return {
    view: "orders",
    orderId: null,
    page: Number(new URLSearchParams(window.location.search).get("page") || 1),
  };
}

function buildOrdersPageUrl(page = state.pagination.page) {
  const safePage = Math.max(Number(page) || 1, 1);
  return safePage > 1 ? `/admin?page=${safePage}` : "/admin";
}

function buildOrderDetailUrl(orderId, page = state.pagination.page) {
  const safePage = Math.max(Number(page) || 1, 1);
  return `/admin/orders/${orderId}?page=${safePage}`;
}

function showAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.classList.remove("hidden", "error");
  if (isError) {
    authMessage.classList.add("error");
  }
}

function showFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.remove("hidden", "error");
  if (isError) {
    feedback.classList.add("error");
  }
}

function clearFeedback() {
  feedback.classList.add("hidden");
  feedback.classList.remove("error");
  feedback.textContent = "";
}

function persistAdminSession(accessToken, refreshToken = state.refreshToken) {
  state.token = accessToken || "";
  state.refreshToken = refreshToken || "";

  if (state.token) {
    localStorage.setItem("signque_admin_token", state.token);
  } else {
    localStorage.removeItem("signque_admin_token");
  }

  if (state.refreshToken) {
    localStorage.setItem("signque_admin_refresh_token", state.refreshToken);
  } else {
    localStorage.removeItem("signque_admin_refresh_token");
  }
}

async function refreshAdminSession() {
  if (!state.refreshToken) {
    throw new Error("Admin session expired. Please log in again.");
  }

  if (!state.refreshPromise) {
    state.refreshPromise = (async () => {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refreshToken: state.refreshToken,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.data?.accessToken || !payload?.data?.refreshToken) {
        throw new Error(payload?.message || "Admin session expired. Please log in again.");
      }

      persistAdminSession(payload.data.accessToken, payload.data.refreshToken);
      return payload.data;
    })().finally(() => {
      state.refreshPromise = null;
    });
  }

  return state.refreshPromise;
}

async function request(url, options = {}, retryOnAuthError = true) {
  const headers = {
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const authError =
      response.status === 401 &&
      retryOnAuthError &&
      payload?.message === "Invalid or expired token" &&
      state.refreshToken;

    if (authError) {
      await refreshAdminSession();
      return request(url, options, false);
    }

    throw new Error(payload?.message || "Request failed");
  }

  return payload.data;
}

async function uploadProductImage(file) {
  const formData = new FormData();
  formData.append("image", file);
  return request("/api/uploads/image", {
    method: "POST",
    body: formData,
  });
}

function setAuthenticated(authenticated) {
  authScreen.classList.toggle("hidden", authenticated);
  appShell.classList.toggle("hidden", !authenticated);
}

function setSidebarOpen(isOpen) {
  sidebar.classList.toggle("collapsed", !isOpen);
  appShell.classList.toggle("sidebar-open", isOpen);
}

function setView(viewName) {
  const titles = {
    orders: "Orders",
    "order-detail": "Order Detail",
    overview: "Insights",
    products: "Products",
    "product-form": "Product Configuration",
    conversations: "Conversations",
    "test-chat": "Test Chat",
    "agent-settings": "Agent Settings",
  };
  const descriptions = {
    orders: "Track incoming orders, filter the queue, and open complete order details without leaving the page.",
    "order-detail": "",
    overview: "Review sales performance and order distribution with a quick operational summary.",
    products: "Monitor catalog status, pricing, and product readiness for the storefront.",
    "product-form": "Create or update a product in one continuous configuration form.",
    conversations: "See exactly what the WhatsApp AI agent is saying to customers, and step in when needed.",
    "test-chat": "Chat with the AI agent yourself to test its replies before customers do.",
    "agent-settings": "Edit the AI agent's business info, tone, and instructions without a code change.",
  };

  views.forEach((view) => {
    view.classList.toggle("active", view.dataset.view === viewName);
  });

  navLinks.forEach((button) => {
    button.classList.toggle("active", button.dataset.viewTarget === viewName);
  });

  pageTitle.textContent = titles[viewName] || "Admin";
  pageDescription.textContent = descriptions[viewName] || "Manage the admin console.";
}

function setProductStep(stepName) {
  state.activeProductStep = stepName;

  productSteps.forEach((section) => {
    section.classList.toggle("active", section.dataset.configStep === stepName);
  });

  productStepButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.stepTarget === stepName);
  });
}

function getPricingAttributes() {
  return state.productConfig.attributes.filter((attribute) => attribute.PricingRelevant);
}

function renderProductImagePreview(url, fileName = "Product image") {
  if (!url) {
    productImagePreview.classList.add("hidden");
    productImagePreview.innerHTML = "";
    productImageStatus.textContent = "Upload the main image that should represent this product.";
    return;
  }

  productImagePreview.classList.remove("hidden");
  productImagePreview.innerHTML = `
    <img src="${escapeHtml(url)}" alt="${escapeHtml(fileName)}" />
    <div class="image-preview-copy">
      <strong>${escapeHtml(fileName)}</strong>
      <a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">Open uploaded image</a>
    </div>
  `;
  productImageStatus.textContent = "Main product image uploaded successfully.";
}

function renderAttributesSection() {
  renderProductConfigSummary();
  const attributes = state.productConfig.attributes;

  attributesList.innerHTML = attributes.length
    ? attributes
        .map(
          (attribute, index) => `
            <div class="stack-item ${index === state.selectedAttributeIndex ? "selected" : ""}">
              <div>
                <strong>${attribute.AttributeName}</strong>
                <div class="muted">${attribute.Values.length} values | ${attribute.PricingRelevant ? "Pricing" : "Non-pricing"}</div>
              </div>
              <div class="row-actions">
                <button type="button" class="ghost-button small-button" data-attribute-pick="${index}">Edit</button>
                <button type="button" class="ghost-button small-button" data-attribute-remove="${index}">Remove</button>
              </div>
            </div>
          `
        )
        .join("")
    : '<div class="muted">No attributes added.</div>';

  attributeSelect.innerHTML = `
    <option value="">Select attribute</option>
    ${attributes
      .map(
        (attribute, index) =>
          `<option value="${index}" ${index === state.selectedAttributeIndex ? "selected" : ""}>${attribute.AttributeName}</option>`
      )
      .join("")}
  `;

  const selectedAttribute = attributes[state.selectedAttributeIndex];
  pricingRelevantCheckbox.checked = Boolean(selectedAttribute?.PricingRelevant);

  attributeValuesList.innerHTML = selectedAttribute
    ? selectedAttribute.Values.length
      ? selectedAttribute.Values
          .map(
            (value, valueIndex) => `
              <div class="value-chip">
                <span>${value}</span>
                <button type="button" data-attribute-value-remove="${valueIndex}" class="chip-remove">x</button>
              </div>
            `
          )
          .join("")
      : '<div class="muted">No values added for this attribute yet.</div>'
    : '<div class="muted">Select an attribute to add values.</div>';
}

function renderPricingSection() {
  renderProductConfigSummary();
  const pricingAttributes = getPricingAttributes();
  const nonPricingCount = state.productConfig.attributes.length - pricingAttributes.length;

  pricingSummary.innerHTML = `Pricing attributes: ${pricingAttributes.length} | Non-pricing attributes: ${nonPricingCount}`;

  const hasRule = state.productConfig.pricingRules.some(
    (rule) => rule.Conditions.length > 0 && Number(rule.Price) >= 0
  );

  pricingHealth.innerHTML = `
    <div class="${pricingAttributes.length ? "pass" : "fail"}">${pricingAttributes.length ? "PASS" : "FAIL"}: Pricing attributes available</div>
    <div class="pass">PASS: Price type configured</div>
    <div class="pass">PASS: Upload linkage valid</div>
    <div class="${hasRule || pricingAttributes.length === 0 ? "pass" : "fail"}">${
      hasRule || pricingAttributes.length === 0 ? "PASS" : "FAIL"
    }: At least one complete pricing rule</div>
  `;

  priceTypeSelect.value = state.productConfig.pricing.priceType || "Flat";

  pricingRulesList.innerHTML = state.productConfig.pricingRules.length
    ? state.productConfig.pricingRules
        .map((rule, ruleIndex) => {
          const selectedCondition = rule.Conditions[0] || { AttributeName: "", ValueName: "" };
          const selectedAttribute = pricingAttributes.find(
            (attribute) => attribute.AttributeName === selectedCondition.AttributeName
          );

          return `
            <div class="stack-item rule-card">
              <div class="rule-grid">
                <div>
                  <label>
                    <span>Attribute</span>
                    <select data-rule-attribute="${ruleIndex}">
                      <option value="">Attribute</option>
                      ${pricingAttributes
                        .map(
                          (attribute) =>
                            `<option value="${attribute.AttributeName}" ${
                              attribute.AttributeName === selectedCondition.AttributeName ? "selected" : ""
                            }>${attribute.AttributeName}</option>`
                        )
                        .join("")}
                    </select>
                  </label>
                </div>
                <div>
                  <label>
                    <span>Value</span>
                    <select data-rule-value="${ruleIndex}">
                      <option value="">Value</option>
                      ${(selectedAttribute?.Values || [])
                        .map(
                          (value) =>
                            `<option value="${value}" ${value === selectedCondition.ValueName ? "selected" : ""}>${value}</option>`
                        )
                        .join("")}
                    </select>
                  </label>
                </div>
                <div>
                  <label>
                    <span>Price</span>
                    <input type="number" min="0" step="0.01" value="${rule.Price ?? ""}" data-rule-price="${ruleIndex}" />
                  </label>
                </div>
                <div>
                  <label>
                    <span>Priority</span>
                    <input type="number" min="1" value="${rule.Priority ?? 1}" data-rule-priority="${ruleIndex}" />
                  </label>
                </div>
              </div>
              <div class="rule-meta">
                <div class="muted">
                  Rule Name (auto): ${
                    selectedCondition.AttributeName && selectedCondition.ValueName
                      ? `${selectedCondition.AttributeName} - ${selectedCondition.ValueName}`
                      : "Select at least one attribute and value"
                  }
                </div>
                <button type="button" class="ghost-button small-button" data-rule-remove="${ruleIndex}">Remove</button>
              </div>
            </div>
          `;
        })
        .join("")
    : '<div class="muted">No pricing rules added yet. Add one for pricing-relevant attributes.</div>';
}

function renderUploadPolicySection() {
  renderProductConfigSummary();
  const config = state.productConfig.uploadConfig;

  document.querySelector(`input[name="upload-mandatory"][value="${String(config.isUploadMandatory)}"]`).checked = true;
  document.getElementById("min-uploads-input").value = config.minUploads;
  document.getElementById("max-uploads-input").value = config.maxUploads;
  document.getElementById("allow-customer-quantity-checkbox").checked = config.allowCustomerQuantity;
  document.getElementById("min-order-quantity-input").value = config.minOrderQuantity;
  document.getElementById("max-order-quantity-input").value = config.maxOrderQuantity;
  document.getElementById("show-description-box-checkbox").checked = config.showDescriptionBox;
  document.getElementById("description-required-checkbox").checked = config.descriptionRequired;
  document.getElementById("description-field-label-input").value = config.descriptionFieldLabel || "";
  document.getElementById("description-placeholder-input").value = config.descriptionPlaceholder || "";

  documentTypesList.innerHTML = DOCUMENT_TYPES.map(
    (type) => `
      <label class="chip-check">
        <input type="checkbox" value="${type}" ${config.allowedDocumentTypes.includes(type) ? "checked" : ""} data-document-type />
        <span>${type}</span>
      </label>
    `
  ).join("");

  infoItemsList.innerHTML = config.infoItems.length
    ? config.infoItems
        .map(
          (item, index) => `
            <div class="stack-item rule-card">
              <div class="rule-grid info-grid">
                <label>
                  <span>Title</span>
                  <input value="${item.title || ""}" data-info-title="${index}" />
                </label>
                <label>
                  <span>Value</span>
                  <input value="${item.value || ""}" data-info-value="${index}" />
                </label>
                <label>
                  <span>Sort Order</span>
                  <input type="number" min="1" value="${item.sortOrder || 1}" data-info-order="${index}" />
                </label>
              </div>
              <div class="align-right">
                <button type="button" class="ghost-button small-button" data-info-remove="${index}">Remove</button>
              </div>
            </div>
          `
        )
        .join("")
    : '<div class="muted">No info items added yet.</div>';
}

function renderProductConfiguration() {
  renderAttributesSection();
  renderPricingSection();
  renderUploadPolicySection();
}

function renderProductConfigSummary() {
  const pricingAttributes = getPricingAttributes().length;
  const infoItems = state.productConfig.uploadConfig.infoItems.length;
  const allowedTypes = state.productConfig.uploadConfig.allowedDocumentTypes.length;
  const summary = [
    ["Attributes", state.productConfig.attributes.length],
    ["Pricing Rules", state.productConfig.pricingRules.length],
    ["Pricing Attributes", pricingAttributes],
    ["Allowed File Types", allowedTypes],
    ["Info Items", infoItems],
  ];

  productConfigSummary.innerHTML = summary
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <span class="muted">${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
}

function readUploadConfigFromForm() {
  state.productConfig.uploadConfig = {
    ...state.productConfig.uploadConfig,
    isUploadMandatory:
      document.querySelector('input[name="upload-mandatory"]:checked')?.value === "true",
    minUploads: Number(document.getElementById("min-uploads-input").value || 0),
    maxUploads: Number(document.getElementById("max-uploads-input").value || 0),
    allowCustomerQuantity: document.getElementById("allow-customer-quantity-checkbox").checked,
    minOrderQuantity: Number(document.getElementById("min-order-quantity-input").value || 1),
    maxOrderQuantity: Number(document.getElementById("max-order-quantity-input").value || 10),
    showDescriptionBox: document.getElementById("show-description-box-checkbox").checked,
    descriptionRequired: document.getElementById("description-required-checkbox").checked,
    descriptionFieldLabel: document.getElementById("description-field-label-input").value.trim(),
    descriptionPlaceholder: document.getElementById("description-placeholder-input").value.trim(),
    allowedDocumentTypes: Array.from(document.querySelectorAll("[data-document-type]:checked")).map(
      (input) => input.value
    ),
    infoItems: state.productConfig.uploadConfig.infoItems,
  };
}

function buildProductPayload() {
  readUploadConfigFromForm();

  const title = document.getElementById("product-title").value.trim();
  const basePrice = Number(document.getElementById("product-price").value);
  const imageUrl = productImageInput.value.trim();
  const description = document.getElementById("product-description").value.trim();

  if (!title) {
    throw new Error("Product title is required before saving configuration.");
  }

  if (!Number.isFinite(basePrice) || basePrice <= 0) {
    throw new Error("Base price must be greater than 0 before saving configuration.");
  }

  return {
    title,
    basePrice,
    imageUrl,
    description,
    detailImages: [],
    attributes: state.productConfig.attributes,
    pricing: state.productConfig.pricing,
    pricingRules: state.productConfig.pricingRules,
    addons: state.productConfig.addons,
    uploadConfig: state.productConfig.uploadConfig,
    isActive: document.getElementById("product-active").checked,
  };
}

async function saveCurrentProduct(successMessage) {
  const productId = document.getElementById("product-id").value;
  const payload = buildProductPayload();

  const savedProduct = await request(productId ? `/api/admin/products/${productId}` : "/api/admin/products", {
    method: productId ? "PATCH" : "POST",
    body: JSON.stringify(payload),
  });

  if (!productId && savedProduct?.id) {
    document.getElementById("product-id").value = savedProduct.id;
    productFormTitle.textContent = `Edit Product: ${savedProduct.title}`;
  }

  state.productConfig = {
    ...cloneConfig(state.productConfig),
    attributes: savedProduct.attributes || state.productConfig.attributes,
    pricing: savedProduct.pricing || state.productConfig.pricing,
    pricingRules: savedProduct.pricingRules || state.productConfig.pricingRules,
    addons: savedProduct.addons || state.productConfig.addons,
    uploadConfig: savedProduct.uploadConfig || state.productConfig.uploadConfig,
  };

  if (state.loadedViews.products) {
    await loadProducts();
  }

  if (state.loadedViews.overview) {
    await loadInsights();
  }

  showFeedback(successMessage);
  return savedProduct;
}

function renderMetrics() {
  const metrics = state.insights?.metrics;

  if (!metrics) {
    metricsGrid.innerHTML = "";
    return;
  }

  const cards = [
    ["Total Revenue", formatCurrency(metrics.totalRevenue)],
    ["Orders", metrics.orderCount],
    ["Average Order", formatCurrency(metrics.averageOrderValue)],
    ["Active Products", `${metrics.activeProductCount}/${metrics.productCount}`],
  ];

  metricsGrid.innerHTML = cards
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span class="muted">${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
}

function renderSalesChart() {
  const rows = state.insights?.salesByDay || [];
  const maxRevenue = Math.max(...rows.map((row) => row.revenue), 1);

  salesChart.innerHTML = rows.length
    ? rows
        .map((row) => {
          const height = Math.max((row.revenue / maxRevenue) * 180, 10);
          return `
            <div class="bar">
              <strong>${formatCurrency(row.revenue)}</strong>
              <div class="bar-visual" style="height:${height}px"></div>
              <label class="muted">${row.date.slice(5)}</label>
            </div>
          `;
        })
        .join("")
    : '<p class="muted">No order activity in the last 7 days yet.</p>';
}

function renderStatusBreakdown() {
  const rows = state.insights?.orderStatusBreakdown || [];
  statusBreakdown.innerHTML = rows.length
    ? rows
        .map(
          (row) => `
            <div class="status-row">
              <div class="detail-header">
                <strong>${row.status}</strong>
                <span class="muted">${row.count} orders</span>
              </div>
              <span class="status-pill ${row.status}">${row.status}</span>
            </div>
          `
        )
        .join("")
    : '<p class="muted">No order status data available.</p>';
}

function renderOrdersSummary() {
  const totalRevenue = state.orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
  const pendingCount = state.orders.filter((order) => order.status === "PENDING").length;
  const deliveredCount = state.orders.filter((order) => order.status === "DELIVERED").length;
  const summary = [
    ["Orders on this page", state.orders.length],
    ["Page revenue", formatCurrency(totalRevenue)],
    ["Pending", pendingCount],
    ["Delivered", deliveredCount],
  ];

  ordersSummary.innerHTML = summary
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <span class="muted">${label}</span>
          <strong>${value}</strong>
        </article>
      `
    )
    .join("");
}

function renderOrders() {
  renderOrdersSummary();
  const filteredOrders = state.orders.filter((order) => {
    const paymentMethod = order.payments?.[0]?.method || "UNKNOWN";
    return orderPaymentFilter.value === "ALL" || paymentMethod === orderPaymentFilter.value;
  });

  ordersTableBody.innerHTML = filteredOrders.length
    ? filteredOrders
        .map((order) => {
          const payment = order.payments[0];
          return `
            <tr data-order-open="${order.id}">
              <td>
                <strong class="order-id">${order.orderNumber}</strong>
              </td>
              <td>${formatDateOnly(order.createdAt)}</td>
              <td>${formatCurrency(order.totalAmount)}</td>
              <td>
                <strong>${payment?.method === "CARD" ? "Credit Card" : payment?.method || "-"}</strong>
              </td>
              <td><span class="status-pill ${order.status}">${payment?.status === "FAILED" ? "Failed" : order.status}</span></td>
            </tr>
          `;
        })
        .join("")
    : `
      <tr>
        <td colspan="5" class="muted">No orders matched your current filters.</td>
      </tr>
    `;

  paginationLabel.textContent = `Page ${state.pagination.page} of ${state.pagination.totalPages} | ${state.pagination.totalItems} total orders`;
  prevPageButton.disabled = !state.pagination.hasPreviousPage;
  nextPageButton.disabled = !state.pagination.hasNextPage;
}

function renderProducts() {
  const filteredProducts = state.products.filter((product) => {
    const searchValue = state.productSearch.trim().toLowerCase();

    if (!searchValue) {
      return true;
    }

    return (
      String(product.publicId || "").toLowerCase().includes(searchValue) ||
      String(product.title || "").toLowerCase().includes(searchValue) ||
      String(product.description || "").toLowerCase().includes(searchValue)
    );
  });

  productsGrid.innerHTML = filteredProducts.length
    ? filteredProducts
    .map(
      (product) => `
        <article class="product-row">
          <div class="product-row-main">
            <div class="product-thumb">
              ${
                product.imageUrl
                  ? `<img src="${product.imageUrl}" alt="${product.title}" />`
                  : `<span>IMG</span>`
              }
            </div>
            <div class="product-copy">
              <div class="product-row-title">
                <strong>${product.title}</strong>
                <span>#${product.publicId}</span>
              </div>
              <p class="muted">${product.description || "No description added yet."}</p>
            </div>
          </div>

          <div class="product-pill-cell">
            <span class="product-pill">Dedicated Mode</span>
          </div>

          <div class="product-listing-cell">Draft Listing</div>

          <div class="product-status-cell">
            <span class="product-enabled-pill ${product.isActive ? "active" : "inactive"}">
              <span class="dot"></span>
              ${product.isActive ? "Enabled" : "Disabled"}
            </span>
          </div>

          <div class="product-actions-cell">
            <button class="ghost-button product-action-button" data-product-edit="${product.id}">Edit</button>
            <button class="ghost-button product-action-button product-delete-button" data-product-toggle="${product.id}" data-next-active="${String(!product.isActive)}">
              ${product.isActive ? "Disable" : "Delete"}
            </button>
          </div>
        </article>
      `
    )
    .join("")
    : '<div class="muted">No products matched your search.</div>';
}

function renderOrderDetail(order) {
  const payment = order.payments?.[0] || null;
  const shippingLabel = Number(order.shippingFee || 0) > 0 ? formatCurrency(order.shippingFee) : "Free";
  const addressLine = `${order.address.line1}, ${order.address.line2 ? `${order.address.line2}, ` : ""}${order.address.city}, ${order.address.state} ${order.address.postalCode}, ${order.address.country}`;
  const deliveryLabel = order.status === "DELIVERED" ? "Delivered" : order.status === "SHIPPED" ? "In Transit" : "Delivery";
  const previousOrdersMarkup = order.previousOrders?.length
    ? order.previousOrders
        .map(
          (previousOrder) => `
            <button class="previous-order-row" data-previous-order-open="${previousOrder.id}">
              <div>
                <strong>${previousOrder.orderNumber}</strong>
                <div class="muted">${formatDate(previousOrder.createdAt)}</div>
              </div>
              <div class="previous-order-meta">
                <span class="status-pill ${previousOrder.status}">${previousOrder.status}</span>
                <strong>${formatCurrency(previousOrder.totalAmount)}</strong>
              </div>
            </button>
          `
        )
        .join("")
    : '<div class="muted">No previous orders for this customer.</div>';

  orderDetailPanel.innerHTML = `
    <div class="detail-shell">
      <div class="detail-topline">
        <button class="detail-back" data-close-order-detail="true">Back to Orders</button>
        <div class="detail-order-title">Order ${order.orderNumber}</div>
      </div>

      <div class="detail-tabs">
        <button class="detail-tab active" data-detail-tab="current">Current Order</button>
        <button class="detail-tab" data-detail-tab="previous">Previous Orders</button>
      </div>

      <div class="detail-tab-panel active" data-detail-panel="current">
        <div class="detail-main-grid">
        <div class="detail-stack">
          <section class="detail-card">
            <div class="detail-card-head">
              <h3>Order Status</h3>
              <div class="detail-metrics">
                <select id="order-status-update" class="detail-status-select">
                  ${["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]
                    .map(
                      (status) =>
                        `<option value="${status}" ${status === order.status ? "selected" : ""}>${status.charAt(0)}${status
                          .slice(1)
                          .toLowerCase()}</option>`
                    )
                    .join("")}
                </select>
                <button id="save-order-status" class="primary-button" data-order-id="${order.id}">Save</button>
              </div>
            </div>

            <div class="detail-facts">
              <div class="detail-fact">
                <span>Order Date</span>
                <strong>${formatDate(order.createdAt)}</strong>
              </div>
              <div class="detail-fact">
                <span>Total Amount</span>
                <strong>${formatCurrency(order.totalAmount)}</strong>
              </div>
            </div>

            <div class="delivery-panel">
              <span>Delivery Type</span>
              <strong>${deliveryLabel}</strong>
            </div>
          </section>

          <section class="detail-card">
            <h3>Billing Address</h3>
            <div class="detail-list">
              <div class="detail-list-row">
                <strong>${order.address.fullName}</strong>
                <span class="muted">${order.address.phone}</span>
              </div>
              <div class="detail-list-row">
                <span class="muted">${addressLine}</span>
              </div>
            </div>
          </section>

          <section class="detail-card">
            <h3>Items</h3>
            ${order.items
              .map(
                (item) => `
                  <div class="line-item">
                    <div>
                      <strong>${item.productName}</strong>
                      <div class="muted">Qty ${item.quantity}${item.customization?.notes ? ` | ${item.customization.notes}` : ""}</div>
                      ${
                        item.customization?.uploadedImageUrl
                          ? `<a class="detail-download-link" href="${item.customization.uploadedImageUrl}" target="_blank" download rel="noreferrer">Download Uploaded Document</a>`
                          : ""
                      }
                    </div>
                    <div>
                      <strong>${formatCurrency(item.lineTotal)}</strong>
                      <div class="muted">${formatCurrency(item.unitPrice)} each</div>
                    </div>
                  </div>
                `
              )
              .join("")}
          </section>
        </div>

        <div class="detail-stack">
          <section class="detail-side-card">
            <h3>Order Summary</h3>
            <div class="summary-line">
              <span class="muted">Subtotal</span>
              <strong>${formatCurrency(order.subtotal)}</strong>
            </div>
            <div class="summary-line">
              <span class="muted">Shipping</span>
              <strong>${shippingLabel}</strong>
            </div>
            <div class="summary-line total">
              <span>Total</span>
              <strong>${formatCurrency(order.totalAmount)}</strong>
            </div>
          </section>

          <section class="detail-side-card">
            <h3>Shipment</h3>
            <div class="detail-list">
              <div class="detail-list-row">
                <span class="muted">Status</span>
                <strong>${order.status}</strong>
              </div>
              <div class="detail-list-row">
                <span class="muted">Payment</span>
                <strong>${payment?.method === "CARD" ? "Credit Card" : payment?.method || "N/A"}</strong>
              </div>
              <div class="detail-list-row">
                <span class="muted">Payment State</span>
                <strong>${payment?.status || "N/A"}</strong>
              </div>
              <div class="detail-list-row">
                <span class="muted">Customer</span>
                <strong>${order.user.name}</strong>
                <span class="muted">${order.user.email}${order.user.phone ? ` | ${order.user.phone}` : ""}</span>
              </div>
              ${
                payment?.transactionRef
                  ? `<div class="detail-list-row"><span class="muted">Reference</span><strong>${payment.transactionRef}</strong></div>`
                  : ""
              }
            </div>
          </section>
        </div>
        </div>
      </div>

      <div class="detail-tab-panel" data-detail-panel="previous">
        <section class="detail-card">
          <h3>Previous Orders</h3>
          <div class="previous-orders-list">
            ${previousOrdersMarkup}
          </div>
        </section>
      </div>
    </div>
  `;
}

async function loadAdminProfile() {
  state.admin = await request("/api/admin/me");
}

async function loadInsights() {
  state.insights = await request("/api/admin/insights");
  renderMetrics();
  renderSalesChart();
  renderStatusBreakdown();
}

async function loadOrders(page = state.pagination.page) {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(state.pagination.limit),
    status: orderStatusFilter.value || "ALL",
  });

  if (orderSearchInput.value.trim()) {
    params.set("search", orderSearchInput.value.trim());
  }

  const data = await request(`/api/admin/orders?${params.toString()}`);
  state.orders = data.items;
  state.pagination = data.pagination;
  renderOrders();
}

async function loadProducts() {
  state.products = await request("/api/admin/products");
  renderProducts();
}

function formatStatusLabel(status) {
  return String(status || "")
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

function renderConversationsList() {
  conversationsTableBody.innerHTML = state.conversations.length
    ? state.conversations
        .map(
          (conversation) => `
            <tr data-conversation-open="${conversation.id}" class="${conversation.id === state.selectedConversationId ? "selected" : ""} ${conversation.status === "HUMAN_HANDOFF" ? "needs-attention" : ""}">
              <td>${escapeHtml(conversation.waProfileName || "Unknown")}</td>
              <td>${escapeHtml(conversation.waPhoneNumber)}</td>
              <td><span class="status-pill ${conversation.status}">${formatStatusLabel(conversation.status)}</span></td>
              <td>${conversation.lastInboundAt ? formatDate(conversation.lastInboundAt) : "-"}</td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="4" class="muted">No conversations yet.</td></tr>`;
}

async function loadConversations() {
  const params = new URLSearchParams({
    status: conversationStatusFilter.value || "ALL",
  });

  if (conversationSearchInput.value.trim()) {
    params.set("search", conversationSearchInput.value.trim());
  }

  const data = await request(`/api/admin/conversations?${params.toString()}`);
  state.conversations = data.items;
  renderConversationsList();
  renderHandoffBadge(data.summary?.handoffCount || 0);
}

function renderHandoffBadge(count) {
  const badge = document.getElementById("conversations-handoff-badge");

  if (!badge) {
    return;
  }

  badge.textContent = count > 99 ? "99+" : String(count);
  badge.title = `${count} conversation${count === 1 ? "" : "s"} waiting for staff`;
  badge.classList.toggle("hidden", count === 0);
}

async function refreshHandoffCount() {
  try {
    const data = await request("/api/admin/conversations?status=HUMAN_HANDOFF&limit=1");
    renderHandoffBadge(data.summary?.handoffCount || 0);
  } catch (error) {
    // Background refresh only; the next poll or page load will retry.
  }
}

let handoffPollTimer = null;

function startHandoffPolling() {
  refreshHandoffCount();

  if (!handoffPollTimer) {
    handoffPollTimer = setInterval(refreshHandoffCount, 30000);
  }
}

function formatUsageMeta(message) {
  if (message.role !== "ASSISTANT" || message.totalTokens == null) {
    return "";
  }

  if (message.modelCalls === 0) {
    return " &middot; instant, no AI call";
  }

  const parts = [`${message.totalTokens.toLocaleString()} tokens`];

  if (message.modelCalls != null) {
    parts.push(`${message.modelCalls} ${message.modelCalls === 1 ? "call" : "calls"}`);
  }

  if (message.durationMs != null) {
    parts.push(`${(message.durationMs / 1000).toFixed(1)}s`);
  }

  return ` &middot; ${parts.join(" &middot; ")}`;
}

function renderMessageBubble(message) {
  const roleClass = message.role.toLowerCase();
  const alignment = message.direction === "INBOUND" ? "inbound" : "outbound";

  if (message.role === "TOOL") {
    return `<div class="message-bubble tool"><strong>${escapeHtml(message.toolName || "tool")}</strong><pre>${escapeHtml(message.content)}</pre></div>`;
  }

  const photo = message.mediaUrl
    ? `<a href="${escapeHtml(message.mediaUrl)}" target="_blank" rel="noopener"><img class="message-photo" src="${escapeHtml(message.mediaUrl)}" alt="Customer photo" loading="lazy" /></a>`
    : "";

  return `
    <div class="message-bubble ${roleClass} ${alignment}">
      <div class="message-meta">${message.role === "ADMIN" ? "Staff" : message.role === "ASSISTANT" ? "AI Agent" : "Customer"} &middot; ${formatDate(message.createdAt)}${formatUsageMeta(message)}</div>
      ${photo}
      <div class="message-content">${escapeHtml(message.content)}</div>
    </div>
  `;
}

function renderHandoffNotice(conversation) {
  if (conversation.status !== "HUMAN_HANDOFF") {
    return "";
  }

  const since = conversation.handoffAt ? ` &middot; ${formatDate(conversation.handoffAt)}` : "";

  return `
    <div class="conversation-notice handoff">
      <div><strong>Waiting for staff</strong>${since}</div>
      <div>${escapeHtml(conversation.handoffReason || "Taken over by staff")}</div>
      <div class="muted">The AI agent won't reply until you release this conversation.</div>
    </div>
  `;
}

function renderReplyArea(conversation) {
  if (conversation.serviceWindowOpen !== false) {
    return `
      <form id="conversation-reply-form" class="conversation-reply-form" data-conversation-id="${conversation.id}">
        <input id="conversation-reply-input" type="text" placeholder="Send a message as staff..." required />
        <button type="submit" class="primary-button">Send</button>
      </form>
    `;
  }

  const reengageAction = conversation.reengagementTemplateConfigured
    ? `<button type="button" class="primary-button small-button" data-conversation-reengage="${conversation.id}">Send re-engagement template</button>`
    : `<div class="muted">Set WHATSAPP_REENGAGEMENT_TEMPLATE on the server to re-open the chat with an approved template.</div>`;

  return `
    <div class="conversation-notice window-closed">
      <strong>24-hour window closed</strong>
      <div class="muted">WhatsApp only delivers free-form messages within 24 hours of the customer's last message. Send the approved template; you can reply normally once they respond.</div>
      ${reengageAction}
    </div>
  `;
}

function renderConversationDetail(conversation) {
  const isTakenOver = conversation.status === "HUMAN_HANDOFF";

  conversationDetailPanel.innerHTML = `
    <div class="conversation-detail-head">
      <div>
        <strong>${escapeHtml(conversation.waProfileName || "Unknown customer")}</strong>
        <div class="muted">${escapeHtml(conversation.waPhoneNumber)}</div>
      </div>
      <div class="row-actions">
        <span class="status-pill ${conversation.status}">${formatStatusLabel(conversation.status)}</span>
        ${
          isTakenOver
            ? `<button type="button" class="ghost-button small-button" data-conversation-release="${conversation.id}">Release to AI</button>`
            : `<button type="button" class="ghost-button small-button" data-conversation-takeover="${conversation.id}">Take Over</button>`
        }
      </div>
    </div>
    ${renderHandoffNotice(conversation)}
    <div class="message-thread">
      ${conversation.messages.map(renderMessageBubble).join("") || '<div class="muted">No messages yet.</div>'}
    </div>
    ${renderReplyArea(conversation)}
  `;

  conversationDetailPanel.querySelector(".message-thread")?.scrollTo({ top: 999999 });
}

async function loadConversationDetail(conversationId) {
  const conversation = await request(`/api/admin/conversations/${conversationId}`);
  state.selectedConversationId = conversationId;
  renderConversationsList();
  renderConversationDetail(conversation);
}

function renderTestChatUsageSummary(conversation) {
  const assistantMessages = (conversation?.messages || []).filter(
    (message) => message.role === "ASSISTANT" && message.totalTokens != null
  );

  if (assistantMessages.length === 0) {
    testChatUsageSummary.classList.add("hidden");
    testChatUsageSummary.textContent = "";
    return;
  }

  const totalTokens = assistantMessages.reduce((sum, m) => sum + (m.totalTokens || 0), 0);
  const totalDurationMs = assistantMessages.reduce((sum, m) => sum + (m.durationMs || 0), 0);
  const avgDurationS = totalDurationMs / assistantMessages.length / 1000;

  testChatUsageSummary.classList.remove("hidden");
  testChatUsageSummary.textContent = `Session total: ${totalTokens.toLocaleString()} tokens across ${assistantMessages.length} ${assistantMessages.length === 1 ? "reply" : "replies"} · avg ${avgDurationS.toFixed(1)}s per reply`;
}

function renderTestChatThread(conversation) {
  renderTestChatUsageSummary(conversation);

  if (!conversation || !conversation.messages || conversation.messages.length === 0) {
    testChatThread.innerHTML = '<div class="muted">Send a message below to start testing the agent.</div>';
    return;
  }

  const handoffNotice =
    conversation.status === "HUMAN_HANDOFF"
      ? `<div class="conversation-notice handoff"><strong>Agent handed off to staff</strong><div>${escapeHtml(conversation.handoffReason || "")}</div><div class="muted">It won't reply in this conversation any more. Click "New Conversation" to keep testing.</div></div>`
      : "";

  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const noReplyNotice =
    conversation.status !== "HUMAN_HANDOFF" && lastMessage?.role === "USER"
      ? '<div class="muted test-chat-no-reply">No reply sent. The agent stays quiet when a customer only acknowledges ("ok", "thanks") and nothing was asked.</div>'
      : "";

  testChatThread.innerHTML = conversation.messages.map(renderMessageBubble).join("") + handoffNotice + noReplyNotice;
  testChatThread.scrollTop = testChatThread.scrollHeight;
}

function setTestChatConversationId(conversationId) {
  state.testChatConversationId = conversationId || null;
  if (conversationId) {
    localStorage.setItem("signque_test_chat_conversation_id", conversationId);
  } else {
    localStorage.removeItem("signque_test_chat_conversation_id");
  }
}

async function loadTestChatHistory() {
  if (!state.testChatConversationId) {
    renderTestChatThread(null);
    return;
  }

  try {
    const conversation = await request(`/api/admin/conversations/${state.testChatConversationId}`);
    renderTestChatThread(conversation);
  } catch (error) {
    setTestChatConversationId(null);
    renderTestChatThread(null);
  }
}

async function sendTestChatMessage(message) {
  const conversation = await request("/api/admin/test-chat", {
    method: "POST",
    body: JSON.stringify({
      conversationId: state.testChatConversationId,
      message,
    }),
  });
  setTestChatConversationId(conversation.id);
  renderTestChatThread(conversation);
}

async function loadAgentSettings() {
  state.agentSettings = await request("/api/admin/agent-settings");
  renderAgentSettingsForm();
}

function renderAgentSettingsForm() {
  const settings = state.agentSettings;
  if (!settings) {
    return;
  }

  document.getElementById("agent-business-name").value = settings.businessName || "";
  document.getElementById("agent-tone").value = settings.tone || "";
  document.getElementById("agent-delivery-info").value = settings.deliveryInfo || "";
  document.getElementById("agent-return-policy").value = settings.returnPolicy || "";
  document.getElementById("agent-system-prompt-extra").value = settings.systemPromptExtra || "";
  document.getElementById("agent-welcome-message").value = settings.welcomeMessage || "";
  renderAgentSettingsTokenHint();
}

// Mirrors the server: policies over 300 characters are fetched on demand
// instead of being sent with every call.
const INLINE_POLICY_CHARS = 300;

function renderAgentSettingsTokenHint() {
  const hint = document.getElementById("agent-settings-token-hint");
  if (!hint) {
    return;
  }

  const inline = (id) => {
    const value = document.getElementById(id).value.trim();
    return value.length > INLINE_POLICY_CHARS ? 30 : value.length;
  };
  const chars =
    document.getElementById("agent-business-name").value.length +
    document.getElementById("agent-tone").value.length +
    inline("agent-delivery-info") +
    inline("agent-return-policy") +
    document.getElementById("agent-system-prompt-extra").value.trim().length;

  hint.textContent = `These settings add about ${Math.ceil(chars / 4)} tokens to every AI call. Delivery or return text over ${INLINE_POLICY_CHARS} characters is only fetched when a customer asks.`;
}

agentSettingsForm?.addEventListener("input", renderAgentSettingsTokenHint);

const METRIC_GROUP_LABELS = {
  answer: "Answered directly",
  catalog: "Product search / details",
  save_details: "Saved order details",
  order: "Placed order",
  handoff: "Handed to staff",
  new_order: "Started new order",
  store_info: "Store policy lookup",
  fallback: "AI failed (fallback sent)",
  static: "Instant welcome",
  unknown: "Other",
  NONE: "Instant (no AI call)",
};

function formatMetricGroup(value) {
  return METRIC_GROUP_LABELS[value] || formatStatusLabel(value);
}

function formatMetricNumber(value) {
  return Number(value || 0).toLocaleString();
}

function renderAgentMetrics(metrics) {
  const panel = document.getElementById("agent-metrics-panel");
  if (!panel) {
    return;
  }

  if (!metrics.replies.count) {
    panel.innerHTML = '<div class="muted">No AI replies in this period yet.</div>';
    return;
  }

  const { replies, modelCalls } = metrics;
  const breakdown = modelCalls.avgInputBreakdown;
  const groupRows = (rows, key) =>
    rows
      .sort((a, b) => b.replies - a.replies)
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(formatMetricGroup(row[key]))}</td>
            <td>${formatMetricNumber(row.replies)}</td>
            <td>${formatMetricNumber(row.tokens.avg)}</td>
            <td>${formatMetricNumber(row.tokens.p95)}</td>
            <td>${(row.avgLatencyMs / 1000).toFixed(1)}s</td>
            <td>${row.avgModelCalls}</td>
          </tr>`
      )
      .join("");
  const groupTable = (title, rows, key) => `
    <div class="table-card metrics-table">
      <table>
        <thead><tr><th>${title}</th><th>Replies</th><th>Avg tokens</th><th>P95 tokens</th><th>Avg latency</th><th>Calls/reply</th></tr></thead>
        <tbody>${groupRows(rows, key)}</tbody>
      </table>
    </div>`;

  panel.classList.remove("muted");
  panel.innerHTML = `
    <div class="metrics-grid">
      <div class="metric-tile"><span>Replies</span><strong>${formatMetricNumber(replies.count)}</strong><small>${formatMetricNumber(replies.instantReplies)} instant (no AI call)</small></div>
      <div class="metric-tile"><span>Tokens per reply</span><strong>${formatMetricNumber(replies.totalTokens.avg)}</strong><small>median ${formatMetricNumber(replies.totalTokens.median)} · p95 ${formatMetricNumber(replies.totalTokens.p95)}</small></div>
      <div class="metric-tile"><span>Latency per reply</span><strong>${(replies.latencyMs.avg / 1000).toFixed(1)}s</strong><small>p95 ${(replies.latencyMs.p95 / 1000).toFixed(1)}s</small></div>
      <div class="metric-tile"><span>AI calls per reply</span><strong>${replies.avgModelCalls}</strong><small>${replies.avgToolCalls} tool calls per reply</small></div>
    </div>
    <div class="muted metrics-note">Average input per AI call (estimated): rules ${formatMetricNumber(breakdown.systemRules)} · customer state ${formatMetricNumber(breakdown.dynamicContext)} · history ${formatMetricNumber(breakdown.history)} · tools ${formatMetricNumber(breakdown.tools)} tokens. Tool use: ${
      metrics.toolFrequency.map((entry) => `${escapeHtml(entry.tool)} ${entry.count}`).join(", ") || "none"
    }.</div>
    ${groupTable("Request type", metrics.byRequestType, "requestType")}
    ${groupTable("Stage", metrics.byStage, "stage")}
  `;
}

async function loadAgentMetrics() {
  try {
    renderAgentMetrics(await request("/api/admin/agent-metrics?days=7"));
  } catch (error) {
    const panel = document.getElementById("agent-metrics-panel");
    if (panel) {
      panel.textContent = `Couldn't load usage: ${error.message}`;
    }
  }
}

document.getElementById("agent-metrics-refresh")?.addEventListener("click", loadAgentMetrics);

async function loadOrderDetail(orderId, options = {}) {
  const order = await request(`/api/admin/orders/${orderId}`);
  renderOrderDetail(order);
  setView("order-detail");

  if (!options.skipHistory) {
    window.history.pushState({ view: "order-detail", orderId }, "", buildOrderDetailUrl(orderId));
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function ensureViewData(viewName) {
  if (viewName === "orders" && !state.loadedViews.orders) {
    await loadOrders(1);
    state.loadedViews.orders = true;
  }

  if (viewName === "overview" && !state.loadedViews.overview) {
    await loadInsights();
    state.loadedViews.overview = true;
  }

  if (viewName === "products" && !state.loadedViews.products) {
    await loadProducts();
    state.loadedViews.products = true;
  }

  if (viewName === "conversations" && !state.loadedViews.conversations) {
    await loadConversations();
    state.loadedViews.conversations = true;
  }

  if (viewName === "test-chat" && !state.loadedViews["test-chat"]) {
    await loadTestChatHistory();
    state.loadedViews["test-chat"] = true;
  }

  if (viewName === "agent-settings" && !state.loadedViews["agent-settings"]) {
    await loadAgentSettings();
    state.loadedViews["agent-settings"] = true;
  }

  if (viewName === "agent-settings") {
    loadAgentMetrics();
  }
}

function resetProductForm() {
  productForm.reset();
  document.getElementById("product-id").value = "";
  document.getElementById("product-active").checked = true;
  productFormTitle.textContent = "Add New Product";
  productImageInput.value = "";
  productImageUploadInput.value = "";
  state.productConfig = defaultProductConfig();
  state.selectedAttributeIndex = -1;
  renderProductConfiguration();
  renderProductImagePreview("");
  setProductStep("basic");
}

function fillProductForm(product) {
  document.getElementById("product-id").value = product.id;
  document.getElementById("product-title").value = product.title;
  document.getElementById("product-price").value = product.basePrice;
  productImageInput.value = product.imageUrl || "";
  productImageUploadInput.value = "";
  document.getElementById("product-description").value = product.description || "";
  document.getElementById("product-active").checked = product.isActive;
  state.productConfig = {
    attributes: product.attributes || [],
    pricing: product.pricing || { priceType: "Flat", replaceExistingRules: true },
    pricingRules: product.pricingRules || [],
    addons: product.addons || [],
    uploadConfig: {
      ...defaultProductConfig().uploadConfig,
      ...(product.uploadConfig || {}),
    },
  };
  state.selectedAttributeIndex = state.productConfig.attributes.length ? 0 : -1;
  productFormTitle.textContent = `Edit Product: ${product.title}`;
  renderProductConfiguration();
  renderProductImagePreview(product.imageUrl || "", product.title || "Product image");
  setProductStep("basic");
  setView("product-form");
}

async function bootstrapApp() {
  clearFeedback();
  state.loadedViews = {
    orders: false,
    overview: false,
    products: false,
    conversations: false,
    "test-chat": false,
    "agent-settings": false,
  };
  await loadAdminProfile();
  startHandoffPolling();
  const route = getAdminRoute();
  await ensureViewData("orders");
  setView("orders");

  if (route.view === "order-detail" && route.orderId) {
    state.pagination.page = route.page;
    await loadOrders(route.page);
    await loadOrderDetail(route.orderId, { skipHistory: true });
  } else if (route.page > 1) {
    state.pagination.page = route.page;
    await loadOrders(route.page);
    window.history.replaceState({ view: "orders", page: route.page }, "", buildOrdersPageUrl(route.page));
  } else {
    window.history.replaceState({ view: "orders", page: 1 }, "", buildOrdersPageUrl(1));
  }

  resetProductForm();
}

async function handleLogin(event) {
  event.preventDefault();
  showAuthMessage("Verifying admin account...");

  try {
    const data = await request("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("login-email").value.trim(),
        password: document.getElementById("login-password").value,
      }),
    });

    persistAdminSession(data.accessToken, data.refreshToken);
    setAuthenticated(true);
    authMessage.classList.add("hidden");
    await bootstrapApp();
  } catch (error) {
    showAuthMessage(error.message, true);
  }
}

function logout() {
  persistAdminSession("", "");
  state.admin = null;
  setAuthenticated(false);
  showAuthMessage("Logged out successfully.");
}

function addAttribute() {
  const name = attributeNameInput.value.trim();
  if (!name) {
    showFeedback("Enter an attribute name.", true);
    return;
  }

  state.productConfig.attributes.push({
    AttributeName: name,
    Values: [],
    PricingRelevant: false,
  });
  state.selectedAttributeIndex = state.productConfig.attributes.length - 1;
  attributeNameInput.value = "";
  renderProductConfiguration();
}

function addAttributeValue() {
  const value = attributeValueInput.value.trim();
  const attribute = state.productConfig.attributes[state.selectedAttributeIndex];

  if (!attribute) {
    showFeedback("Select an attribute first.", true);
    return;
  }

  if (!value) {
    showFeedback("Enter a value for the selected attribute.", true);
    return;
  }

  if (!attribute.Values.includes(value)) {
    attribute.Values.push(value);
  }

  attributeValueInput.value = "";
  renderProductConfiguration();
}

function addPricingRule() {
  state.productConfig.pricingRules.push({
    RuleId: Date.now(),
    Conditions: [{ AttributeName: "", ValueName: "" }],
    Price: 0,
    Priority: state.productConfig.pricingRules.length + 1,
  });
  renderPricingSection();
}

function addInfoItem() {
  state.productConfig.uploadConfig.infoItems.push({
    title: "",
    value: "",
    sortOrder: state.productConfig.uploadConfig.infoItems.length + 1,
  });
  renderUploadPolicySection();
}

loginForm.addEventListener("submit", handleLogin);
addAttributeButton.addEventListener("click", addAttribute);
addAttributeValueButton.addEventListener("click", addAttributeValue);
addPricingRuleButton.addEventListener("click", addPricingRule);
addInfoItemButton.addEventListener("click", addInfoItem);
priceTypeSelect.addEventListener("change", () => {
  state.productConfig.pricing.priceType = priceTypeSelect.value;
  renderPricingSection();
});
productImageUploadInput.addEventListener("change", async () => {
  const file = productImageUploadInput.files?.[0];

  if (!file) {
    return;
  }

  productImageUploadInput.disabled = true;
  productImageStatus.textContent = `Uploading ${file.name}...`;

  try {
    const uploadedImage = await uploadProductImage(file);
    productImageInput.value = uploadedImage.url || "";
    renderProductImagePreview(uploadedImage.url || "", uploadedImage.filename || file.name);
    showFeedback("Product image uploaded successfully.");
  } catch (error) {
    productImageUploadInput.value = "";
    productImageInput.value = "";
    productImagePreview.classList.add("hidden");
    productImagePreview.innerHTML = "";
    productImageStatus.textContent = `Product image upload failed: ${error.message}`;
    showFeedback(error.message, true);
  } finally {
    productImageUploadInput.disabled = false;
  }
});
attributeSelect.addEventListener("change", () => {
  state.selectedAttributeIndex = Number(attributeSelect.value || -1);
  renderAttributesSection();
});
pricingRelevantCheckbox.addEventListener("change", () => {
  const attribute = state.productConfig.attributes[state.selectedAttributeIndex];
  if (!attribute) {
    return;
  }

  attribute.PricingRelevant = pricingRelevantCheckbox.checked;
  renderProductConfiguration();
});

navLinks.forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await ensureViewData(button.dataset.viewTarget);
      if (button.dataset.viewTarget === "product-form") {
        renderProductConfiguration();
        setProductStep(state.activeProductStep || "basic");
      }
      setView(button.dataset.viewTarget);
      if (button.dataset.viewTarget === "orders") {
        window.history.pushState({ view: "orders", page: state.pagination.page }, "", buildOrdersPageUrl());
      }
      if (window.innerWidth <= 840) {
        setSidebarOpen(false);
      }
    } catch (error) {
      showFeedback(error.message, true);
    }
  });
});

newProductButton?.addEventListener("click", () => {
  resetProductForm();
  setView("product-form");
});

sidebarToggle?.addEventListener("click", () => {
  const isCollapsed = sidebar.classList.contains("collapsed");
  setSidebarOpen(isCollapsed);
});

document.getElementById("logout-button").addEventListener("click", logout);
document.getElementById("swagger-button").addEventListener("click", () => {
  window.location.href = "/docs";
});

document.getElementById("refresh-dashboard").addEventListener("click", async () => {
  try {
    await Promise.all([
      loadOrders(state.pagination.page),
      state.loadedViews.overview ? loadInsights() : Promise.resolve(),
      state.loadedViews.products ? loadProducts() : Promise.resolve(),
      state.loadedViews.conversations ? loadConversations() : Promise.resolve(),
    ]);
    showFeedback("Dashboard refreshed.");
  } catch (error) {
    showFeedback(error.message, true);
  }
});

orderSearchInput.addEventListener("input", async () => {
  try {
    await loadOrders(1);
  } catch (error) {
    showFeedback(error.message, true);
  }
});

orderStatusFilter.addEventListener("change", async () => {
  try {
    await loadOrders(1);
  } catch (error) {
    showFeedback(error.message, true);
  }
});

orderPaymentFilter.addEventListener("change", () => {
  renderOrders();
});

productSearchInput?.addEventListener("input", () => {
  state.productSearch = productSearchInput.value || "";
  renderProducts();
});

conversationStatusFilter?.addEventListener("change", async () => {
  try {
    await loadConversations();
  } catch (error) {
    showFeedback(error.message, true);
  }
});

conversationSearchInput?.addEventListener("input", async () => {
  try {
    await loadConversations();
  } catch (error) {
    showFeedback(error.message, true);
  }
});

document.body.addEventListener("submit", async (event) => {
  const replyForm = event.target.closest("#conversation-reply-form");

  if (!replyForm) {
    return;
  }

  event.preventDefault();
  const input = document.getElementById("conversation-reply-input");
  const message = input.value.trim();

  if (!message) {
    return;
  }

  try {
    await request(`/api/admin/conversations/${replyForm.dataset.conversationId}/reply`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    input.value = "";
    await loadConversationDetail(replyForm.dataset.conversationId);
  } catch (error) {
    showFeedback(error.message, true);
  }
});

testChatForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = testChatInput.value.trim();

  if (!message) {
    return;
  }

  testChatInput.value = "";
  testChatInput.disabled = true;

  try {
    await sendTestChatMessage(message);
  } catch (error) {
    showFeedback(error.message, true);
  } finally {
    testChatInput.disabled = false;
    testChatInput.focus();
  }
});

testChatResetButton?.addEventListener("click", () => {
  setTestChatConversationId(null);
  renderTestChatThread(null);
  showFeedback("Started a new test conversation.");
});

agentSettingsForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    state.agentSettings = await request("/api/admin/agent-settings", {
      method: "PUT",
      body: JSON.stringify({
        businessName: document.getElementById("agent-business-name").value.trim(),
        tone: document.getElementById("agent-tone").value.trim(),
        deliveryInfo: document.getElementById("agent-delivery-info").value.trim() || null,
        returnPolicy: document.getElementById("agent-return-policy").value.trim() || null,
        systemPromptExtra: document.getElementById("agent-system-prompt-extra").value.trim() || null,
        welcomeMessage: document.getElementById("agent-welcome-message").value.trim() || null,
      }),
    });
    showFeedback("Agent settings saved.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    showFeedback(error.message, true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});

prevPageButton.addEventListener("click", async () => {
  if (!state.pagination.hasPreviousPage) {
    return;
  }

  try {
    await loadOrders(state.pagination.page - 1);
  } catch (error) {
    showFeedback(error.message, true);
  }
});

nextPageButton.addEventListener("click", async () => {
  if (!state.pagination.hasNextPage) {
    return;
  }

  try {
    await loadOrders(state.pagination.page + 1);
  } catch (error) {
    showFeedback(error.message, true);
  }
});

document.body.addEventListener("click", async (event) => {
  const orderButton = event.target.closest("[data-order-open]");
  const previousOrderButton = event.target.closest("[data-previous-order-open]");
  const closeOrderDetailButton = event.target.closest("[data-close-order-detail]");
  const detailTabButton = event.target.closest("[data-detail-tab]");
  const editButton = event.target.closest("[data-product-edit]");
  const toggleButton = event.target.closest("[data-product-toggle]");
  const saveStatusButton = event.target.closest("#save-order-status");
  const attributePickButton = event.target.closest("[data-attribute-pick]");
  const attributeRemoveButton = event.target.closest("[data-attribute-remove]");
  const attributeValueRemoveButton = event.target.closest("[data-attribute-value-remove]");
  const ruleRemoveButton = event.target.closest("[data-rule-remove]");
  const infoRemoveButton = event.target.closest("[data-info-remove]");
  const conversationOpenRow = event.target.closest("[data-conversation-open]");
  const conversationTakeoverButton = event.target.closest("[data-conversation-takeover]");
  const conversationReleaseButton = event.target.closest("[data-conversation-release]");
  const conversationReengageButton = event.target.closest("[data-conversation-reengage]");

  try {
    if (conversationReengageButton) {
      const conversationId = conversationReengageButton.dataset.conversationReengage;
      conversationReengageButton.disabled = true;
      await request(`/api/admin/conversations/${conversationId}/reengage`, { method: "POST" });
      showFeedback("Re-engagement template sent. You can reply once the customer responds.");
      await loadConversationDetail(conversationId);
      return;
    }

    if (conversationOpenRow) {
      await loadConversationDetail(conversationOpenRow.dataset.conversationOpen);
      return;
    }

    if (conversationTakeoverButton) {
      await request(`/api/admin/conversations/${conversationTakeoverButton.dataset.conversationTakeover}/takeover`, {
        method: "POST",
      });
      showFeedback("Conversation taken over. The AI agent will not reply until you release it.");
      await loadConversations();
      await loadConversationDetail(conversationTakeoverButton.dataset.conversationTakeover);
      return;
    }

    if (conversationReleaseButton) {
      await request(`/api/admin/conversations/${conversationReleaseButton.dataset.conversationRelease}/release`, {
        method: "POST",
      });
      showFeedback("Conversation released back to the AI agent. It will answer any unanswered customer message.");
      await loadConversations();
      await loadConversationDetail(conversationReleaseButton.dataset.conversationRelease);
      return;
    }

    if (orderButton) {
      await loadOrderDetail(orderButton.dataset.orderOpen);
      clearFeedback();
      return;
    }

    if (previousOrderButton) {
      await loadOrderDetail(previousOrderButton.dataset.previousOrderOpen);
      clearFeedback();
      return;
    }

    if (closeOrderDetailButton) {
      setView("orders");
      window.history.pushState({ view: "orders", page: state.pagination.page }, "", buildOrdersPageUrl());
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (detailTabButton) {
      const targetTab = detailTabButton.dataset.detailTab;
      document.querySelectorAll("[data-detail-tab]").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.detailTab === targetTab);
      });
      document.querySelectorAll("[data-detail-panel]").forEach((panel) => {
        panel.classList.toggle("active", panel.dataset.detailPanel === targetTab);
      });
      return;
    }

    if (editButton) {
      const product = state.products.find((item) => item.id === editButton.dataset.productEdit);
      if (product) {
        fillProductForm(product);
      }
      return;
    }

    if (toggleButton) {
      await request(`/api/admin/products/${toggleButton.dataset.productToggle}`, {
        method: "PATCH",
        body: JSON.stringify({
          isActive: toggleButton.dataset.nextActive === "true",
        }),
      });
      showFeedback("Product availability updated.");
      await Promise.all([
        loadProducts(),
        state.loadedViews.overview ? loadInsights() : Promise.resolve(),
      ]);
      state.loadedViews.products = true;
      return;
    }

    if (saveStatusButton) {
      const status = document.getElementById("order-status-update").value;
      await request(`/api/admin/orders/${saveStatusButton.dataset.orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      showFeedback("Order status updated.");
      await Promise.all([
        loadOrders(state.pagination.page),
        state.loadedViews.overview ? loadInsights() : Promise.resolve(),
        loadOrderDetail(saveStatusButton.dataset.orderId),
      ]);
      state.loadedViews.orders = true;
      return;
    }

    if (attributePickButton) {
      state.selectedAttributeIndex = Number(attributePickButton.dataset.attributePick);
      renderAttributesSection();
      return;
    }

    if (attributeRemoveButton) {
      const index = Number(attributeRemoveButton.dataset.attributeRemove);
      state.productConfig.attributes.splice(index, 1);
      if (state.selectedAttributeIndex >= state.productConfig.attributes.length) {
        state.selectedAttributeIndex = state.productConfig.attributes.length - 1;
      }
      renderProductConfiguration();
      return;
    }

    if (attributeValueRemoveButton) {
      const attribute = state.productConfig.attributes[state.selectedAttributeIndex];
      if (attribute) {
        attribute.Values.splice(Number(attributeValueRemoveButton.dataset.attributeValueRemove), 1);
        renderProductConfiguration();
      }
      return;
    }

    if (ruleRemoveButton) {
      state.productConfig.pricingRules.splice(Number(ruleRemoveButton.dataset.ruleRemove), 1);
      renderPricingSection();
      return;
    }

    if (infoRemoveButton) {
      state.productConfig.uploadConfig.infoItems.splice(Number(infoRemoveButton.dataset.infoRemove), 1);
      renderUploadPolicySection();
    }
  } catch (error) {
    if (error.message === "Invalid or expired token" || error.message === "Authentication required") {
      logout();
    }
    showFeedback(error.message, true);
  }
});

document.body.addEventListener("change", (event) => {
  const ruleAttribute = event.target.closest("[data-rule-attribute]");
  const ruleValue = event.target.closest("[data-rule-value]");
  const rulePrice = event.target.closest("[data-rule-price]");
  const rulePriority = event.target.closest("[data-rule-priority]");
  const infoTitle = event.target.closest("[data-info-title]");
  const infoValue = event.target.closest("[data-info-value]");
  const infoOrder = event.target.closest("[data-info-order]");
  const documentType = event.target.closest("[data-document-type]");

  if (ruleAttribute) {
    const rule = state.productConfig.pricingRules[Number(ruleAttribute.dataset.ruleAttribute)];
    rule.Conditions[0] = {
      AttributeName: ruleAttribute.value,
      ValueName: "",
    };
    renderPricingSection();
    return;
  }

  if (ruleValue) {
    const rule = state.productConfig.pricingRules[Number(ruleValue.dataset.ruleValue)];
    rule.Conditions[0].ValueName = ruleValue.value;
    renderPricingSection();
    return;
  }

  if (rulePrice) {
    const rule = state.productConfig.pricingRules[Number(rulePrice.dataset.rulePrice)];
    rule.Price = Number(rulePrice.value || 0);
    return;
  }

  if (rulePriority) {
    const rule = state.productConfig.pricingRules[Number(rulePriority.dataset.rulePriority)];
    rule.Priority = Number(rulePriority.value || 1);
    return;
  }

  if (infoTitle) {
    state.productConfig.uploadConfig.infoItems[Number(infoTitle.dataset.infoTitle)].title = infoTitle.value;
    return;
  }

  if (infoValue) {
    state.productConfig.uploadConfig.infoItems[Number(infoValue.dataset.infoValue)].value = infoValue.value;
    return;
  }

  if (infoOrder) {
    state.productConfig.uploadConfig.infoItems[Number(infoOrder.dataset.infoOrder)].sortOrder = Number(
      infoOrder.value || 1
    );
    return;
  }

  if (documentType) {
    readUploadConfigFromForm();
  }
});

productForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const isExistingProduct = Boolean(document.getElementById("product-id").value);
    await saveCurrentProduct(isExistingProduct ? "Product updated successfully." : "Product created successfully.");
    resetProductForm();
    state.loadedViews.products = true;
    setView("products");
  } catch (error) {
    showFeedback(error.message, true);
  }
});

document.getElementById("reset-product-form").addEventListener("click", resetProductForm);

productStepNav?.addEventListener("click", (event) => {
  const stepButton = event.target.closest("[data-step-target]");

  if (!stepButton) {
    return;
  }

  setProductStep(stepButton.dataset.stepTarget);
});

document.body.addEventListener("click", (event) => {
  const nextStepButton = event.target.closest("[data-step-next]");
  const prevStepButton = event.target.closest("[data-step-prev]");

  if (nextStepButton) {
    setProductStep(nextStepButton.dataset.stepNext);
    return;
  }

  if (prevStepButton) {
    setProductStep(prevStepButton.dataset.stepPrev);
  }
});

(async () => {
  if (!state.token) {
    setAuthenticated(false);
    setSidebarOpen(false);
    resetProductForm();
    return;
  }

  try {
    setAuthenticated(true);
    setSidebarOpen(false);
    await bootstrapApp();
  } catch (error) {
    logout();
    showAuthMessage(error.message, true);
  }
})();

window.addEventListener("popstate", async () => {
  if (!state.token) {
    return;
  }

  const route = getAdminRoute();

  try {
    if (route.view === "order-detail" && route.orderId) {
      await ensureViewData("orders");
      await loadOrderDetail(route.orderId, { skipHistory: true });
      return;
    }

    await ensureViewData("orders");
    if (route.page !== state.pagination.page) {
      await loadOrders(route.page);
    }
    setView("orders");
  } catch (error) {
    showFeedback(error.message, true);
  }
});
